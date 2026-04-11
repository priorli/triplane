import { requireForgeUser } from "@/lib/forge/auth";
import { sessionStore, type ForgeEvent } from "@/lib/forge/session-store";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const POLL_INTERVAL_MS = 200;
const MAX_IDLE_MS = 60_000;

function encodeSSE(event: ForgeEvent): string {
  return [
    `id: ${event.id}`,
    `event: ${event.type}`,
    `data: ${JSON.stringify(event)}`,
    "",
    "",
  ].join("\n");
}

export async function GET(request: Request, { params }: RouteContext) {
  await requireForgeUser();

  const { id: sessionId } = await params;
  const session = sessionStore.get(sessionId);
  if (!session) {
    return new Response(
      JSON.stringify({ error: { code: "NOT_FOUND", message: "session not found" } }),
      {
        status: 404,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const lastEventIdHeader = request.headers.get("Last-Event-ID");
  const initialLastId = lastEventIdHeader ? Number(lastEventIdHeader) : 0;

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let lastId = Number.isFinite(initialLastId) ? initialLastId : 0;
      let idleSince = Date.now();

      const close = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      // Heartbeat so intermediaries don't drop the connection
      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          close();
        }
      }, 15_000);

      const tick = async () => {
        while (!closed) {
          const events = sessionStore.eventsSince(sessionId, lastId);
          if (events.length > 0) {
            idleSince = Date.now();
            for (const event of events) {
              try {
                controller.enqueue(encoder.encode(encodeSSE(event)));
              } catch {
                close();
                return;
              }
              lastId = event.id;
              if (event.type === "done" || event.type === "error") {
                // Flush a final sentinel then close
                close();
                return;
              }
            }
          }

          if (Date.now() - idleSince > MAX_IDLE_MS) {
            // Safety cutoff — the forge session is stuck or the worker died.
            // Client will reconnect with Last-Event-ID if they want.
            close();
            return;
          }

          await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        }
      };

      request.signal.addEventListener("abort", () => close());

      void tick();

      // Cleanup when the stream is cancelled
      const cancel = () => {
        clearInterval(heartbeat);
        close();
      };
      // @ts-expect-error — cancel is called automatically by ReadableStream
      this.__cancel = cancel;
    },
    cancel() {
      // Invoked by the runtime when the client disconnects
      // @ts-expect-error — set in start()
      this.__cancel?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
