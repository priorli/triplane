import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import { ok, fail } from "@/lib/api-response";
import { sessionStore } from "@/lib/forge/session-store";
import { worktreeExists } from "@/lib/forge/worktree";
import { requireForgeUser } from "@/lib/forge/auth";

interface RouteContext {
  params: Promise<{ id: string }>;
}

type Surface = "web" | "android" | "ios";

// In-memory per-session process tracking. Not serializable — lives only in
// the Node process. Web gets a long-running dev server; Android/iOS are
// one-shot build+install commands.
const runningProcesses = new Map<
  string, // `${sessionId}:${surface}`
  { child: ChildProcess; url: string | null; surface: Surface }
>();

function processKey(sessionId: string, surface: Surface): string {
  return `${sessionId}:${surface}`;
}

/**
 * Start, stop, or query the dev server / build process for a specific
 * surface (web / android / ios) in a forge session's worktree.
 *
 * POST body: { action: "start" | "stop", surface: "web" | "android" | "ios" }
 *
 * Web (start):
 *   Spawns `bun run dev` in <worktree>/web/. Long-running. Watches stdout
 *   for "http://localhost:XXXX" to extract the URL. Returns 202.
 *
 * Android (start):
 *   Spawns `./gradlew :composeApp:installDebug` in <worktree>/mobile/.
 *   One-shot build + install on running emulator or connected device.
 *   Returns 202; completion reported via session events.
 *
 * iOS (start):
 *   Opens the Xcode project via `open iosApp.xcodeproj` in <worktree>/mobile/.
 *   Fire-and-forget (Xcode handles the build + simulator run). Returns 200.
 *
 * Any surface (stop):
 *   Kills the running process if one exists.
 */
export async function POST(request: Request, { params }: RouteContext) {
  try {
    await requireForgeUser();
    const { id: sessionId } = await params;

    const session = sessionStore.get(sessionId);
    if (!session) return fail("NOT_FOUND", "session not found", 404);
    if (!worktreeExists(sessionId))
      return fail("WORKTREE_MISSING", "worktree removed", 410);

    const body = await request.json().catch(() => ({}));
    const action = (body as { action?: string }).action;
    const surface = (body as { surface?: string }).surface as Surface | undefined;

    if (!surface || !["web", "android", "ios"].includes(surface)) {
      return fail(
        "INVALID_SURFACE",
        'surface must be "web", "android", or "ios"',
        400,
      );
    }

    const key = processKey(sessionId, surface);

    if (action === "stop") {
      const existing = runningProcesses.get(key);
      if (!existing || existing.child.killed) {
        runningProcesses.delete(key);
        return ok({ stopped: true, surface, wasRunning: false });
      }
      try {
        process.kill(-existing.child.pid!, "SIGTERM");
      } catch {
        existing.child.kill("SIGTERM");
      }
      runningProcesses.delete(key);
      return ok({ stopped: true, surface, wasRunning: true });
    }

    if (action === "start") {
      // Already running?
      const existing = runningProcesses.get(key);
      if (existing && !existing.child.killed) {
        return ok({
          surface,
          running: true,
          url: existing.url,
          alreadyRunning: true,
        });
      }

      if (surface === "web") {
        return startWebDev(sessionId, session.worktreePath, key);
      }
      if (surface === "android") {
        return startAndroidInstall(sessionId, session.worktreePath, key);
      }
      if (surface === "ios") {
        return startIos(sessionId, session.worktreePath);
      }
    }

    return fail("INVALID_ACTION", 'action must be "start" or "stop"', 400);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    await requireForgeUser();
    const { id: sessionId } = await params;

    const results: Record<string, { running: boolean; url: string | null }> = {};
    for (const surface of ["web", "android", "ios"] as Surface[]) {
      const key = processKey(sessionId, surface);
      const existing = runningProcesses.get(key);
      results[surface] = {
        running: !!existing && !existing.child.killed,
        url: existing?.url ?? null,
      };
    }
    return ok(results);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Web: long-running `bun run dev`
// ---------------------------------------------------------------------------

function startWebDev(
  sessionId: string,
  worktreePath: string,
  key: string,
): Response {
  const webDir = join(worktreePath, "web");
  const child = spawn("bun", ["run", "dev"], {
    cwd: webDir,
    env: { ...process.env },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });

  const state = { child, url: null as string | null, surface: "web" as Surface };
  runningProcesses.set(key, state);

  child.stdout?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => {
    const match = chunk.match(/https?:\/\/localhost:(\d+)/);
    if (match && !state.url) {
      state.url = match[0];
      console.log(`[forge dev-server ${sessionId}] web ready: ${state.url}`);
      sessionStore.appendEvent(sessionId, "step_progress", {
        phase: "dev-server",
        surface: "web",
        status: "ready",
        url: state.url,
      });
      // Auto-open in the default browser
      const openChild = spawn("open", [state.url], {
        detached: true,
        stdio: "ignore",
      });
      openChild.unref();
      openChild.on("error", () => {}); // ignore failures
    }
  });
  child.stderr?.on("data", () => {}); // drain

  child.on("close", (code) => {
    console.log(`[forge dev-server ${sessionId}] web exited code=${code}`);
    runningProcesses.delete(key);
    sessionStore.appendEvent(sessionId, "step_complete", {
      phase: "dev-server",
      surface: "web",
      status: "stopped",
      exitCode: code,
    });
  });

  child.unref();
  return ok({ surface: "web", started: true, pid: child.pid }, 202) as Response;
}

// ---------------------------------------------------------------------------
// Android: one-shot `./gradlew :composeApp:installDebug`
// ---------------------------------------------------------------------------

function startAndroidInstall(
  sessionId: string,
  worktreePath: string,
  key: string,
): Response {
  const mobileDir = join(worktreePath, "mobile");
  const child = spawn("./gradlew", [":composeApp:installDebug"], {
    cwd: mobileDir,
    env: { ...process.env },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });

  const state = { child, url: null as string | null, surface: "android" as Surface };
  runningProcesses.set(key, state);

  sessionStore.appendEvent(sessionId, "step_progress", {
    phase: "dev-server",
    surface: "android",
    status: "building",
    message: "Running ./gradlew :composeApp:installDebug…",
  });

  let stderrBuf = "";
  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", (chunk: string) => {
    stderrBuf += chunk;
    if (stderrBuf.length > 8192) stderrBuf = stderrBuf.slice(-8192);
  });
  child.stdout?.on("data", () => {}); // drain

  child.on("close", (code) => {
    const passed = code === 0;
    console.log(
      `[forge dev-server ${sessionId}] android installDebug exit=${code}`,
    );
    runningProcesses.delete(key);
    sessionStore.appendEvent(sessionId, "step_complete", {
      phase: "dev-server",
      surface: "android",
      status: passed ? "installed" : "failed",
      exitCode: code,
      stderrTail: passed ? undefined : stderrBuf.trim().slice(-600),
    });
  });

  child.unref();
  return ok({ surface: "android", started: true, pid: child.pid }, 202) as Response;
}

// ---------------------------------------------------------------------------
// iOS: open Xcode project (fire-and-forget)
// ---------------------------------------------------------------------------

function startIos(sessionId: string, worktreePath: string): Response {
  const xcodeproj = join(worktreePath, "mobile", "iosApp", "iosApp.xcodeproj");
  try {
    const child = spawn("open", [xcodeproj], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    child.on("error", (e) => {
      console.warn(
        `[forge dev-server ${sessionId}] failed to open Xcode: ${e.message}`,
      );
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[forge dev-server ${sessionId}] open Xcode threw: ${msg}`);
  }

  sessionStore.appendEvent(sessionId, "step_progress", {
    phase: "dev-server",
    surface: "ios",
    status: "opened",
    message: "Opened iosApp.xcodeproj in Xcode. Press ⌘R to run.",
  });

  return ok({ surface: "ios", opened: true });
}
