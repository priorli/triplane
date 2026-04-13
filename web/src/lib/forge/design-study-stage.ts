import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Stage the user-supplied design-study inputs (images + URLs + prompt) into
 * a freshly-created worktree's `design/studies/pending/sources/` directory.
 * Shared between `POST /api/v1/forge/design-studies` (standalone study flow)
 * and `POST /api/v1/forge/sessions` (bootstrap-with-prelude flow).
 *
 * Images are base64-decoded; name is sanitized to prevent path traversal.
 */
export interface StageDesignStudyArgs {
  worktreePath: string;
  images: Array<{ name: string; mimeType: string; base64: string }>;
  urls: string[];
  prompt: string;
}

export async function stageDesignStudyInputs(
  args: StageDesignStudyArgs,
): Promise<void> {
  const sourcesDir = join(
    args.worktreePath,
    "design",
    "studies",
    "pending",
    "sources",
  );
  await mkdir(sourcesDir, { recursive: true });

  for (const img of args.images) {
    const safeName = img.name.replace(/[\\/]/g, "_");
    await writeFile(
      join(sourcesDir, safeName),
      Buffer.from(img.base64, "base64"),
    );
  }

  if (args.urls.length > 0) {
    await writeFile(
      join(sourcesDir, "urls.txt"),
      args.urls.join("\n") + "\n",
      "utf8",
    );
  }

  if (args.prompt.trim().length > 0) {
    await writeFile(
      join(sourcesDir, "prompt.md"),
      args.prompt.trim() + "\n",
      "utf8",
    );
  }
}
