import { ok, fail } from "@/lib/api-response";
import { sessionStore } from "@/lib/forge/session-store";
import { createWorktree, removeWorktree } from "@/lib/forge/worktree";
import { writeIdeaMdToWorktree } from "@/lib/forge/idea-md-writer";
import { createSessionRequestSchema } from "@/lib/forge/schemas";
import { triggerNextPhase, getFirstPhase } from "@/lib/forge/phase-runner";
import { requireForgeUser } from "@/lib/forge/auth";
import { openEditorAtWorktree } from "@/lib/forge/editor";
import { stageDesignStudyInputs } from "@/lib/forge/design-study-stage";

export async function POST(request: Request) {
  try {
    const { userId } = await requireForgeUser();

    const body = await request.json();
    const parsed = createSessionRequestSchema.safeParse(body);
    if (!parsed.success) {
      return fail("VALIDATION_ERROR", parsed.error.message, 400);
    }
    const input = parsed.data;

    // Capture the actual origin the dev server is running on (scheme + host
    // + port) so phase-runner.ts can fire subsequent /run-phase requests
    // at the correct URL regardless of which port Next.js picked. This
    // persists on the session so every later phase trigger uses the same
    // origin — no hardcoding, no env var required.
    const baseUrl = new URL(request.url).origin;

    // Presence of non-empty design-study inputs tells us to run /design-study
    // as a prelude — the brand extracted from references overrides the
    // slider-input brandColor if confidence is sufficient.
    const designStudyInputs = input.designStudyInputs;
    const hasDesignStudyPrelude = !!(
      designStudyInputs &&
      (designStudyInputs.images.length > 0 ||
        designStudyInputs.urls.length > 0 ||
        designStudyInputs.prompt.trim().length > 0)
    );

    const state = sessionStore.create({
      userId,
      worktreePath: "",
      inputs: {
        productName: input.productName,
        tagline: input.tagline,
        description: input.description,
        targetUser: input.targetUser,
        features: input.features,
        slug: input.slug,
        namespace: input.namespace,
        displayName: input.displayName,
        brandColor: input.brandColor,
      },
      designStudyInputs: hasDesignStudyPrelude
        ? {
            imageNames: designStudyInputs!.images.map((img) => img.name),
            urls: designStudyInputs!.urls,
            prompt: designStudyInputs!.prompt,
          }
        : undefined,
      phaseFlags: {
        planReview: input.planReview,
        seedDemo: input.seedDemo,
        implementFeatures: input.implementFeatures,
        verifyBuilds: input.verifyBuilds,
        platformTarget: input.platformTarget,
        qaTest: input.qaTest,
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
      await writeIdeaMdToWorktree(worktree.path, {
        productName: input.productName,
        tagline: input.tagline,
        description: input.description,
        targetUser: input.targetUser,
        features: input.features,
        suggestedSlug: input.slug,
      });
    } catch (e) {
      await removeWorktree(state.sessionId);
      sessionStore.remove(state.sessionId);
      const message = e instanceof Error ? e.message : String(e);
      return fail("IDEA_WRITE_FAILED", message, 500);
    }

    // If design-study prelude is enabled, stage the images/URLs/prompt into
    // the worktree's `design/studies/pending/sources/` before kicking off
    // the phase chain. The design-study phase reads from that path.
    if (hasDesignStudyPrelude) {
      try {
        await stageDesignStudyInputs({
          worktreePath: worktree.path,
          images: designStudyInputs!.images,
          urls: designStudyInputs!.urls,
          prompt: designStudyInputs!.prompt,
        });
      } catch (e) {
        await removeWorktree(state.sessionId);
        sessionStore.remove(state.sessionId);
        const message = e instanceof Error ? e.message : String(e);
        return fail("STAGE_INPUTS_FAILED", message, 500);
      }
    }

    sessionStore.setStatus(state.sessionId, "idea_written");

    // Open the worktree in the user's editor (default: VS Code). Fire and
    // forget — failure to launch the editor never blocks the session.
    openEditorAtWorktree(worktree.path);

    // Kick off the first phase via HTTP. If design-study prelude was
    // requested, it runs before everything else; the design-study phase
    // handler (in phase-runner.ts) reads the sidecar and calls
    // getFirstPhase(flags) itself after completing.
    const firstPhase = hasDesignStudyPrelude
      ? "design-study"
      : getFirstPhase(state.phaseFlags);
    void triggerNextPhase(state.sessionId, firstPhase);

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

export async function GET() {
  try {
    await requireForgeUser();
    const sessions = sessionStore.all().map((s) => ({
      sessionId: s.sessionId,
      status: s.status,
      worktreePath: s.worktreePath,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    }));
    return ok({ sessions });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
