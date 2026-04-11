import { writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface IdeaMdInput {
  productName: string;
  tagline: string;
  description: string;
  targetUser: string;
  features: Array<{ name: string; description: string }>;
  suggestedSlug: string;
  outOfScope?: string[];
  constraints?: string[];
  openQuestions?: string[];
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function buildIdeaMd(input: IdeaMdInput): string {
  const featureSlugs = input.features.map((f) => slugify(f.name));

  const lines: string[] = [];
  lines.push("---");
  lines.push(`suggested_slug: ${input.suggestedSlug}`);
  lines.push("features:");
  for (const slug of featureSlugs) {
    lines.push(`  - ${slug}`);
  }
  lines.push("---");
  lines.push("");
  lines.push(`# ${input.productName}`);
  lines.push("");
  lines.push(`> ${input.tagline}`);
  lines.push("");
  lines.push("## Description");
  lines.push("");
  lines.push(input.description);
  lines.push("");
  lines.push("## Target user");
  lines.push("");
  lines.push(input.targetUser);
  lines.push("");
  lines.push("## MVP feature backlog");
  lines.push("");
  input.features.forEach((f, i) => {
    lines.push(`${i + 1}. ${f.name} — ${f.description}`);
  });
  lines.push("");
  lines.push("## Out of scope (v0.1)");
  lines.push("");
  if (input.outOfScope && input.outOfScope.length > 0) {
    for (const item of input.outOfScope) {
      lines.push(`- ${item}`);
    }
  } else {
    lines.push("_(none yet)_");
  }
  lines.push("");
  lines.push("## Constraints");
  lines.push("");
  if (input.constraints && input.constraints.length > 0) {
    for (const item of input.constraints) {
      lines.push(`- ${item}`);
    }
  } else {
    lines.push("_(none yet)_");
  }
  lines.push("");
  lines.push("## Open questions");
  lines.push("");
  if (input.openQuestions && input.openQuestions.length > 0) {
    for (const item of input.openQuestions) {
      lines.push(`- ${item}`);
    }
  } else {
    lines.push("_(none yet)_");
  }
  lines.push("");
  return lines.join("\n");
}

export async function writeIdeaMdToWorktree(
  worktreePath: string,
  input: IdeaMdInput,
): Promise<{ path: string; bytes: number }> {
  const content = buildIdeaMd(input);
  const path = join(worktreePath, "IDEA.md");
  await writeFile(path, content, "utf-8");
  return { path, bytes: Buffer.byteLength(content, "utf-8") };
}

export { slugify };
