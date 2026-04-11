import { ok, fail } from "@/lib/api-response";
import { sessionStore } from "@/lib/forge/session-store";
import { createWorktree, removeWorktree, worktreeExists } from "@/lib/forge/worktree";
import { writeIdeaMdToWorktree } from "@/lib/forge/idea-md-writer";
import { startWorker } from "@/lib/forge/worker";
import { requireForgeUser } from "@/lib/forge/auth";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Retry a forge session: clone the original session's inputs into a NEW
 * session with a fresh worktree, then start the full `/init-app` flow from
 * scratch. The old session and its worktree are cleaned up.
 *
 * Unlike /resume (which continues the CLI conversation in the same worktree),
 * /retry is a full do-over. Use it when the prior attempt made enough bad
 * decisions that resuming would perpetuate them, or when the worktree is
 * gone and resume is no longer an option.
 *
 * Preconditions: session must exist. Any terminal status (failed, ready,
 * discarded) is allowed — "retry a successful run to try again with the
 * same inputs" is a valid use case. Non-terminal (bootstrapping, awaiting)
 * states are rejected because the old run is still going.
 */
export async function POST(_request: Request, { params }: RouteContext) {
  try {
    await requireForgeUser();
    const { id: oldSessionId } = await params;

    const oldSession = sessionStore.get(oldSessionId);
    if (!oldSession) {
      return fail("NOT_FOUND", "session not found", 404);
    }

    const TERMINAL = new Set(["failed", "ready", "discarded"]);
    if (!TERMINAL.has(oldSession.status)) {
      return fail(
        "INVALID_STATE",
        `cannot retry a session in status '${oldSession.status}' — abort it first, then retry`,
        409,
      );
    }

    // Snapshot inputs before we tear down the old session.
    const inputs = { ...oldSession.inputs };
    const userId = oldSession.userId;

    // Tear down the old session first so name collisions can't happen and
    // the user sees a clean slate in /api/v1/forge/sessions listings.
    if (worktreeExists(oldSessionId)) {
      try {
        await removeWorktree(oldSessionId);
      } catch (e) {
        // Log but don't block — the old worktree is already orphaned from
        // the user's perspective; a failed remove shouldn't block a retry.
        const message = e instanceof Error ? e.message : String(e);
        console.error(
          `[forge retry] failed to remove old worktree for ${oldSessionId}: ${message}`,
        );
      }
    }
    sessionStore.remove(oldSessionId);

    // Create the new session with the same inputs. This mirrors the shape
    // of POST /api/v1/forge/sessions (see sessions/route.ts) so the two
    // code paths stay aligned.
    const newState = sessionStore.create({
      userId,
      worktreePath: "",
      inputs,
    });

    let worktree;
    try {
      worktree = await createWorktree(newState.sessionId);
    } catch (e) {
      sessionStore.remove(newState.sessionId);
      const message = e instanceof Error ? e.message : String(e);
      return fail("WORKTREE_CREATE_FAILED", message, 500);
    }
    newState.worktreePath = worktree.path;

    try {
      await writeIdeaMdToWorktree(worktree.path, {
        productName: inputs.productName,
        tagline: inputs.tagline,
        description: inputs.description,
        targetUser: inputs.targetUser,
        features: inputs.features,
        suggestedSlug: inputs.slug,
      });
    } catch (e) {
      await removeWorktree(newState.sessionId);
      sessionStore.remove(newState.sessionId);
      const message = e instanceof Error ? e.message : String(e);
      return fail("IDEA_WRITE_FAILED", message, 500);
    }

    sessionStore.setStatus(newState.sessionId, "idea_written");

    // Retry always starts the full /init-app flow. We deliberately do NOT
    // carry forward planReview / seedDemo flags from the old session —
    // those were per-attempt user choices. Pure /init-app restart.
    startWorker({
      sessionId: newState.sessionId,
      worktreePath: worktree.path,
      inputs: newState.inputs,
    });

    return ok(
      {
        sessionId: newState.sessionId,
        status: newState.status,
        worktreePath: newState.worktreePath,
        eventsUrl: `/api/v1/forge/sessions/${newState.sessionId}/events`,
        createdAt: newState.createdAt.toISOString(),
        retriedFrom: oldSessionId,
      },
      201,
    );
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
