import { ok, fail } from "@/lib/api-response";
import { sessionStore } from "@/lib/forge/session-store";
import { createWorktree, removeWorktree } from "@/lib/forge/worktree";
import { designStudyRequestSchema } from "@/lib/forge/schemas";
import { triggerNextPhase } from "@/lib/forge/phase-runner";
import { requireForgeUser } from "@/lib/forge/auth";
import { stageDesignStudyInputs } from "@/lib/forge/design-study-stage";

/**
 * POST /api/v1/forge/design-studies — create a forge session that runs the
 * `/design-study` skill against user-provided reference images, URLs, and a
 * prose prompt.
 *
 * Unlike `/api/v1/forge/sessions` (which runs the full bootstrap pipeline),
 * this endpoint creates a single-phase session typed `"design-study"`. The
 * session's worktree stages images under `design/studies/pending/sources/`
 * and the phase runner invokes the skill with that path.
 */
export async function POST(request: Request) {
  try {
    const { userId } = await requireForgeUser();

    const body = await request.json();
    const parsed = designStudyRequestSchema.safeParse(body);
    if (!parsed.success) {
      return fail("VALIDATION_ERROR", parsed.error.message, 400);
    }
    const input = parsed.data;

    const baseUrl = new URL(request.url).origin;

    const state = sessionStore.create({
      userId,
      worktreePath: "",
      type: "design-study",
      inputs: {
        // Bootstrap-shaped fields are unused for design-study sessions but
        // kept populated with stubs so existing code paths (session listing,
        // retry) don't crash on undefined access.
        productName: "design-study",
        tagline: "",
        description: "",
        targetUser: "",
        features: [],
        slug: "design-study",
        namespace: "design.study",
        displayName: "Design study",
      },
      designStudyInputs: {
        imageNames: input.images.map((img) => img.name),
        urls: input.urls,
        prompt: input.prompt,
      },
      // phaseFlags irrelevant for design-study; the phase-runner short-circuits
      // before reading them.
      phaseFlags: {
        planReview: false,
        seedDemo: false,
        implementFeatures: false,
        verifyBuilds: false,
        platformTarget: "all",
        qaTest: false,
      },
      baseUrl,
    });

    let worktree;
    try {
      worktree = await createWorktree(state.sessionId);
    } catch (e) {
      sessionStore.remove(state.sessionId);
      const message = e instanceof Error ? e.message : String(e);
      return fail("WORKTREE_CREATE_FAILED", message, 500);
    }

    state.worktreePath = worktree.path;

    try {
      await stageDesignStudyInputs({
        worktreePath: worktree.path,
        images: input.images,
        urls: input.urls,
        prompt: input.prompt,
      });
    } catch (e) {
      await removeWorktree(state.sessionId);
      sessionStore.remove(state.sessionId);
      const message = e instanceof Error ? e.message : String(e);
      return fail("STAGE_INPUTS_FAILED", message, 500);
    }

    sessionStore.setStatus(state.sessionId, "idea_written");

    void triggerNextPhase(state.sessionId, "design-study");

    return ok(
      {
        sessionId: state.sessionId,
        status: state.status,
        worktreePath: state.worktreePath,
        eventsUrl: `/api/v1/forge/sessions/${state.sessionId}/events`,
        createdAt: state.createdAt.toISOString(),
      },
      201,
    );
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
