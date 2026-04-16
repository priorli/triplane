import { readFile, writeFile, access } from "node:fs/promises";
import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";

/**
 * Shape of `design-study-result.json` as written by the `/design-study` skill.
 * Every top-level field is optional — the `design-apply` phase applies each
 * one independently and leaves the existing template value untouched for
 * anything missing.
 */
export interface DesignStudySidecar {
  brand?: { L: number; C: number; h: number };
  fontFamily?: { sans?: string; mono?: string };
  radius?: { sm?: number; md?: number; lg?: number; xl?: number };
  schemaExtensions?: Array<
    | {
        type: "accent-color";
        value: { L: number; C: number; h: number };
        rationale?: string;
      }
    | { type: string; [k: string]: unknown } // forward-compat for unknown types
  >;
  confidence?: "low" | "medium" | "high";
}

export interface ApplyResult {
  ok: boolean;
  applied: {
    brand?: boolean;
    fontFamily?: { sans?: boolean; mono?: boolean };
    radius?: Array<"sm" | "md" | "lg" | "xl">;
    accent?: boolean;
  };
  skipped: string[]; // human-readable reasons for anything ignored
  reason?: string;
}

/**
 * Read the sidecar from a completed `/design-study` run. Returns `null` if
 * the file doesn't exist (in which case the phase skips cleanly).
 */
export async function readSidecar(
  worktreePath: string,
  studyTimestampDir: string,
): Promise<DesignStudySidecar | null> {
  const path = join(
    worktreePath,
    "design",
    "studies",
    studyTimestampDir,
    "design-study-result.json",
  );
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as DesignStudySidecar;
  } catch {
    return null;
  }
}

/**
 * Apply every expressible delta from the sidecar into `design/tokens.json`.
 * Does NOT run `bin/design-tokens.sh` — the caller does that once at the end
 * so a single regeneration covers brand + font + radius + schema extension
 * in one pass.
 */
export async function applySidecarToTokensJson(
  worktreePath: string,
  sidecar: DesignStudySidecar,
  opts: { minConfidence: "low" | "medium" | "high" } = { minConfidence: "medium" },
): Promise<ApplyResult> {
  const tokensPath = join(worktreePath, "design", "tokens.json");
  const applied: ApplyResult["applied"] = {};
  const skipped: string[] = [];

  const confidenceRank: Record<string, number> = { low: 0, medium: 1, high: 2 };
  const sidecarConfidence = sidecar.confidence ?? "low";
  if (
    confidenceRank[sidecarConfidence] < confidenceRank[opts.minConfidence]
  ) {
    return {
      ok: true,
      applied: {},
      skipped: [
        `overall confidence is "${sidecarConfidence}" — below threshold "${opts.minConfidence}"; nothing applied`,
      ],
      reason: "low-confidence",
    };
  }

  let tokens: Record<string, unknown>;
  try {
    const raw = await readFile(tokensPath, "utf8");
    tokens = JSON.parse(raw);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      applied: {},
      skipped: [],
      reason: `could not read tokens.json: ${message}`,
    };
  }

  if (sidecar.brand) {
    tokens.brand = {
      L: sidecar.brand.L,
      C: sidecar.brand.C,
      h: sidecar.brand.h,
    };
    applied.brand = true;
  }

  if (sidecar.fontFamily) {
    const typography = (tokens.typography ??
      (tokens.typography = {})) as Record<string, unknown>;
    const fontFamily = (typography.fontFamily ??
      (typography.fontFamily = {})) as Record<string, unknown>;
    applied.fontFamily = {};
    if (sidecar.fontFamily.sans) {
      fontFamily.sans = sidecar.fontFamily.sans;
      applied.fontFamily.sans = true;
      skipped.push(
        `fontFamily.sans renamed to "${sidecar.fontFamily.sans}" — drop matching TTFs into mobile/composeApp/src/commonMain/composeResources/font/ and verify next/font/google reference in web/src/app/[locale]/layout.tsx.`,
      );
    }
    if (sidecar.fontFamily.mono) {
      fontFamily.mono = sidecar.fontFamily.mono;
      applied.fontFamily.mono = true;
      skipped.push(
        `fontFamily.mono renamed to "${sidecar.fontFamily.mono}" — same font-binary handoff applies.`,
      );
    }
  }

  if (sidecar.radius) {
    const radius = (tokens.radius ?? (tokens.radius = {})) as Record<
      string,
      unknown
    >;
    applied.radius = [];
    for (const slot of ["sm", "md", "lg", "xl"] as const) {
      const value = sidecar.radius[slot];
      if (typeof value === "number") {
        radius[slot] = value;
        applied.radius.push(slot);
      }
    }
  }

  if (sidecar.schemaExtensions) {
    for (const ext of sidecar.schemaExtensions) {
      if (ext.type === "accent-color" && "value" in ext) {
        const accent = ext.value as { L: number; C: number; h: number };
        tokens.accent = { L: accent.L, C: accent.C, h: accent.h };
        applied.accent = true;
      } else {
        skipped.push(
          `unsupported schemaExtensions type "${ext.type}" ignored (v1 supports accent-color only)`,
        );
      }
    }
  }

  try {
    await writeFile(
      tokensPath,
      JSON.stringify(tokens, null, 2) + "\n",
      "utf8",
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      applied,
      skipped,
      reason: `could not write tokens.json: ${message}`,
    };
  }

  return { ok: true, applied, skipped };
}

/**
 * Snapshot `design/tokens.json` content before applying deltas, so we can
 * restore it on rejection. init-app doesn't commit its rewrites, so `git
 * checkout --` would restore to the base-branch state (wiping init-app's
 * work). In-memory snapshot is the right primitive.
 */
export async function snapshotTokens(
  worktreePath: string,
): Promise<{ ok: boolean; content?: string; reason?: string }> {
  const tokensPath = join(worktreePath, "design", "tokens.json");
  try {
    const content = await readFile(tokensPath, "utf8");
    return { ok: true, content };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: `could not snapshot tokens.json: ${message}` };
  }
}

/**
 * Restore `design/tokens.json` from an in-memory snapshot. Caller is expected
 * to re-run `bin/design-tokens.sh` afterward so the generated CSS + Kotlin +
 * DTCG outputs match.
 */
export async function restoreTokens(
  worktreePath: string,
  snapshot: string,
): Promise<{ ok: boolean; reason?: string }> {
  const tokensPath = join(worktreePath, "design", "tokens.json");
  try {
    await writeFile(tokensPath, snapshot, "utf8");
    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: `could not restore tokens.json: ${message}` };
  }
}

/**
 * Spawn `bun run dev` in the worktree's web/ directory and resolve when the
 * server is listening on a port. Returns the child handle + discovered URL.
 *
 * The server picks the first free port starting at 3000 (Next.js default),
 * so we parse stdout until we see the "Local:" line. On failure we bail
 * early rather than block the session indefinitely.
 */
export async function ensureWebDepsInstalled(
  worktreePath: string,
  opts: { timeoutMs?: number } = {},
): Promise<{ ok: boolean; installed: boolean; reason?: string }> {
  const webDir = join(worktreePath, "web");
  const nodeModulesDir = join(webDir, "node_modules");
  try {
    await access(nodeModulesDir);
    return { ok: true, installed: false }; // already present
  } catch {
    // Not installed — run bun install.
  }

  const timeout = opts.timeoutMs ?? 180_000;
  return new Promise((resolve) => {
    const child = spawn("bun", ["install"], {
      cwd: webDir,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr?.on("data", (c) => (stderr += c.toString()));
    const timer = setTimeout(() => {
      if (!child.killed) child.kill("SIGTERM");
      resolve({
        ok: false,
        installed: false,
        reason: `bun install timed out after ${timeout}ms`,
      });
    }, timeout);
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({ ok: true, installed: true });
      } else {
        resolve({
          ok: false,
          installed: false,
          reason: `bun install exited ${code}: ${stderr.trim().slice(-400)}`,
        });
      }
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({
        ok: false,
        installed: false,
        reason: `spawn bun install failed: ${e.message}`,
      });
    });
  });
}

/**
 * Pick a stable per-session port in 3100–3199 range so concurrent forge
 * sessions don't fight over Next.js's auto-increment-from-3000 default
 * (which collides with the forge's own dev server on 3000).
 */
export function sessionPreviewPort(sessionId: string): number {
  let hash = 0;
  for (let i = 0; i < sessionId.length; i++) {
    hash = (hash * 31 + sessionId.charCodeAt(i)) | 0;
  }
  return 3100 + (Math.abs(hash) % 100);
}

export async function startWebDevServer(
  worktreePath: string,
  opts: {
    sessionId: string;
    readyTimeoutMs?: number;
    onLog?: (chunk: string) => void;
  },
): Promise<{ process: ChildProcess; url: string }> {
  const timeout = opts.readyTimeoutMs ?? 180_000;
  const port = sessionPreviewPort(opts.sessionId);
  const url = `http://localhost:${port}`;

  // Force-pin the port via `next dev -p <port>` (bun forwards args after `--`).
  // We KNOW the URL up front, so the only thing left is waiting for the
  // server to actually answer requests.
  const child = spawn("bun", ["run", "dev", "--", "-p", String(port)], {
    cwd: join(worktreePath, "web"),
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  return new Promise((resolve, reject) => {
    let settled = false;
    let log = "";

    const settle = (result: { url: string } | { error: Error }) => {
      if (settled) return;
      settled = true;
      if ("url" in result) {
        resolve({ process: child, url: result.url });
      } else {
        child.kill("SIGTERM");
        reject(result.error);
      }
    };

    // Poll the pinned port every 2s until it answers HTTP or the max timer
    // fires. First answer (any status) = ready.
    const startedAt = Date.now();
    const poll = async () => {
      if (settled || child.killed) return;
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 1_500);
        const res = await fetch(url, {
          method: "GET",
          signal: controller.signal,
          redirect: "manual",
        });
        clearTimeout(timer);
        // Any response (even a 404 or 307) means Next.js is alive.
        if (res) settle({ url });
      } catch {
        // server not ready; try again
        if (!settled && Date.now() - startedAt < timeout) {
          setTimeout(poll, 2_000);
        }
      }
    };
    // Give Next.js a few seconds before the first probe to avoid spamming
    // the unborn port.
    setTimeout(poll, 3_000);

    const maxTimer = setTimeout(
      () =>
        settle({
          error: new Error(
            `dev server did not respond on ${url} within ${timeout}ms. Tail of output:\n${log.slice(-1500)}`,
          ),
        }),
      timeout,
    );

    const onData = (chunk: Buffer) => {
      const text = chunk.toString();
      log += text;
      if (log.length > 16_384) log = log.slice(-16_384);
      if (opts.onLog) opts.onLog(text);
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.on("exit", (code) => {
      clearTimeout(maxTimer);
      settle({
        error: new Error(
          `dev server exited before ready (code ${code}). Tail of output:\n${log.slice(-1500)}`,
        ),
      });
    });
    child.on("error", (e) => {
      clearTimeout(maxTimer);
      settle({ error: e });
    });
  });
}

export function stopDevServer(proc: ChildProcess): void {
  if (proc.killed) return;
  proc.kill("SIGTERM");
  setTimeout(() => {
    if (!proc.killed) proc.kill("SIGKILL");
  }, 3_000);
}
