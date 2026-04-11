import { randomUUID } from "node:crypto";
import { runAgent, type ApprovalRequest, type ApprovalDecision } from "./agent-runner";
import { sessionStore, type SessionInputs } from "./session-store";

export interface StartWorkerArgs {
  sessionId: string;
  worktreePath: string;
  /** Form inputs the user provided via the /forge/new page. */
  inputs: SessionInputs;
}

/**
 * Builds the initial prompt for /init-app, pre-answering the skill's Step 2
 * Q&A (slug / namespace / display name / brand color) so the agent doesn't
 * pause for conversational inputs it already has.
 *
 * The agent still runs /init-app's step sequence (pre-flight → bin/init.sh →
 * rewrite-docs.sh → build verification → /feature add loop), and tool calls
 * still route through `canUseTool` for real per-action approval gates.
 */
function buildInitAppPrompt(inputs: SessionInputs): string {
  const hasBrand = inputs.brandColor !== undefined;
  const brandTriple = hasBrand
    ? `${inputs.brandColor!.L},${inputs.brandColor!.C},${inputs.brandColor!.h}`
    : "";

  // Build the prescriptive rewrite-docs.sh invocation for Step 5. The goal is
  // that the agent doesn't have to parse any format or infer any flag shape —
  // we give it the exact bash command to copy (only the working-dir-relative
  // path to rewrite-docs.sh has to be resolved, and Claude Code handles that).
  const step5Command = hasBrand
    ? [
        "When you reach Step 5, invoke `rewrite-docs.sh` with this EXACT command",
        "(it has been pre-filled with the user's inputs — do not modify any argument):",
        "",
        "```bash",
        "./.claude/skills/init-app/rewrite-docs.sh \\",
        `    --display-name "${inputs.displayName.replace(/"/g, '\\"')}" \\`,
        `    --slug ${inputs.slug} \\`,
        `    --brand-color "${brandTriple}" \\`,
        "    --yes",
        "```",
        "",
        "This writes the brand to `design/tokens.json` and runs `./bin/design-tokens.sh` to regenerate `web/src/app/generated/tokens.css` + `mobile/.../common/theme/DesignTokens.kt` with the new palette.",
      ].join("\n")
    : [
        "When you reach Step 5, invoke `rewrite-docs.sh` with this EXACT command",
        "(the user did NOT pick a brand color, so DO NOT pass `--brand-color`):",
        "",
        "```bash",
        "./.claude/skills/init-app/rewrite-docs.sh \\",
        `    --display-name "${inputs.displayName.replace(/"/g, '\\"')}" \\`,
        `    --slug ${inputs.slug} \\`,
        "    --yes",
        "```",
        "",
        "`design/tokens.json` stays at the default gray palette.",
      ].join("\n");

  return [
    "Run /init-app to bootstrap this Triplane-template clone for the downstream project.",
    "",
    "`IDEA.md` is at the repo root. The user has already provided the Step 2 inputs via the Triplane Forge web UI — use these values directly and DO NOT pause to ask the user to confirm them:",
    "",
    `- Project slug:   ${inputs.slug}`,
    `- Java namespace: ${inputs.namespace}`,
    `- Display name:   ${inputs.displayName}`,
    hasBrand
      ? `- Brand color:    L=${inputs.brandColor!.L}, C=${inputs.brandColor!.C}, h=${inputs.brandColor!.h} (OKLch)`
      : "- Brand color:    not set",
    "",
    step5Command,
    "",
    "Execution notes specific to Triplane Forge:",
    "",
    "1. You are running in a git worktree on branch `forge-session-<id>` (not on `main`), so Step 1's branch safety check will pass.",
    "2. Do NOT pause for conversational approvals (the 'wait for user to type approved' gates in Steps 3, 6, and 8). The user has delegated approval to the tool-permission system — every Bash/Write/Edit call is routed through `canUseTool` and shown to the user as a forge approval dialog. That is their checkpoint mechanism; do not ask them twice.",
    "3. Run through the step sequence without stopping: Step 1 pre-flight → Step 2 (skip — inputs already provided) → Step 3 execution plan (just state it in text and move on) → Step 4 `bin/init.sh` → Step 5 `rewrite-docs.sh` (use the EXACT command shown above) → Step 6 `git status` + `git diff --stat` → Step 7 build verification (run web + Android + iOS in PARALLEL via concurrent Bash tool calls) → Step 8 `/feature add` loop (draft each MVP backlog spec file directly — do not pause between drafts) → Step 9 final report.",
    "4. For Step 8, you may write `specs/features/<slug>.md` files directly via the Write tool without pausing. The forge user will review the diff after the run completes.",
    "5. Do NOT commit. Do NOT touch `CLAUDE.md`, `LESSONS.md`, `bin/init.sh`, or `.claude/skills/**`. The worktree's working tree is your deliverable.",
    "",
    "Start with Step 1 now.",
  ].join("\n");
}

/**
 * Starts the forge worker for a session. Returns immediately — the agent
 * runs asynchronously in the same Node process. Events stream into the
 * session store and are picked up by the SSE route.
 *
 * For v1 (localhost MVP) this is fire-and-forget. v2 will use a queue.
 */
export function startWorker(args: StartWorkerArgs): AbortController {
  const abortController = new AbortController();
  sessionStore.setAbortController(args.sessionId, abortController);
  sessionStore.setStatus(args.sessionId, "bootstrapping");

  // onApproval: emit approval_request SSE event, register a pending promise,
  // and wait for the browser to POST /approvals.
  const onApproval = async (req: ApprovalRequest): Promise<ApprovalDecision> => {
    const approvalId = randomUUID();

    const decision = await new Promise<{ approved: boolean; note?: string }>((resolve) => {
      sessionStore.registerApproval(args.sessionId, {
        approvalId,
        title: req.title ?? req.displayName ?? `Run ${req.toolName}`,
        body: req.decisionReason ?? JSON.stringify(req.input, null, 2),
        resolve,
      });

      sessionStore.appendEvent(args.sessionId, "approval_request", {
        approvalId,
        toolName: req.toolName,
        title: req.title,
        displayName: req.displayName,
        input: req.input,
        blockedPath: req.blockedPath,
        decisionReason: req.decisionReason,
      });
      sessionStore.setStatus(args.sessionId, "awaiting_approval");
    });

    // Back to running state once the user responded
    sessionStore.setStatus(args.sessionId, "bootstrapping");

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

  const prompt = buildInitAppPrompt(args.inputs);

  // Fire and forget — do NOT await this in the caller
  void (async () => {
    try {
      const result = await runAgent({
        cwd: args.worktreePath,
        prompt,
        sessionId: args.sessionId,
        abortController,
        onApproval,
        // 'default' prompts for dangerous tools (Bash/Write/Edit); combined
        // with agent-runner's default `allowedTools: ['Read', 'Glob', 'Grep']`
        // this keeps state-changing actions gated while safe reads run free.
        permissionMode: "default",
        maxTurns: 80,
        maxBudgetUsd: 3,
      });

      if (result.completed) {
        sessionStore.setStatus(args.sessionId, "ready");
      } else {
        sessionStore.fail(
          args.sessionId,
          result.errorMessage ?? "Agent run did not complete",
        );
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      sessionStore.fail(args.sessionId, message);
    } finally {
      sessionStore.setAbortController(args.sessionId, null);
    }
  })();

  return abortController;
}
