import { ok, fail } from "@/lib/api-response";
import { sessionStore } from "@/lib/forge/session-store";
import { worktreeExists } from "@/lib/forge/worktree";
import { startPhase, type PhaseName } from "@/lib/forge/phase-runner";
import { requireForgeUser } from "@/lib/forge/auth";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const VALID_PHASES: readonly PhaseName[] = [
  "plan-review",
  "init-app",
  "seed-demo",
  "implement-features",
  "verify-builds",
  "qa-test",
] as const;

function isValidPhase(value: unknown): value is PhaseName {
  return (
    typeof value === "string" && (VALID_PHASES as readonly string[]).includes(value)
  );
}

/**
 * Run a single forge phase for a given session. Called by `triggerNextPhase`
 * from phase-runner.ts as each phase hands off to the next, and also by
 * the initial POST /sessions handler when kicking off the first phase.
 *
 * Each invocation runs in a fresh Next.js route-handler context — so
 * Turbopack HMR reloads apply cleanly between hops, and the phase runner
 * always sees the latest module code.
 *
 * Fire-and-forget: returns 202 immediately after the phase's IIFE is
 * detached. The phase runs asynchronously in the background, streaming
 * events into the session store as it goes.
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

    if (session.status === "discarded") {
      return fail(
        "INVALID_STATE",
        `cannot run phase on a discarded session`,
        409,
      );
    }

    const body = await request.json().catch(() => ({}));
    const phase = (body as { phase?: unknown }).phase;
    if (!isValidPhase(phase)) {
      return fail(
        "INVALID_PHASE",
        `phase must be one of: ${VALID_PHASES.join(", ")}. Got: ${String(phase)}`,
        400,
      );
    }

    startPhase(phase, sessionId);

    return ok(
      {
        sessionId,
        phase,
        started: true,
      },
      202,
    );
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
