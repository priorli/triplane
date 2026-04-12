import { spawn } from "node:child_process";

/**
 * Open a forge worktree in the user's editor immediately after it's
 * created and the initial `IDEA.md` is written. Fire-and-forget: the
 * forge session is NEVER blocked or failed by editor issues — if the
 * editor binary isn't in PATH, we log a warning to the server console
 * and move on.
 *
 * Defaults to `code` (VS Code's CLI, available after "Shell Command:
 * Install 'code' command in PATH" has been run once from the VS Code
 * palette). Override via env var for other editors:
 *
 *   FORGE_EDITOR_COMMAND="cursor"         # Cursor
 *   FORGE_EDITOR_COMMAND="code-insiders"  # VS Code Insiders
 *   FORGE_EDITOR_COMMAND="windsurf"       # Windsurf
 *   FORGE_EDITOR_COMMAND="idea"           # IntelliJ / JetBrains
 *   FORGE_EDITOR_COMMAND="subl"           # Sublime Text
 *
 * Disable auto-open entirely:
 *
 *   FORGE_EDITOR_COMMAND=""
 *
 * The spawn is `detached: true` with `stdio: "ignore"` and `child.unref()`
 * so the editor process lives independently of the Next.js worker —
 * closing the editor doesn't affect the forge session, and a long-running
 * forge session doesn't pin the editor window.
 */
export function openEditorAtWorktree(worktreePath: string): void {
  const raw = process.env.FORGE_EDITOR_COMMAND;
  // Default to `code` if the env var is unset. An explicit empty string
  // ("") disables the feature — that's the escape hatch for users who
  // don't want a window popping up every time they forge a session.
  const command = raw === undefined ? "code" : raw;
  if (!command) return;

  try {
    const child = spawn(command, [worktreePath], {
      detached: true,
      stdio: "ignore",
      // Don't inherit the forge worker's cwd — editor should open as a
      // fresh window with the worktree as its only argument.
      cwd: undefined,
    });

    child.on("error", (e) => {
      // Most common cause: editor binary not in PATH. Log and move on;
      // the forge session is unaffected.
      console.warn(
        `[forge] openEditor: failed to launch '${command}' at ${worktreePath}: ${e.message}. ` +
          `Set FORGE_EDITOR_COMMAND to a different editor, or FORGE_EDITOR_COMMAND="" to disable.`,
      );
    });

    // Detach from the parent process so the editor survives forge restarts
    // and doesn't block Node from exiting.
    child.unref();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.warn(
      `[forge] openEditor: spawn threw synchronously for '${command}' at ${worktreePath}: ${message}`,
    );
  }
}
