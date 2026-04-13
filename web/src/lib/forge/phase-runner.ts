import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  runAgent,
  type ApprovalRequest,
  type ApprovalDecision,
  type OnApproval,
} from "./agent-runner";
import { readFile, rename } from "node:fs/promises";
import {
  sessionStore,
  type PhaseFlags,
  type SessionInputs,
  type DesignStudyInputs,
} from "./session-store";
import {
  buildPlanAutoplanPrompt,
  buildInitAppPrompt,
  buildSeedDemoPrompt,
  buildFeatureContinuePrompt,
  buildQaTestPrompt,
  buildDesignStudyPrompt,
} from "./worker";
import { ensureGlobalErrorValid } from "./verify-global-error";
import {
  readSidecar,
  applySidecarToTokensJson,
  snapshotTokens,
  restoreTokens,
  startWebDevServer,
  stopDevServer,
} from "./design-apply";

// PHASE RUNNER — v0.1.3 architectural refactor.
//
// Why this exists: the old `startWorker()` chained every forge phase (plan
// review → /init-app → seed-demo → implement features → verify builds) in
// one long-running `void async` IIFE. That worked in production but was
// fragile in dev mode because Next.js Turbopack HMR could reload `worker.ts`
// mid-run, leaving the IIFE with closures over stale function references
// and no way to recover. Worse, any silent exception in the IIFE killed
// the whole chain with no visible error.
//
// This module splits each phase into its own exported function with its
// own fire-and-forget IIFE. Phase transitions happen via HTTP POST to
// /api/v1/forge/sessions/[id]/run-phase — so the next phase loads a fresh
// module via Next.js routing every time. HMR applies cleanly per hop.
//
// The phase ordering is driven by `session.phaseFlags`, which is stored on
// the session at creation time. Any phase handler can look up the flags
// from the session store (without needing args passed through) and
// determine the next phase via `getNextPhase()`.

console.log(
  "[phase-runner] module loaded: 2026-04-11 http-chain phase runner",
);

export type PhaseName =
  | "plan-review"
  | "init-app"
  | "seed-demo"
  | "implement-features"
  | "verify-builds"
  | "qa-test"
  | "design-study"
  | "design-apply";

// Bootstrap pipeline. `design-study` is a standalone single-phase flow for
// the /forge/design page; when run as a prelude on a bootstrap session it
// emits the sidecar and chains into `design-apply`, which applies the
// sidecar to tokens, spins up a dev server, and pauses for approval before
// `implement-features` so features get built against the studied design.
const PHASE_ORDER: PhaseName[] = [
  "plan-review",
  "init-app",
  "design-apply",
  "seed-demo",
  "implement-features",
  "verify-builds",
  "qa-test",
];

/**
 * Given the current phase and the session's phase flags, return the name
 * of the phase that should run next (or null if this is the final phase).
 * Skips phases whose flags are false. Respects the canonical order:
 *   plan-review → init-app → seed-demo → implement-features → verify-builds → qa-test
 */
export function getNextPhase(
  current: PhaseName,
  flags: PhaseFlags,
  opts: { hasDesignStudy?: boolean } = {},
): PhaseName | null {
  const currentIdx = PHASE_ORDER.indexOf(current);
  for (let i = currentIdx + 1; i < PHASE_ORDER.length; i++) {
    const next = PHASE_ORDER[i];
    if (next === "plan-review" && flags.planReview) return next;
    if (next === "init-app") return next; // always runs
    if (next === "design-apply" && opts.hasDesignStudy) return next;
    if (next === "seed-demo" && flags.seedDemo) return next;
    if (next === "implement-features" && flags.implementFeatures) return next;
    if (next === "verify-builds" && flags.verifyBuilds) return next;
    if (next === "qa-test" && flags.qaTest) return next;
  }
  return null;
}

/**
 * Given phase flags, return the FIRST phase to run on session creation.
 * Plan-review is the only phase that can come before init-app; everything
 * else follows init-app.
 */
export function getFirstPhase(flags: PhaseFlags): PhaseName {
  return flags.planReview ? "plan-review" : "init-app";
}

/**
 * Fire-and-forget HTTP POST to the /run-phase endpoint for the given
 * session + phase. This is the mechanism that triggers the next phase in
 * a fresh Next.js route-handler context, ensuring HMR reloads apply.
 *
 * The fetch is fire-and-forget — we don't wait for the phase to finish,
 * we just want to hand off control. The target route returns 202
 * immediately after starting its own IIFE.
 *
 * Base URL comes from `session.baseUrl` (set at session creation time
 * from the incoming request's `URL.origin`). Falls back to
 * `FORGE_BASE_URL` env var and then `http://localhost:3000` — but the
 * session-stored value is the canonical source because it matches the
 * actual port the Next.js dev server is running on, even if that's
 * non-standard (e.g., 3001, 3002, …).
 */
export async function triggerNextPhase(
  sessionId: string,
  phase: PhaseName,
): Promise<void> {
  try {
    // Short-circuit check: is the session still alive? If the user hit
    // Discard or the store was reset, don't fire a dead request.
    const session = sessionStore.get(sessionId);
    if (!session) {
      console.warn(
        `[phase-runner] triggerNextPhase: session ${sessionId} not in store, aborting trigger`,
      );
      return;
    }

    const baseUrl =
      session.baseUrl ||
      process.env.FORGE_BASE_URL ||
      "http://localhost:3000";
    const url = `${baseUrl}/api/v1/forge/sessions/${sessionId}/run-phase`;
    console.log(
      `[phase-runner] triggerNextPhase: POST ${url} phase=${phase}`,
    );

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phase }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "(no body)");
      console.error(
        `[phase-runner] triggerNextPhase: HTTP ${res.status} for phase=${phase} session=${sessionId}: ${body.slice(0, 500)}`,
      );
      sessionStore.fail(
        sessionId,
        `Failed to trigger next phase (${phase}): HTTP ${res.status}`,
      );
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(
      `[phase-runner] triggerNextPhase: fetch threw for phase=${phase} session=${sessionId}: ${message}`,
    );
    sessionStore.fail(
      sessionId,
      `Failed to trigger next phase (${phase}): ${message}`,
    );
  }
}

/**
 * Advance the session chain: compute the next phase from the current
 * phase + session flags, and either fire `triggerNextPhase()` or set the
 * session to `ready` if there's nothing left to run.
 */
async function advanceOrFinish(
  sessionId: string,
  completedPhase: PhaseName,
): Promise<void> {
  const session = sessionStore.get(sessionId);
  if (!session) {
    console.warn(
      `[phase-runner] advanceOrFinish: session ${sessionId} missing from store`,
    );
    return;
  }
  const next = getNextPhase(completedPhase, session.phaseFlags, {
    hasDesignStudy: !!session.designStudyInputs,
  });
  if (next) {
    console.log(
      `[phase-runner] advanceOrFinish: ${sessionId} ${completedPhase} → ${next}`,
    );
    await triggerNextPhase(sessionId, next);
  } else {
    console.log(
      `[phase-runner] advanceOrFinish: ${sessionId} ${completedPhase} → ready (no more phases)`,
    );
    sessionStore.setStatus(sessionId, "ready");
  }
}

// ---------------------------------------------------------------------------
// Shared approval callback — same logic that used to live in worker.ts's
// startWorker IIFE. Each phase uses the same approval handler since they
// all route through runAgent() with the same permission model.
// ---------------------------------------------------------------------------

function makeOnApproval(sessionId: string): OnApproval {
  return async (req: ApprovalRequest): Promise<ApprovalDecision> => {
    const approvalId = randomUUID();
    const decision = await new Promise<{ approved: boolean; note?: string }>(
      (resolve) => {
        sessionStore.registerApproval(sessionId, {
          approvalId,
          title: req.title ?? req.displayName ?? `Run ${req.toolName}`,
          body: req.decisionReason ?? JSON.stringify(req.input, null, 2),
          resolve,
        });
        sessionStore.appendEvent(sessionId, "approval_request", {
          approvalId,
          toolName: req.toolName,
          title: req.title,
          displayName: req.displayName,
          input: req.input,
          blockedPath: req.blockedPath,
          decisionReason: req.decisionReason,
        });
        sessionStore.setStatus(sessionId, "awaiting_approval");
      },
    );
    sessionStore.setStatus(sessionId, "bootstrapping");
    return decision.approved
      ? { behavior: "allow" }
      : {
          behavior: "deny",
          message:
            decision.note && decision.note.length > 0
              ? `Rejected by user: ${decision.note}`
              : "Rejected by user via forge approval gate.",
        };
  };
}

// ---------------------------------------------------------------------------
// Phase dispatcher — called by the /run-phase route handler. Each phase
// has its own function that wraps a fire-and-forget IIFE.
// ---------------------------------------------------------------------------

export function startPhase(phase: PhaseName, sessionId: string): void {
  const session = sessionStore.get(sessionId);
  if (!session) {
    console.error(
      `[phase-runner] startPhase: session ${sessionId} not found`,
    );
    return;
  }

  if (phase === "design-study") {
    const studyInputs = session.designStudyInputs;
    if (!studyInputs) {
      sessionStore.fail(
        sessionId,
        "design-study phase invoked but session has no designStudyInputs",
      );
      return;
    }
    startDesignStudyPhase({
      sessionId,
      worktreePath: session.worktreePath,
      studyInputs,
    });
    return;
  }

  const ctx: PhaseContext = {
    sessionId,
    worktreePath: session.worktreePath,
    inputs: session.inputs,
    flags: session.phaseFlags,
  };

  switch (phase) {
    case "plan-review":
      startPlanReviewPhase(ctx);
      break;
    case "init-app":
      startInitAppPhase(ctx);
      break;
    case "seed-demo":
      startSeedDemoPhase(ctx);
      break;
    case "implement-features":
      startImplementFeaturesPhase(ctx);
      break;
    case "verify-builds":
      startVerifyBuildsPhase(ctx);
      break;
    case "qa-test":
      startQaTestPhase(ctx);
      break;
    case "design-apply":
      startDesignApplyPhase({
        sessionId,
        worktreePath: session.worktreePath,
        studyTimestampDir: session.designStudyTimestampDir,
      });
      break;
    default: {
      const exhaustive: never = phase;
      console.error(`[phase-runner] startPhase: unknown phase ${exhaustive}`);
    }
  }
}

interface PhaseContext {
  sessionId: string;
  worktreePath: string;
  inputs: SessionInputs;
  flags: PhaseFlags;
}

interface DesignStudyPhaseContext {
  sessionId: string;
  worktreePath: string;
  studyInputs: DesignStudyInputs;
}

// ---------------------------------------------------------------------------
// Plan review phase
// ---------------------------------------------------------------------------

function startPlanReviewPhase(ctx: PhaseContext): void {
  const abortController = new AbortController();
  sessionStore.setAbortController(ctx.sessionId, abortController);
  sessionStore.setStatus(ctx.sessionId, "bootstrapping");
  sessionStore.appendEvent(ctx.sessionId, "step_start", {
    phase: "plan-review",
    message: "Running /plan-autoplan (five-role planning review)…",
  });
  const onApproval = makeOnApproval(ctx.sessionId);

  void (async () => {
    const log = (...parts: unknown[]) =>
      console.log(`[phase-runner plan-review ${ctx.sessionId}]`, ...parts);
    log("starting");
    const start = Date.now();
    try {
      const result = await runAgent({
        cwd: ctx.worktreePath,
        prompt: buildPlanAutoplanPrompt(),
        sessionId: ctx.sessionId,
        abortController,
        onApproval,
        permissionMode: "default",
        maxTurns: 40,
        maxBudgetUsd: 1.5,
      });
      log(
        `runAgent returned completed=${result.completed} turns=${result.numTurns ?? "?"} cost=${result.totalCostUsd ?? "?"}`,
      );
      sessionStore.appendEvent(ctx.sessionId, "step_complete", {
        phase: "plan-review",
        status: result.completed ? "passed" : "failed",
        durationMs: Date.now() - start,
        totalCostUsd: result.totalCostUsd,
        numTurns: result.numTurns,
        errorMessage: result.errorMessage,
      });
      if (!result.completed) {
        sessionStore.fail(
          ctx.sessionId,
          result.errorMessage ?? "Plan review did not complete",
        );
        return;
      }
      await advanceOrFinish(ctx.sessionId, "plan-review");
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      log(`threw — failing session: ${message}`);
      sessionStore.fail(ctx.sessionId, message);
    } finally {
      sessionStore.setAbortController(ctx.sessionId, null);
    }
  })();
}

// ---------------------------------------------------------------------------
// Init-app phase — the main rename + spec-drafting pass
// ---------------------------------------------------------------------------

function startInitAppPhase(ctx: PhaseContext): void {
  const abortController = new AbortController();
  sessionStore.setAbortController(ctx.sessionId, abortController);
  sessionStore.setStatus(ctx.sessionId, "bootstrapping");
  sessionStore.appendEvent(ctx.sessionId, "step_start", {
    phase: "init-app",
    message: "Running /init-app (rename + spec drafts)…",
  });
  const onApproval = makeOnApproval(ctx.sessionId);

  void (async () => {
    const log = (...parts: unknown[]) =>
      console.log(`[phase-runner init-app ${ctx.sessionId}]`, ...parts);
    log("starting");
    const start = Date.now();
    try {
      const result = await runAgent({
        cwd: ctx.worktreePath,
        prompt: buildInitAppPrompt(ctx.inputs),
        sessionId: ctx.sessionId,
        abortController,
        onApproval,
        permissionMode: "default",
        maxTurns: 120,
        maxBudgetUsd: 3,
      });
      log(
        `runAgent returned completed=${result.completed} turns=${result.numTurns ?? "?"} cost=${result.totalCostUsd ?? "?"}`,
      );
      sessionStore.appendEvent(ctx.sessionId, "step_complete", {
        phase: "init-app",
        status: result.completed ? "passed" : "failed",
        durationMs: Date.now() - start,
        totalCostUsd: result.totalCostUsd,
        numTurns: result.numTurns,
        errorMessage: result.errorMessage,
      });
      if (!result.completed) {
        sessionStore.fail(
          ctx.sessionId,
          result.errorMessage ?? "Init-app did not complete",
        );
        return;
      }
      await advanceOrFinish(ctx.sessionId, "init-app");
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      log(`threw — failing session: ${message}`);
      sessionStore.fail(ctx.sessionId, message);
    } finally {
      sessionStore.setAbortController(ctx.sessionId, null);
    }
  })();
}

// ---------------------------------------------------------------------------
// Seed-demo phase (non-fatal on failure)
// ---------------------------------------------------------------------------

function startSeedDemoPhase(ctx: PhaseContext): void {
  const abortController = new AbortController();
  sessionStore.setAbortController(ctx.sessionId, abortController);
  sessionStore.setStatus(ctx.sessionId, "bootstrapping");
  sessionStore.appendEvent(ctx.sessionId, "step_start", {
    phase: "seed-demo",
    message: "Running /seed-demo (Faker-powered DB fixtures)…",
  });
  const onApproval = makeOnApproval(ctx.sessionId);

  void (async () => {
    const log = (...parts: unknown[]) =>
      console.log(`[phase-runner seed-demo ${ctx.sessionId}]`, ...parts);
    log("starting");
    const start = Date.now();
    try {
      const result = await runAgent({
        cwd: ctx.worktreePath,
        prompt: buildSeedDemoPrompt(),
        sessionId: ctx.sessionId,
        abortController,
        onApproval,
        permissionMode: "default",
        maxTurns: 20,
        maxBudgetUsd: 0.5,
      });
      log(
        `runAgent returned completed=${result.completed} turns=${result.numTurns ?? "?"} cost=${result.totalCostUsd ?? "?"}`,
      );
      sessionStore.appendEvent(ctx.sessionId, "step_complete", {
        phase: "seed-demo",
        status: result.completed ? "passed" : "failed",
        durationMs: Date.now() - start,
        totalCostUsd: result.totalCostUsd,
        numTurns: result.numTurns,
        errorMessage: result.errorMessage,
      });
      if (!result.completed) {
        // Non-fatal — emit a warning event, continue to the next phase.
        sessionStore.appendEvent(ctx.sessionId, "error", {
          message: `Seed-demo failed (non-fatal): ${
            result.errorMessage ?? "unknown error"
          }`,
        });
      }
      await advanceOrFinish(ctx.sessionId, "seed-demo");
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      log(`threw — non-fatal, advancing: ${message}`);
      sessionStore.appendEvent(ctx.sessionId, "error", {
        message: `Seed-demo threw (non-fatal): ${message}`,
      });
      await advanceOrFinish(ctx.sessionId, "seed-demo");
    } finally {
      sessionStore.setAbortController(ctx.sessionId, null);
    }
  })();
}

// ---------------------------------------------------------------------------
// Implement-features phase — sequential /feature continue runs, one per
// spec file in specs/features/. Fail-hard.
// ---------------------------------------------------------------------------

function startImplementFeaturesPhase(ctx: PhaseContext): void {
  const abortController = new AbortController();
  sessionStore.setAbortController(ctx.sessionId, abortController);
  sessionStore.setStatus(ctx.sessionId, "building");
  const onApproval = makeOnApproval(ctx.sessionId);

  void (async () => {
    const log = (...parts: unknown[]) =>
      console.log(`[phase-runner implement ${ctx.sessionId}]`, ...parts);
    log("starting");
    try {
      const specsDir = join(ctx.worktreePath, "specs", "features");
      let specFiles: string[] = [];
      try {
        const entries = await readdir(specsDir);
        specFiles = entries
          .filter((f) => f.endsWith(".md") && f !== "_template.md")
          .sort();
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        log(`specs dir unreadable: ${message}`);
        sessionStore.appendEvent(ctx.sessionId, "step_complete", {
          phase: "implement",
          status: "skipped",
          message: `specs/features/ unreadable — nothing to implement`,
        });
        await advanceOrFinish(ctx.sessionId, "implement-features");
        return;
      }

      if (specFiles.length === 0) {
        log("no specs found, skipping phase");
        sessionStore.appendEvent(ctx.sessionId, "step_complete", {
          phase: "implement",
          status: "skipped",
          message: "No spec files in specs/features/",
        });
        await advanceOrFinish(ctx.sessionId, "implement-features");
        return;
      }

      const slugs = specFiles.map((f) => f.replace(/\.md$/, ""));
      sessionStore.appendEvent(ctx.sessionId, "step_start", {
        phase: "implement",
        total: slugs.length,
        slugs,
        message: `Implementing ${slugs.length} feature${slugs.length === 1 ? "" : "s"} sequentially`,
      });
      log(`found ${slugs.length} specs: ${slugs.join(", ")}`);

      for (let i = 0; i < slugs.length; i++) {
        const slug = slugs[i];
        const idx = i + 1;
        log(`feature ${idx}/${slugs.length}: ${slug} — starting`);
        sessionStore.appendEvent(ctx.sessionId, "step_progress", {
          phase: "implement",
          slug,
          featureIndex: idx,
          featureTotal: slugs.length,
          status: "running",
        });
        const featureStart = Date.now();
        const result = await runAgent({
          cwd: ctx.worktreePath,
          prompt: buildFeatureContinuePrompt(slug, idx, slugs.length, ctx.flags.platformTarget, ctx.inputs.namespace),
          sessionId: ctx.sessionId,
          abortController,
          onApproval,
          permissionMode: "default",
          maxTurns: 80,
          maxBudgetUsd: 3,
        });
        log(
          `feature ${idx}/${slugs.length}: ${slug} completed=${result.completed}`,
        );
        if (!result.completed) {
          sessionStore.fail(
            ctx.sessionId,
            `Feature implementation failed at ${idx}/${slugs.length} (${slug}): ${result.errorMessage ?? "unknown error"}`,
          );
          return;
        }
        sessionStore.appendEvent(ctx.sessionId, "step_complete", {
          phase: "implement",
          slug,
          featureIndex: idx,
          featureTotal: slugs.length,
          status: "passed",
          durationMs: Date.now() - featureStart,
          totalCostUsd: result.totalCostUsd,
          numTurns: result.numTurns,
        });
      }

      sessionStore.appendEvent(ctx.sessionId, "step_complete", {
        phase: "implement",
        status: "all_passed",
        total: slugs.length,
      });
      log(`all ${slugs.length} features implemented`);
      await advanceOrFinish(ctx.sessionId, "implement-features");
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      log(`threw — failing session: ${message}`);
      sessionStore.fail(ctx.sessionId, message);
    } finally {
      sessionStore.setAbortController(ctx.sessionId, null);
    }
  })();
}

// ---------------------------------------------------------------------------
// Verify-builds phase — parallel web + Android + iOS builds. Fail-hard.
// ---------------------------------------------------------------------------

interface BuildVerifyResult {
  surface: "web" | "android" | "ios";
  ok: boolean;
  exitCode: number;
  durationMs: number;
  stderrTail: string;
}

function runBuildCommand(args: {
  sessionId: string;
  surface: "web" | "android" | "ios";
  cwd: string;
  command: string;
  commandArgs: string[];
  abortController: AbortController;
}): Promise<BuildVerifyResult> {
  return new Promise((resolve) => {
    const start = Date.now();
    sessionStore.appendEvent(args.sessionId, "step_progress", {
      phase: "verify",
      surface: args.surface,
      status: "running",
      command: `${args.command} ${args.commandArgs.join(" ")}`,
      cwd: args.cwd,
    });

    let child: ChildProcess;
    try {
      child = spawn(args.command, args.commandArgs, {
        cwd: args.cwd,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      sessionStore.appendEvent(args.sessionId, "step_complete", {
        phase: "verify",
        surface: args.surface,
        status: "failed",
        exitCode: -1,
        durationMs: Date.now() - start,
        stderrTail: `spawn failed: ${message}`,
      });
      resolve({
        surface: args.surface,
        ok: false,
        exitCode: -1,
        durationMs: Date.now() - start,
        stderrTail: `spawn failed: ${message}`,
      });
      return;
    }

    let stderrBuf = "";
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      stderrBuf += chunk;
      if (stderrBuf.length > 8192) stderrBuf = stderrBuf.slice(-8192);
    });
    child.stdout?.on("data", () => {});

    const onAbort = () => {
      if (child.killed) return;
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!child.killed) child.kill("SIGKILL");
      }, 3000);
    };
    args.abortController.signal.addEventListener("abort", onAbort);

    child.on("close", (code) => {
      args.abortController.signal.removeEventListener("abort", onAbort);
      const exitCode = code ?? -1;
      const ok = exitCode === 0;
      const durationMs = Date.now() - start;
      const stderrTail = ok ? "" : stderrBuf.trim().slice(-1200);
      sessionStore.appendEvent(args.sessionId, "step_complete", {
        phase: "verify",
        surface: args.surface,
        status: ok ? "passed" : "failed",
        exitCode,
        durationMs,
        stderrTail: stderrTail || undefined,
      });
      resolve({
        surface: args.surface,
        ok,
        exitCode,
        durationMs,
        stderrTail,
      });
    });

    child.on("error", (e) => {
      args.abortController.signal.removeEventListener("abort", onAbort);
      const durationMs = Date.now() - start;
      const stderrTail = `child error: ${e.message}`;
      sessionStore.appendEvent(args.sessionId, "step_complete", {
        phase: "verify",
        surface: args.surface,
        status: "failed",
        exitCode: -1,
        durationMs,
        stderrTail,
      });
      resolve({
        surface: args.surface,
        ok: false,
        exitCode: -1,
        durationMs,
        stderrTail,
      });
    });
  });
}

function startVerifyBuildsPhase(ctx: PhaseContext): void {
  const abortController = new AbortController();
  sessionStore.setAbortController(ctx.sessionId, abortController);
  sessionStore.setStatus(ctx.sessionId, "verifying");
  sessionStore.appendEvent(ctx.sessionId, "step_start", {
    phase: "verify",
    surfaces: ["web", "android", "ios"],
    message:
      "Running build verification on web + Android + iOS in parallel.",
  });

  void (async () => {
    const log = (...parts: unknown[]) =>
      console.log(`[phase-runner verify ${ctx.sessionId}]`, ...parts);
    log("starting");
    try {
      // Pre-flight: `web/src/app/global-error.tsx` is a load-bearing Next.js
      // 16 invariant. A missing file, or one that imports any context
      // provider, crashes `next build` during prerender of /_global-error.
      // Auto-repair from canonical content if the contract fails.
      const guard = await ensureGlobalErrorValid(ctx.worktreePath);
      if (guard.repaired) {
        log(`global-error guard: auto-repaired (reason=${guard.reason})`);
        sessionStore.appendEvent(ctx.sessionId, "step_progress", {
          phase: "verify",
          surface: "global-error-guard",
          status: "repaired",
          message: `Auto-repaired web/src/app/global-error.tsx (reason: ${guard.reason}). Prevents /_global-error prerender crash.`,
        });
      } else if (!guard.ok) {
        log(`global-error guard: failed to repair (reason=${guard.reason})`);
        sessionStore.fail(
          ctx.sessionId,
          `Pre-flight failed on web/src/app/global-error.tsx: ${guard.reason}. Fix manually then re-run verify-builds.`,
        );
        return;
      }

      const webDir = join(ctx.worktreePath, "web");
      const mobileDir = join(ctx.worktreePath, "mobile");

      const results = await Promise.all([
        runBuildCommand({
          sessionId: ctx.sessionId,
          surface: "web",
          cwd: webDir,
          command: "bun",
          commandArgs: ["run", "build"],
          abortController,
        }),
        runBuildCommand({
          sessionId: ctx.sessionId,
          surface: "android",
          cwd: mobileDir,
          command: "./gradlew",
          commandArgs: [":composeApp:assembleDebug"],
          abortController,
        }),
        runBuildCommand({
          sessionId: ctx.sessionId,
          surface: "ios",
          cwd: mobileDir,
          command: "./gradlew",
          commandArgs: [":composeApp:linkDebugFrameworkIosSimulatorArm64"],
          abortController,
        }),
      ]);

      const failures = results.filter((r) => !r.ok);
      if (failures.length > 0) {
        const summary = failures
          .map((f) => `${f.surface} (exit ${f.exitCode})`)
          .join(", ");
        const detail = failures
          .map((f) => {
            const tail = f.stderrTail ? `\n${f.stderrTail.slice(-300)}` : "";
            return `--- ${f.surface} ---${tail}`;
          })
          .join("\n");
        log(`failed: ${summary}`);
        sessionStore.fail(
          ctx.sessionId,
          `Build verification failed on ${failures.length}/3 surface(s): ${summary}.\n${detail}`,
        );
        return;
      }

      const totalDurationMs = results.reduce((sum, r) => sum + r.durationMs, 0);
      sessionStore.appendEvent(ctx.sessionId, "step_complete", {
        phase: "verify",
        status: "passed",
        surfaces: ["web", "android", "ios"],
        totalDurationMs,
        perSurfaceMs: {
          web: results[0].durationMs,
          android: results[1].durationMs,
          ios: results[2].durationMs,
        },
      });
      log("all 3 surfaces passed");
      await advanceOrFinish(ctx.sessionId, "verify-builds");
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      log(`threw — failing session: ${message}`);
      sessionStore.fail(ctx.sessionId, message);
    } finally {
      sessionStore.setAbortController(ctx.sessionId, null);
    }
  })();
}

// ---------------------------------------------------------------------------
// QA test phase — Playwright browser tests against the running web app.
// Soft-fail: QA failures emit a warning and set status to "ready", not
// "failed". The build already passed in verify-builds; QA failures are
// informational for freshly-generated apps.
// ---------------------------------------------------------------------------

function startQaTestPhase(ctx: PhaseContext): void {
  const abortController = new AbortController();
  sessionStore.setAbortController(ctx.sessionId, abortController);
  sessionStore.setStatus(ctx.sessionId, "testing");
  sessionStore.appendEvent(ctx.sessionId, "step_start", {
    phase: "qa-test",
    message:
      "Running /qa (browser-based QA tests via Playwright)…",
  });
  const onApproval = makeOnApproval(ctx.sessionId);

  void (async () => {
    const log = (...parts: unknown[]) =>
      console.log(`[phase-runner qa-test ${ctx.sessionId}]`, ...parts);
    log("starting");
    const start = Date.now();
    try {
      const result = await runAgent({
        cwd: ctx.worktreePath,
        prompt: buildQaTestPrompt(),
        sessionId: ctx.sessionId,
        abortController,
        onApproval,
        permissionMode: "default",
        maxTurns: 80,
        maxBudgetUsd: 2,
      });
      log(
        `runAgent returned completed=${result.completed} turns=${result.numTurns ?? "?"} cost=${result.totalCostUsd ?? "?"}`,
      );
      sessionStore.appendEvent(ctx.sessionId, "step_complete", {
        phase: "qa-test",
        status: result.completed ? "passed" : "warning",
        durationMs: Date.now() - start,
        totalCostUsd: result.totalCostUsd,
        numTurns: result.numTurns,
        errorMessage: result.errorMessage,
      });
      if (!result.completed) {
        sessionStore.appendEvent(ctx.sessionId, "error", {
          message: `QA tests did not complete (non-fatal): ${
            result.errorMessage ?? "unknown error"
          }`,
        });
      }
      await advanceOrFinish(ctx.sessionId, "qa-test");
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      log(`threw — non-fatal, advancing: ${message}`);
      sessionStore.appendEvent(ctx.sessionId, "error", {
        message: `QA test phase threw (non-fatal): ${message}`,
      });
      await advanceOrFinish(ctx.sessionId, "qa-test");
    } finally {
      sessionStore.setAbortController(ctx.sessionId, null);
    }
  })();
}

// ---------------------------------------------------------------------------
// Design-study phase — standalone single-phase flow. Does not participate in
// the bootstrap pipeline. On completion, moves the staged `pending/sources/`
// directory to a timestamped path and emits a `done` event with the study
// path so the browser can offer a download link.
// ---------------------------------------------------------------------------

function startDesignStudyPhase(ctx: DesignStudyPhaseContext): void {
  const abortController = new AbortController();
  sessionStore.setAbortController(ctx.sessionId, abortController);
  sessionStore.setStatus(ctx.sessionId, "bootstrapping");
  sessionStore.appendEvent(ctx.sessionId, "step_start", {
    phase: "design-study",
    message: "Running /design-study (vision analysis of reference images)…",
  });
  const onApproval = makeOnApproval(ctx.sessionId);

  void (async () => {
    const log = (...parts: unknown[]) =>
      console.log(`[phase-runner design-study ${ctx.sessionId}]`, ...parts);
    log("starting");
    const start = Date.now();
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "")
      .replace(/-/g, "")
      .slice(0, 15);
    try {
      const result = await runAgent({
        cwd: ctx.worktreePath,
        prompt: buildDesignStudyPrompt(ctx.studyInputs),
        sessionId: ctx.sessionId,
        abortController,
        onApproval,
        permissionMode: "default",
        maxTurns: 30,
        maxBudgetUsd: 1,
      });
      log(
        `runAgent returned completed=${result.completed} turns=${result.numTurns ?? "?"} cost=${result.totalCostUsd ?? "?"}`,
      );
      sessionStore.appendEvent(ctx.sessionId, "step_complete", {
        phase: "design-study",
        status: result.completed ? "passed" : "failed",
        durationMs: Date.now() - start,
        totalCostUsd: result.totalCostUsd,
        numTurns: result.numTurns,
        errorMessage: result.errorMessage,
      });
      if (!result.completed) {
        sessionStore.fail(
          ctx.sessionId,
          result.errorMessage ?? "Design study did not complete",
        );
        return;
      }

      // Move design/studies/pending/ → design/studies/<timestamp>/ so the
      // skill's output has a durable, indexable path. The skill itself may
      // already have written under a timestamp — if so, `pending/` was only
      // used for sources and we rename it defensively.
      const pendingDir = join(ctx.worktreePath, "design", "studies", "pending");
      const finalDir = join(ctx.worktreePath, "design", "studies", timestamp);
      try {
        await rename(pendingDir, finalDir);
      } catch (e) {
        // If the skill already renamed, or pending/ doesn't exist, this is
        // fine — proceed with whatever timestamp the skill emitted.
        log(
          `rename pending→timestamp skipped: ${e instanceof Error ? e.message : String(e)}`,
        );
      }

      // Branch on session type: standalone study → terminal (status=ready);
      // bootstrap prelude → read sidecar, apply proposed brand (if confident
      // enough), then chain into the normal bootstrap pipeline.
      const session = sessionStore.get(ctx.sessionId);
      if (!session || session.type === "design-study") {
        sessionStore.appendEvent(ctx.sessionId, "done", {
          phase: "design-study",
          studyPath: `design/studies/${timestamp}/DESIGN_STUDY.md`,
          worktreePath: ctx.worktreePath,
        });
        sessionStore.setStatus(ctx.sessionId, "ready");
        return;
      }

      // Bootstrap prelude — record the timestamp dir so the downstream
      // design-apply phase can locate the sidecar, then consume brand for
      // /init-app and advance.
      session.designStudyTimestampDir = timestamp;
      const resultPath = join(
        ctx.worktreePath,
        "design",
        "studies",
        timestamp,
        "design-study-result.json",
      );
      let adoptedBrand: { L: number; C: number; h: number } | undefined;
      let confidence: "low" | "medium" | "high" | "unknown" = "unknown";
      try {
        const raw = await readFile(resultPath, "utf8");
        const parsed = JSON.parse(raw) as {
          brand?: { L?: number; C?: number; h?: number };
          confidence?: string;
        };
        if (
          parsed.brand &&
          typeof parsed.brand.L === "number" &&
          typeof parsed.brand.C === "number" &&
          typeof parsed.brand.h === "number"
        ) {
          const c = parsed.confidence;
          confidence =
            c === "low" || c === "medium" || c === "high" ? c : "unknown";
          if (confidence === "medium" || confidence === "high") {
            adoptedBrand = {
              L: parsed.brand.L,
              C: parsed.brand.C,
              h: parsed.brand.h,
            };
          }
        }
      } catch (e) {
        log(
          `sidecar read/parse skipped: ${e instanceof Error ? e.message : String(e)}`,
        );
      }

      if (adoptedBrand) {
        session.inputs.brandColor = adoptedBrand;
        sessionStore.appendEvent(ctx.sessionId, "step_progress", {
          phase: "design-study",
          message: `Adopted proposed brand (confidence=${confidence}): L=${adoptedBrand.L} C=${adoptedBrand.C} h=${adoptedBrand.h}. /init-app will pass this to --brand-color.`,
          brandColor: adoptedBrand,
          confidence,
        });
      } else {
        sessionStore.appendEvent(ctx.sessionId, "step_progress", {
          phase: "design-study",
          message: `Prelude complete — no brand adopted (confidence=${confidence}). Using slider-input brand (or default) for /init-app.`,
          confidence,
        });
      }

      const nextPhase = getFirstPhase(session.phaseFlags);
      log(`prelude complete → chaining to ${nextPhase}`);
      await triggerNextPhase(ctx.sessionId, nextPhase);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      log(`threw — failing session: ${message}`);
      sessionStore.fail(ctx.sessionId, message);
    } finally {
      sessionStore.setAbortController(ctx.sessionId, null);
    }
  })();
}

// ---------------------------------------------------------------------------
// Design-apply phase — runs after /init-app, before seed-demo + feature
// implementation. Reads the sidecar produced by the design-study prelude,
// applies brand/font/radius/accent deltas to `design/tokens.json`, regens
// tokens via `bin/design-tokens.sh`, spins up the web dev server, and pauses
// with an approval_request that carries a preview URL. Approve continues the
// chain; reject rolls back the token files and continues with the original
// design.
// ---------------------------------------------------------------------------

interface DesignApplyPhaseContext {
  sessionId: string;
  worktreePath: string;
  studyTimestampDir?: string;
}

function startDesignApplyPhase(ctx: DesignApplyPhaseContext): void {
  const abortController = new AbortController();
  sessionStore.setAbortController(ctx.sessionId, abortController);
  sessionStore.setStatus(ctx.sessionId, "bootstrapping");
  sessionStore.appendEvent(ctx.sessionId, "step_start", {
    phase: "design-apply",
    message:
      "Applying proposed design deltas + starting preview dev server for approval…",
  });

  void (async () => {
    const log = (...parts: unknown[]) =>
      console.log(`[phase-runner design-apply ${ctx.sessionId}]`, ...parts);
    log("starting");

    if (!ctx.studyTimestampDir) {
      log(
        "no designStudyTimestampDir on session — prelude didn't run; skipping gracefully.",
      );
      sessionStore.appendEvent(ctx.sessionId, "step_complete", {
        phase: "design-apply",
        status: "skipped",
        message:
          "No design-study prelude output found on this session — skipping.",
      });
      await advanceOrFinish(ctx.sessionId, "design-apply");
      return;
    }

    try {
      const sidecar = await readSidecar(
        ctx.worktreePath,
        ctx.studyTimestampDir,
      );
      if (!sidecar) {
        log("sidecar missing — skipping design-apply.");
        sessionStore.appendEvent(ctx.sessionId, "step_complete", {
          phase: "design-apply",
          status: "skipped",
          message:
            "design-study-result.json not found — /design-study chose not to recommend any delta.",
        });
        await advanceOrFinish(ctx.sessionId, "design-apply");
        return;
      }

      // Snapshot tokens.json BEFORE applying so we can restore cleanly on
      // rejection. init-app doesn't commit, so git checkout wouldn't work.
      const snapshot = await snapshotTokens(ctx.worktreePath);
      if (!snapshot.ok || !snapshot.content) {
        sessionStore.fail(
          ctx.sessionId,
          `design-apply: ${snapshot.reason ?? "unknown snapshot error"}`,
        );
        return;
      }

      const applyResult = await applySidecarToTokensJson(
        ctx.worktreePath,
        sidecar,
      );
      if (!applyResult.ok) {
        sessionStore.fail(
          ctx.sessionId,
          `design-apply: ${applyResult.reason}`,
        );
        return;
      }
      sessionStore.appendEvent(ctx.sessionId, "step_progress", {
        phase: "design-apply",
        status: "tokens-written",
        applied: applyResult.applied,
        skipped: applyResult.skipped,
        message: summarizeApply(applyResult),
      });

      // Regenerate tokens.css + DesignTokens.kt + tokens.dtcg.json.
      const regen = await runDesignTokensShell(
        ctx.sessionId,
        ctx.worktreePath,
        abortController,
      );
      if (!regen.ok) {
        sessionStore.fail(
          ctx.sessionId,
          `design-apply regen failed: ${regen.reason}`,
        );
        return;
      }

      // Start the dev server so the user can preview /design.
      let devServer: Awaited<ReturnType<typeof startWebDevServer>>;
      try {
        devServer = await startWebDevServer(ctx.worktreePath, {
          readyTimeoutMs: 90_000,
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        log(`dev server start failed: ${message} — continuing without preview.`);
        sessionStore.appendEvent(ctx.sessionId, "step_progress", {
          phase: "design-apply",
          status: "no-preview",
          message: `Couldn't start dev server for preview: ${message}. Applied tokens anyway; continuing to next phase.`,
        });
        await advanceOrFinish(ctx.sessionId, "design-apply");
        return;
      }

      const previewUrl = `${devServer.url}/en-US/design`;
      log(`dev server up at ${devServer.url}; preview ${previewUrl}`);

      // Pause for approval. The user reviews the preview URL and decides:
      // - approve → continue to the next phase with the applied tokens.
      // - reject → revert tokens + generated files, continue with original.
      const onApproval = makeOnApproval(ctx.sessionId);
      const decision = await onApproval({
        toolName: "design-apply",
        title: "Review the applied design",
        displayName: "Design apply: review & approve",
        input: {
          previewUrl,
          applied: applyResult.applied,
          notes: applyResult.skipped,
        },
        decisionReason: [
          `The /design-study skill proposed the following deltas and they've been applied to design/tokens.json:`,
          ``,
          summarizeApply(applyResult),
          ``,
          `Preview the result at:`,
          `  ${previewUrl}`,
          ``,
          `Approve to keep these tokens and continue to feature implementation.`,
          `Reject to roll back to the /init-app tokens and continue with the original design.`,
        ].join("\n"),
      });

      stopDevServer(devServer.process);

      if (decision.behavior === "deny") {
        // Rollback: restore tokens.json from the pre-apply snapshot + regen.
        const restored = await restoreTokens(ctx.worktreePath, snapshot.content);
        let regenOk = true;
        let regenReason: string | undefined;
        if (restored.ok) {
          const regenBack = await runDesignTokensShell(
            ctx.sessionId,
            ctx.worktreePath,
            abortController,
          );
          regenOk = regenBack.ok;
          regenReason = regenBack.reason;
        }
        sessionStore.appendEvent(ctx.sessionId, "step_complete", {
          phase: "design-apply",
          status: "rejected",
          rolledBack: restored.ok && regenOk,
          rollbackReason: restored.ok
            ? regenOk
              ? undefined
              : regenReason
            : restored.reason,
          message:
            restored.ok && regenOk
              ? "Design rejected — rolled back to /init-app tokens. Continuing with original design."
              : `Design rejected — rollback partial (${restored.reason ?? regenReason}). Continuing anyway.`,
        });
      } else {
        sessionStore.appendEvent(ctx.sessionId, "step_complete", {
          phase: "design-apply",
          status: "approved",
          message:
            "Design approved — proceeding with the applied tokens to feature implementation.",
        });
      }

      await advanceOrFinish(ctx.sessionId, "design-apply");
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      log(`threw — failing session: ${message}`);
      sessionStore.fail(ctx.sessionId, message);
    } finally {
      sessionStore.setAbortController(ctx.sessionId, null);
    }
  })();
}

function summarizeApply(r: {
  applied: {
    brand?: boolean;
    fontFamily?: { sans?: boolean; mono?: boolean };
    radius?: Array<"sm" | "md" | "lg" | "xl">;
    accent?: boolean;
  };
  skipped: string[];
}): string {
  const parts: string[] = [];
  if (r.applied.brand) parts.push("brand color");
  if (r.applied.fontFamily?.sans) parts.push("fontFamily.sans");
  if (r.applied.fontFamily?.mono) parts.push("fontFamily.mono");
  if (r.applied.radius?.length)
    parts.push(`radius: ${r.applied.radius.join(", ")}`);
  if (r.applied.accent) parts.push("schema extension: accent-color");
  const header =
    parts.length > 0 ? `Applied: ${parts.join("; ")}.` : "No deltas applied.";
  const notes =
    r.skipped.length > 0 ? `\nNotes:\n  - ${r.skipped.join("\n  - ")}` : "";
  return header + notes;
}

function runDesignTokensShell(
  sessionId: string,
  worktreePath: string,
  abortController: AbortController,
): Promise<{ ok: boolean; reason?: string }> {
  return new Promise((resolve) => {
    const child = spawn("./bin/design-tokens.sh", [], {
      cwd: worktreePath,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr?.on("data", (c) => (stderr += c.toString()));
    const onAbort = () => {
      if (!child.killed) child.kill("SIGTERM");
    };
    abortController.signal.addEventListener("abort", onAbort);
    child.on("close", (code) => {
      abortController.signal.removeEventListener("abort", onAbort);
      if (code === 0) {
        sessionStore.appendEvent(sessionId, "bash_output", {
          phase: "design-apply",
          command: "./bin/design-tokens.sh",
          status: "ok",
        });
        resolve({ ok: true });
      } else {
        resolve({
          ok: false,
          reason: `bin/design-tokens.sh exited ${code}: ${stderr.trim().slice(-400)}`,
        });
      }
    });
    child.on("error", (e) => {
      abortController.signal.removeEventListener("abort", onAbort);
      resolve({
        ok: false,
        reason: `spawn design-tokens.sh failed: ${e.message}`,
      });
    });
  });
}
