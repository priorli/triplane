import { spawn } from "node:child_process";
import { dirname, basename } from "node:path";
import { requireForgeUser } from "@/lib/forge/auth";
import { sessionStore } from "@/lib/forge/session-store";
import { worktreeExists } from "@/lib/forge/worktree";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const EXCLUDES = [
  ".git",
  "node_modules",
  ".next",
  "build",
  ".gradle",
  ".kotlin",
  "web/src/app/generated",
  "dist",
  ".turbo",
  ".vercel",
];

function failJson(code: string, message: string, status: number): Response {
  return new Response(
    JSON.stringify({ error: { code, message } }),
    {
      status,
      headers: { "Content-Type": "application/json" },
    },
  );
}

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    await requireForgeUser();
    const { id: sessionId } = await params;
    const session = sessionStore.get(sessionId);
    if (!session) {
      return failJson("NOT_FOUND", "session not found", 404);
    }
    if (!session.worktreePath || !worktreeExists(sessionId)) {
      return failJson("WORKTREE_MISSING", "worktree no longer exists", 410);
    }

    const parent = dirname(session.worktreePath);
    const base = basename(session.worktreePath);

    const excludeArgs = EXCLUDES.flatMap((p) => [
      "--exclude",
      `${base}/${p}`,
    ]);

    const child = spawn(
      "tar",
      ["-czf", "-", ...excludeArgs, "-C", parent, base],
      { stdio: ["ignore", "pipe", "pipe"] },
    );

    let stderr = "";
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        child.stdout?.on("data", (chunk: Buffer) => {
          controller.enqueue(new Uint8Array(chunk));
        });
        child.stdout?.on("end", () => {
          controller.close();
        });
        child.on("error", (err) => {
          controller.error(err);
        });
        child.on("close", (code) => {
          if (code !== 0 && code !== null) {
            controller.error(
              new Error(`tar exited with code ${code}: ${stderr.trim()}`),
            );
          }
        });
      },
      cancel() {
        child.kill("SIGTERM");
      },
    });

    const filename = `${session.inputs.slug || "triplane-forge"}-${sessionId.slice(0, 8)}.tar.gz`;

    return new Response(stream, {
      headers: {
        "Content-Type": "application/gzip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof Response) return e;
    const message = e instanceof Error ? e.message : String(e);
    return failJson("DOWNLOAD_FAILED", message, 500);
  }
}
