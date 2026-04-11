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
