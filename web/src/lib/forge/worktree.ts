import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const WORKTREE_ROOT =
  process.env.FORGE_WORKTREE_ROOT ?? join(tmpdir(), "triplane-forge");

const REPO_ROOT =
  process.env.FORGE_REPO_ROOT ??
  join(process.cwd(), "..").replace(/\/web\/?$/, "");

export interface WorktreeHandle {
  sessionId: string;
  path: string;
  baseBranch: string;
  sessionBranch: string;
}

function sessionBranchName(sessionId: string): string {
  return `forge-session-${sessionId}`;
}

async function run(
  cmd: string,
  args: string[],
  opts?: { cwd?: string },
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: opts?.cwd ?? REPO_ROOT });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ stdout, stderr, code: code ?? 0 });
    });
  });
}

/**
 * Creates a git worktree on a new branch forked from `baseBranch`.
 *
 * Important: the worktree does NOT check out `baseBranch` directly. Instead it
 * creates a fresh branch `forge-session-<sessionId>` pointing at baseBranch's
 * current HEAD, and checks that out. This is required by /init-app's Step 1
 * branch safety guard, which refuses to run on `main` in the template repo.
 * With a per-session branch, the guard passes, the worktree is free to do
 * structural rewrites, and the session's history is cleanly isolated.
 *
 * After creation, overlays `.claude/skills/` from the `forge` branch so the
 * per-session worktree has access to forge-only skills like `/plan-autoplan`
 * and `/seed-demo` (which live on the forge branch and were never merged to
 * main — see PLAN.md Phase 10). Without this overlay, calls like
 * `Skill({skill: "plan-autoplan"})` return `Unknown skill` and the agent
 * falls back to writing files directly, which breaks the plan-autoplan
 * chain's sub-skill invocation. Overlay is best-effort: if the forge branch
 * isn't reachable or the checkout fails, log and continue — the main skills
 * (ideate, init-app, feature, etc.) still come from `baseBranch`.
 *
 * Override via env var:
 *   FORGE_SKILLS_BRANCH="forge"   # default
 *   FORGE_SKILLS_BRANCH=""        # disable overlay
 */
export async function createWorktree(
  sessionId: string,
  baseBranch = "main",
): Promise<WorktreeHandle> {
  await mkdir(WORKTREE_ROOT, { recursive: true });
  const path = join(WORKTREE_ROOT, sessionId);
  if (existsSync(path)) {
    throw new Error(
      `Worktree already exists at ${path} (session collision?)`,
    );
  }
  const sessionBranch = sessionBranchName(sessionId);
  const { code, stderr } = await run("git", [
    "worktree",
    "add",
    "-b",
    sessionBranch,
    path,
    baseBranch,
  ]);
  if (code !== 0) {
    throw new Error(
      `git worktree add -b ${sessionBranch} failed (code ${code}): ${stderr.trim()}`,
    );
  }

  // Overlay .claude/skills/ from the forge branch so the worktree has the
  // plan-review + seed-demo + stub-external-api skills that live on forge
  // but not on main.
  const skillsBranch = process.env.FORGE_SKILLS_BRANCH ?? "forge";
  if (skillsBranch) {
    const { code: overlayCode, stderr: overlayStderr } = await run(
      "git",
      ["checkout", skillsBranch, "--", ".claude/skills"],
      { cwd: path },
    );
    if (overlayCode !== 0) {
      console.warn(
        `[forge worktree] skills overlay from '${skillsBranch}' failed (code ${overlayCode}): ${overlayStderr.trim()}. ` +
          `The worktree will still work but plan-autoplan / seed-demo / stub-external-api may be unavailable.`,
      );
    } else {
      // Reset the staged overlay so `git status` in the worktree is clean.
      // The files stay on disk — we just don't want them showing up as
      // "staged changes" in /init-app's Step 6 git diff preview.
      await run("git", ["reset", "HEAD", "--", ".claude/skills"], {
        cwd: path,
      }).catch(() => undefined);
    }
  }

  return { sessionId, path, baseBranch, sessionBranch };
}

export async function removeWorktree(sessionId: string): Promise<void> {
  const path = join(WORKTREE_ROOT, sessionId);
  const sessionBranch = sessionBranchName(sessionId);
  if (existsSync(path)) {
    const { code } = await run("git", ["worktree", "remove", "--force", path]);
    if (code !== 0) {
      await rm(path, { recursive: true, force: true });
      await run("git", ["worktree", "prune"]);
    }
  }
  // Delete the dangling branch. Ignore failures — the branch may not exist
  // (fresh session that never got its worktree created) or may already be gone.
  await run("git", ["branch", "-D", sessionBranch]).catch(() => undefined);
}

export function worktreePath(sessionId: string): string {
  return join(WORKTREE_ROOT, sessionId);
}

export function worktreeExists(sessionId: string): boolean {
  return existsSync(join(WORKTREE_ROOT, sessionId));
}
