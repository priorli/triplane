import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { sessionStore } from "@/lib/forge/session-store";
import { DesignShowcase } from "@/components/design-showcase";

/**
 * Preview page for a forge session's applied design. Rendered by the FORGE's
 * own Next.js server — not a dev server inside the session worktree — so the
 * preview is instant, same-origin, and doesn't depend on booting a second
 * Next.js instance.
 *
 * We read the worktree's freshly-regenerated `web/src/app/generated/tokens.css`
 * and inject it as an inline `<style>` tag. Because the forge's own globals
 * import tokens.css earlier in the cascade, the worktree's `:root`/`.dark`
 * rules override the forge's values and <DesignShowcase /> renders with the
 * applied brand/fonts/radius/accent.
 *
 * Mounted at `/[locale]/(tools)/forge/sessions/[id]/preview`. Embedded as an
 * iframe inside the design-apply approval dialog.
 */
export default async function ForgeSessionPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = sessionStore.get(id);

  if (!session) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Session not found. It may have been discarded or the forge server
        restarted.
      </div>
    );
  }

  const cssPath = join(
    session.worktreePath,
    "web",
    "src",
    "app",
    "generated",
    "tokens.css",
  );
  let tokenCss = "";
  try {
    tokenCss = await readFile(cssPath, "utf8");
  } catch {
    // If the worktree hasn't produced tokens.css yet we fall back to the
    // forge's own tokens — at least the showcase still renders.
  }

  return (
    <>
      {tokenCss && <style dangerouslySetInnerHTML={{ __html: tokenCss }} />}
      <div className="space-y-6 pb-16">
        <header className="space-y-1">
          <h1 className="text-lg font-semibold">Design preview</h1>
          <p className="text-xs text-muted-foreground">
            Rendered with the worktree's applied tokens. Close the iframe or
            approve/reject in the parent dialog.
          </p>
        </header>
        <DesignShowcase />
      </div>
    </>
  );
}
