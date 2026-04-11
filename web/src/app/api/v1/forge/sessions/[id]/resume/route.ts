import { ok, fail } from "@/lib/api-response";
import { sessionStore } from "@/lib/forge/session-store";
import { worktreeExists } from "@/lib/forge/worktree";
import { startResumeWorker } from "@/lib/forge/worker";
import { requireForgeUser } from "@/lib/forge/auth";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Resume a failed forge session in its existing worktree. Spawns
 * `claude -c` via the CLI runner with a continuation prompt — the prior
 * conversation state is loaded from the CLI's on-disk session history.
 *
 * Preconditions:
 * - Session must exist in the store
 * - Session status must be `failed` (resume only makes sense after a failure)
 * - The worktree must still exist on disk (not previously removed via
 *   Discard or Abort)
 * - `FORGE_USE_SDK` must not be set to "1" — resume is CLI-only in v1.
 *   If the SDK path is active, runAgent will throw and the session fails
 *   with a clear message.
 */
export async function POST(_request: Request, { params }: RouteContext) {
  try {
    await requireForgeUser();
    const { id: sessionId } = await params;

    const session = sessionStore.get(sessionId);
    if (!session) {
      return fail("NOT_FOUND", "session not found", 404);
    }

    if (session.status !== "failed") {
      return fail(
        "INVALID_STATE",
        `cannot resume a session in status '${session.status}' — only 'failed' sessions can be resumed`,
        409,
      );
    }

    if (!worktreeExists(sessionId)) {
      return fail(
        "WORKTREE_MISSING",
        "the worktree for this session has been removed — retry to create a fresh one instead",
        410,
      );
    }

    if (process.env.FORGE_USE_SDK === "1") {
      return fail(
        "RESUME_UNSUPPORTED_ON_SDK",
        "Resume is CLI-only in v1. Unset FORGE_USE_SDK to use the CLI runner.",
        501,
      );
    }

    startResumeWorker({
      sessionId,
      worktreePath: session.worktreePath,
    });

    return ok(
      {
        sessionId,
        status: "bootstrapping",
        resumed: true,
      },
      202,
    );
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
