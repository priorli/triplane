import { ok, fail } from "@/lib/api-response";
import { sessionStore } from "@/lib/forge/session-store";
import { worktreeExists } from "@/lib/forge/worktree";
import { openEditorAtWorktree } from "@/lib/forge/editor";
import { requireForgeUser } from "@/lib/forge/auth";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Open the session's worktree in the user's editor. Reuses the same
 * `openEditorAtWorktree()` helper that auto-opens on session creation —
 * respects `FORGE_EDITOR_COMMAND` (default: `code`), fails silently if
 * the editor binary isn't in PATH.
 *
 * Allowed on any session where the worktree still exists on disk.
 * Returns 410 if the worktree was previously removed (via Abort/Discard).
 */
export async function POST(_request: Request, { params }: RouteContext) {
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

    openEditorAtWorktree(session.worktreePath);

    return ok({
      sessionId,
      worktreePath: session.worktreePath,
      opened: true,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
