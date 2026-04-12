// Smoke test for sub-phase 9.1 forge skeleton: worktree + IDEA.md writer.
// Run with: cd web && bun scripts/verify-forge-skeleton.ts

import { createWorktree, removeWorktree } from "../src/lib/forge/worktree";
import { writeIdeaMdToWorktree, buildIdeaMd } from "../src/lib/forge/idea-md-writer";
import { sessionStore } from "../src/lib/forge/session-store";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

async function main() {
  console.log("=== forge skeleton smoke test ===\n");

  // 1. Unit: buildIdeaMd produces valid frontmatter + prose
  console.log("1. buildIdeaMd()");
  const md = buildIdeaMd({
    productName: "Recipe Share",
    tagline: "Share recipes with your cooking circle.",
    description: "Recipe Share is a full-stack app for home cooks.",
    targetUser: "Home cooks 25-45 who already text recipes to friends.",
    features: [
      { name: "Recipes", description: "CRUD recipes with title, ingredients, steps" },
      { name: "Photos", description: "Attach multiple photos per recipe" },
      { name: "Follows", description: "Follow/unfollow other users" },
    ],
    suggestedSlug: "recipe-share",
  });

  // Verify the frontmatter block
  if (!md.startsWith("---\n")) throw new Error("IDEA.md missing opening frontmatter marker");
  if (!md.includes("suggested_slug: recipe-share")) throw new Error("missing suggested_slug");
  if (!md.includes("features:\n  - recipes\n  - photos\n  - follows")) {
    throw new Error("features frontmatter block is wrong: " + md.substring(0, 300));
  }
  if (!md.includes("# Recipe Share")) throw new Error("missing H1");
  if (!md.includes("> Share recipes")) throw new Error("missing tagline blockquote");
  if (!md.includes("## Description")) throw new Error("missing Description section");
  if (!md.includes("## MVP feature backlog")) throw new Error("missing MVP backlog section");
  console.log("   ✓ frontmatter + prose structure OK\n");

  // 2. Integration: sessionStore.create returns a UUID session
  console.log("2. sessionStore.create()");
  const state = sessionStore.create({
    userId: "test-user",
    worktreePath: "",
    inputs: {
      productName: "Recipe Share",
      tagline: "Share recipes with your cooking circle.",
      description: "Test description",
      targetUser: "Test user",
      features: [{ name: "Recipes", description: "CRUD" }],
      slug: "recipe-share",
      namespace: "com.test.recipeshare",
      displayName: "Recipe Share",
    },
    phaseFlags: {
      planReview: false,
      seedDemo: false,
      implementFeatures: false,
      verifyBuilds: false,
    },
    baseUrl: "http://localhost:3000",
  });
  if (!state.sessionId || state.sessionId.length < 10) {
    throw new Error("sessionId not generated: " + state.sessionId);
  }
  if (state.status !== "created") {
    throw new Error("initial status should be 'created', got: " + state.status);
  }
  console.log(`   ✓ session ${state.sessionId.slice(0, 8)}… in-memory state OK\n`);

  // 3. Integration: git worktree add + writeIdeaMdToWorktree
  console.log("3. createWorktree() + writeIdeaMdToWorktree()");
  let handle;
  try {
    handle = await createWorktree(state.sessionId);
    console.log(`   worktree created: ${handle.path}`);

    if (!existsSync(handle.path)) {
      throw new Error("worktree path doesn't exist after createWorktree");
    }

    const { path: ideaPath, bytes } = await writeIdeaMdToWorktree(handle.path, {
      productName: state.inputs.productName,
      tagline: state.inputs.tagline,
      description: state.inputs.description,
      targetUser: state.inputs.targetUser,
      features: state.inputs.features,
      suggestedSlug: state.inputs.slug,
    });
    console.log(`   wrote ${bytes} bytes to ${ideaPath}`);

    const content = await readFile(ideaPath, "utf-8");
    if (!content.startsWith("---\n")) throw new Error("IDEA.md in worktree missing frontmatter");
    if (!content.includes("# Recipe Share")) throw new Error("IDEA.md in worktree missing H1");
    if (!content.includes("  - recipes")) throw new Error("IDEA.md in worktree missing features list");
    console.log("   ✓ IDEA.md content verified\n");

    // 4. Cleanup: removeWorktree should succeed on a dirty worktree
    console.log("4. removeWorktree() cleanup");
    await removeWorktree(state.sessionId);
    if (existsSync(handle.path)) {
      throw new Error("worktree path still exists after removeWorktree");
    }
    console.log("   ✓ worktree removed\n");
  } catch (e) {
    // Best-effort cleanup on failure
    if (handle) await removeWorktree(state.sessionId).catch(() => {});
    throw e;
  }

  // 5. Cleanup: remove the test session
  sessionStore.remove(state.sessionId);
  console.log("=== all checks passed ===");
}

main().catch((e) => {
  console.error("\nFAILED:", e);
  process.exit(1);
});
