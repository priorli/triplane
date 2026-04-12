import { ok, fail } from "@/lib/api-response";
import { sessionStore } from "@/lib/forge/session-store";
import { worktreeExists } from "@/lib/forge/worktree";
import { runAgent } from "@/lib/forge/agent-runner";
import { requireForgeUser } from "@/lib/forge/auth";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Send a free-form prompt to the session's worktree. Spawns a one-shot
 * `claude -p "<prompt>"` via the CLI runner (or SDK runner if FORGE_USE_SDK=1),
 * streaming events into the same session event store so the browser's
 * SSE + event log stays up to date.
 *
 * Use case: after the automated pipeline finishes (or fails), the user
 * wants to fix something, add a feature, or iterate without leaving the
 * forge UI. "Fix the build error in campaigns/route.ts", "add a search bar",
 * "run the tests", etc.
 *
 * Allowed on any session where the worktree still exists. No status-gate —
 * you can prompt a ready, failed, building, or even bootstrapping session
 * (though prompting mid-phase will interleave events, which is weird but
 * not harmful). The session status is set to "building" while the prompt
 * runs, and reverts to "ready" when done. Failures set "failed" as usual.
 */
export async function POST(request: Request, { params }: RouteContext) {
  try {
    await requireForgeUser();
    const { id: sessionId } = await params;

    const session = sessionStore.get(sessionId);
    if (!session) {
      return fail("NOT_FOUND", "session not found", 404);
    }

    if (!worktreeExists(sessionId)) {
      return fail(
        "WORKTREE_MISSING",
        "the worktree for this session has been removed",
        410,
      );
    }

    const body = await request.json().catch(() => ({}));
    const prompt = (body as { prompt?: unknown }).prompt;
    if (typeof prompt !== "string" || !prompt.trim()) {
      return fail("INVALID_PROMPT", "prompt must be a non-empty string", 400);
    }

    const abortController = new AbortController();
    sessionStore.setAbortController(sessionId, abortController);

    const previousStatus = session.status;
    sessionStore.setStatus(sessionId, "building");
    sessionStore.appendEvent(sessionId, "step_start", {
      phase: "prompt",
      message: prompt.trim().slice(0, 200),
    });

    void (async () => {
      try {
        const result = await runAgent({
          cwd: session.worktreePath,
          prompt: prompt.trim(),
          sessionId,
          abortController,
          permissionMode: "default",
        });

        sessionStore.appendEvent(sessionId, "step_complete", {
          phase: "prompt",
          status: result.completed ? "passed" : "failed",
          totalCostUsd: result.totalCostUsd,
          numTurns: result.numTurns,
          errorMessage: result.errorMessage,
        });

        if (result.completed) {
          // Revert to ready so the user can prompt again.
          sessionStore.setStatus(sessionId, "ready");
        } else {
          sessionStore.fail(
            sessionId,
            result.errorMessage ?? "Prompt did not complete",
          );
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        sessionStore.fail(sessionId, message);
      } finally {
        sessionStore.setAbortController(sessionId, null);
      }
    })();

    return ok({ sessionId, prompting: true }, 202);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
