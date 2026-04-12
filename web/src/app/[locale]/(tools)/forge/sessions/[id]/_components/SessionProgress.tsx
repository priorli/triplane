"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import Markdown from "react-markdown";
import { ApprovalDialog, type PendingApproval } from "./ApprovalDialog";

export interface ForgeEvent {
  id: number;
  sessionId: string;
  type: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

interface Props {
  sessionId: string;
  eventsUrl: string;
  initialStatus?: string;
  worktreePath?: string;
}

const TERMINAL_STATUSES = new Set(["ready", "failed", "discarded"]);

export function SessionProgress({
  sessionId,
  eventsUrl,
  initialStatus = "created",
  worktreePath = "",
}: Props) {
  const router = useRouter();
  const [events, setEvents] = useState<ForgeEvent[]>([]);
  const [status, setStatus] = useState<string>(initialStatus);
  const [connected, setConnected] = useState<boolean>(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);
  const [resolvingApprovalId, setResolvingApprovalId] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<
    null | "abort" | "discard" | "copy" | "resume" | "retry" | "open" | "verify" | "run-web" | "run-android" | "run-ios"
  >(null);
  const [devServerUrl, setDevServerUrl] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const approvalInFlight = useRef<Set<string>>(new Set());

  useEffect(() => {
    let closed = false;
    const source = new EventSource(eventsUrl);

    source.onopen = () => {
      setConnected(true);
      setStreamError(null);
    };

    source.onerror = () => {
      if (!closed) {
        setConnected(false);
      }
    };

    const handleEvent = (e: MessageEvent) => {
      // Defensive: SSE can occasionally dispatch a frame where `e.data` is
      // undefined, empty, or the literal string "undefined" — usually from
      // dev-server HMR racing with a partial stream, an onmessage fallback
      // firing on a malformed frame, or a transport edge case on reconnect.
      // Silently ignore those instead of blowing up the stream with a
      // "'undefined' is not valid JSON" error that masks whatever real event
      // came next.
      const raw = e.data;
      if (typeof raw !== "string" || !raw || raw === "undefined") {
        return;
      }
      try {
        const event = JSON.parse(raw) as ForgeEvent;
        setEvents((prev) => [...prev, event]);

        if (event.type === "status" && typeof event.payload.status === "string") {
          setStatus(event.payload.status);
        }

        if (event.type === "approval_request") {
          const approvalId = event.payload.approvalId as string;
          if (!approvalInFlight.current.has(approvalId)) {
            approvalInFlight.current.add(approvalId);
            setPendingApproval({
              approvalId,
              toolName: (event.payload.toolName as string) ?? "?",
              title: (event.payload.title as string | undefined) ?? undefined,
              displayName: (event.payload.displayName as string | undefined) ?? undefined,
              input: (event.payload.input as Record<string, unknown>) ?? {},
              decisionReason: (event.payload.decisionReason as string | undefined) ?? undefined,
            });
          }
        }

        if (event.type === "approval_resolved") {
          const approvalId = event.payload.approvalId as string;
          approvalInFlight.current.delete(approvalId);
          setPendingApproval((cur) =>
            cur && cur.approvalId === approvalId ? null : cur,
          );
        }

        // NOTE: do NOT close the EventSource on "done" or "error" events.
        // Each forge phase (plan-review, init-app, implement-features, …)
        // runs a separate `runAgent()` call, and each emits its own "done"
        // event when its CLI process exits. Closing the stream on the first
        // "done" would kill the SSE before the next phase starts. The SSE
        // server manages its own lifecycle (idle timeout / client disconnect);
        // EventSource auto-reconnects if the server closes. The polling
        // fallback (below) keeps the status pill accurate.
      } catch (err) {
        // Include a short slice of the raw payload in the error so the next
        // occurrence is diagnosable without guessing.
        const detail = raw.length > 120 ? `${raw.slice(0, 120)}…` : raw;
        setStreamError(
          err instanceof Error
            ? `${err.message} — raw: ${detail}`
            : `parse error — raw: ${detail}`,
        );
      }
    };

    // Named event listeners — ForgeEvent.type is sent as the SSE `event` field
    for (const evt of [
      "status",
      "step_start",
      "step_progress",
      "step_complete",
      "bash_output",
      "approval_request",
      "approval_resolved",
      "error",
      "done",
    ]) {
      source.addEventListener(evt, handleEvent as EventListener);
    }
    // Also a fallback for unnamed events
    source.onmessage = handleEvent;

    return () => {
      closed = true;
      source.close();
    };
  }, [eventsUrl]);

  // Polling fallback for the status pill. SSE is the primary event source,
  // but in dev mode (Next.js Turbopack HMR) a module reload can desync the
  // in-memory session store, leaving the client stuck on a stale status.
  // This poll hits GET /sessions/{id} every 5s and updates `status` from
  // the server's authoritative view. Stops once status is terminal.
  useEffect(() => {
    let cancelled = false;
    const TERMINAL = new Set(["ready", "failed", "discarded"]);

    const poll = async () => {
      if (cancelled || TERMINAL.has(status)) return;
      try {
        const res = await fetch(`/api/v1/forge/sessions/${sessionId}`, {
          method: "GET",
          cache: "no-store",
        });
        if (!res.ok) return;
        const body = await res.json();
        const serverStatus = body?.data?.status;
        if (typeof serverStatus === "string" && serverStatus !== status) {
          setStatus(serverStatus);
        }
      } catch {
        // Ignore transient errors; next tick retries.
      }
    };

    const interval = setInterval(poll, 5000);
    // Poll once immediately so initial load reflects the server's view
    // even if SSE is slow to connect.
    poll();

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [sessionId, status]);

  async function resolveApproval(decision: "approved" | "rejected", note?: string) {
    if (!pendingApproval) return;
    setResolvingApprovalId(pendingApproval.approvalId);
    try {
      await fetch(`/api/v1/forge/sessions/${sessionId}/approvals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          approvalId: pendingApproval.approvalId,
          decision,
          note,
        }),
      });
    } catch (e) {
      setStreamError(e instanceof Error ? e.message : "approve failed");
    } finally {
      setResolvingApprovalId(null);
      setPendingApproval(null);
    }
  }

  const visibleEvents = useMemo(
    () => events.filter((e) => e.type !== "approval_resolved"),
    [events],
  );

  const isTerminal = TERMINAL_STATUSES.has(status);
  const isReady = status === "ready";
  const downloadUrl = `/api/v1/forge/sessions/${sessionId}/download`;

  async function handleAbort() {
    if (actionBusy) return;
    if (!confirm("Abort this session? The worker will stop but the worktree stays until you discard.")) {
      return;
    }
    setActionBusy("abort");
    setActionNotice(null);
    try {
      const res = await fetch(`/api/v1/forge/sessions/${sessionId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
      }
      setStatus("discarded");
      setActionNotice("Session aborted and worktree removed.");
    } catch (e) {
      setStreamError(e instanceof Error ? e.message : "abort failed");
    } finally {
      setActionBusy(null);
    }
  }

  async function handleDiscard() {
    if (actionBusy) return;
    if (!confirm("Discard this session and delete the worktree? This cannot be undone.")) {
      return;
    }
    setActionBusy("discard");
    setActionNotice(null);
    try {
      const res = await fetch(`/api/v1/forge/sessions/${sessionId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
      }
      setActionNotice("Session discarded. Redirecting…");
      setTimeout(() => router.push("/forge/new"), 800);
    } catch (e) {
      setStreamError(e instanceof Error ? e.message : "discard failed");
      setActionBusy(null);
    }
  }

  // Watch for dev-server URL from SSE events
  useEffect(() => {
    const latest = events.findLast(
      (e) =>
        e.type === "step_progress" &&
        e.payload.phase === "dev-server" &&
        e.payload.surface === "web" &&
        typeof e.payload.url === "string",
    );
    if (latest && typeof latest.payload.url === "string") {
      setDevServerUrl(latest.payload.url);
    }
  }, [events]);

  async function handleRunDev(surface: "web" | "android" | "ios") {
    const busyKey = `run-${surface}` as typeof actionBusy;
    if (actionBusy) return;
    setActionBusy(busyKey);
    setActionNotice(null);
    try {
      const res = await fetch(
        `/api/v1/forge/sessions/${sessionId}/dev-server`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "start", surface }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { error?: { message?: string } })?.error?.message ??
            `HTTP ${res.status}`,
        );
      }
      const labels = { web: "Web dev server started", android: "Android build + install started", ios: "Opened Xcode project" };
      setActionNotice(labels[surface]);
      setTimeout(() => setActionNotice(null), 5000);
    } catch (e) {
      setStreamError(e instanceof Error ? e.message : `run-${surface} failed`);
    } finally {
      setActionBusy(null);
    }
  }

  async function handleStopDev(surface: "web" | "android" | "ios") {
    try {
      await fetch(`/api/v1/forge/sessions/${sessionId}/dev-server`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop", surface }),
      });
      if (surface === "web") setDevServerUrl(null);
      setActionNotice(`${surface} stopped`);
      setTimeout(() => setActionNotice(null), 3000);
    } catch {
      // ignore
    }
  }

  async function handleVerifyBuilds() {
    if (actionBusy) return;
    setActionBusy("verify");
    setActionNotice(null);
    try {
      const res = await fetch(
        `/api/v1/forge/sessions/${sessionId}/run-phase`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phase: "verify-builds" }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { error?: { message?: string } })?.error?.message ??
            `HTTP ${res.status}`,
        );
      }
      setActionNotice(
        "Build verification started — web + Android + iOS in parallel. Watch the event log.",
      );
    } catch (e) {
      setStreamError(e instanceof Error ? e.message : "verify failed");
    } finally {
      setActionBusy(null);
    }
  }

  async function handleOpenEditor() {
    if (actionBusy) return;
    setActionBusy("open");
    setActionNotice(null);
    try {
      const res = await fetch(
        `/api/v1/forge/sessions/${sessionId}/open-editor`,
        { method: "POST" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
      }
      setActionNotice(
        "Opened in editor. (If nothing happened, set FORGE_EDITOR_COMMAND or check that `code` is in PATH.)",
      );
      setTimeout(() => setActionNotice(null), 5000);
    } catch (e) {
      setStreamError(e instanceof Error ? e.message : "open-editor failed");
    } finally {
      setActionBusy(null);
    }
  }

  async function handleCopyPath() {
    if (!worktreePath) return;
    setActionBusy("copy");
    try {
      const command = `code ${worktreePath}`;
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(command);
        setActionNotice(`Copied: ${command}`);
      } else {
        setActionNotice(`Copy manually: ${command}`);
      }
    } catch (e) {
      setStreamError(e instanceof Error ? e.message : "copy failed");
    } finally {
      setActionBusy(null);
    }
  }

  async function handleResume() {
    if (actionBusy) return;
    setActionBusy("resume");
    setActionNotice(null);
    try {
      const res = await fetch(`/api/v1/forge/sessions/${sessionId}/resume`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
      }
      // Status will transition via SSE (bootstrapping → ready | failed).
      setStatus("bootstrapping");
      setActionNotice("Resuming session — streaming from where it stopped…");
    } catch (e) {
      setStreamError(e instanceof Error ? e.message : "resume failed");
    } finally {
      setActionBusy(null);
    }
  }

  async function handleRetry() {
    if (actionBusy) return;
    if (
      !confirm(
        "Retry this session? The current worktree will be deleted and a fresh /init-app run will start with the same form inputs.",
      )
    ) {
      return;
    }
    setActionBusy("retry");
    setActionNotice(null);
    try {
      const res = await fetch(`/api/v1/forge/sessions/${sessionId}/retry`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
      }
      const body = await res.json();
      const newSessionId = body?.data?.sessionId as string | undefined;
      if (!newSessionId) {
        throw new Error("retry response missing sessionId");
      }
      setActionNotice("Retrying — redirecting to the new session…");
      setTimeout(() => router.push(`/forge/sessions/${newSessionId}`), 500);
    } catch (e) {
      setStreamError(e instanceof Error ? e.message : "retry failed");
      setActionBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>Session status</CardTitle>
          <StatusPill status={status} connected={connected} />
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="text-muted-foreground font-mono break-all">{sessionId}</p>
          {streamError && (
            <p className="text-destructive">Stream error: {streamError}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {worktreePath && (
            <p className="text-xs text-muted-foreground font-mono break-all">
              {worktreePath}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {worktreePath && status !== "discarded" && (
              <>
                <Button
                  variant="default"
                  onClick={handleOpenEditor}
                  disabled={actionBusy !== null}
                  title="Open the worktree in your editor (respects FORGE_EDITOR_COMMAND; default: VS Code `code`)"
                >
                  {actionBusy === "open" ? "Opening…" : "Open in editor"}
                </Button>
                <a
                  href={downloadUrl}
                  className={buttonVariants({ variant: "outline" })}
                  download
                  title="Download the worktree as a tar.gz archive (works on any non-discarded session)"
                >
                  Download tar.gz
                </a>
                <Button
                  variant="outline"
                  onClick={handleCopyPath}
                  disabled={actionBusy !== null}
                  title="Copy `code <worktreePath>` to the clipboard"
                >
                  {actionBusy === "copy" ? "Copying…" : "Copy `code <path>`"}
                </Button>
              </>
            )}
            {!isTerminal && (
              <Button
                variant="outline"
                onClick={handleAbort}
                disabled={actionBusy !== null}
              >
                {actionBusy === "abort" ? "Aborting…" : "Abort"}
              </Button>
            )}
            {status === "failed" && (
              <>
                <Button
                  variant="default"
                  onClick={handleResume}
                  disabled={actionBusy !== null}
                  title="Continue from where the CLI stopped, using the existing worktree (claude -c)"
                >
                  {actionBusy === "resume" ? "Resuming…" : "Resume"}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleRetry}
                  disabled={actionBusy !== null}
                  title="Start over with a fresh worktree, using the same form inputs"
                >
                  {actionBusy === "retry" ? "Retrying…" : "Retry"}
                </Button>
              </>
            )}
            {status === "ready" && (
              <>
                <Button
                  variant="outline"
                  onClick={() => handleRunDev("web")}
                  disabled={actionBusy !== null}
                  title="Start the Next.js dev server (bun run dev) in the worktree"
                >
                  {actionBusy === "run-web" ? "Starting…" : "Run web"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleRunDev("android")}
                  disabled={actionBusy !== null}
                  title="Build + install on connected Android emulator/device (./gradlew :composeApp:installDebug)"
                >
                  {actionBusy === "run-android" ? "Installing…" : "Run Android"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleRunDev("ios")}
                  disabled={actionBusy !== null}
                  title="Open the Xcode project — press ⌘R in Xcode to build + run in simulator"
                >
                  {actionBusy === "run-ios" ? "Opening…" : "Run iOS"}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleVerifyBuilds}
                  disabled={actionBusy !== null}
                  title="Run web + Android + iOS builds in parallel (direct subprocess, no LLM cost, ~1-2 min)"
                >
                  {actionBusy === "verify" ? "Verifying…" : "Verify builds"}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleRetry}
                  disabled={actionBusy !== null}
                  title="Start over with a fresh worktree, using the same form inputs"
                >
                  {actionBusy === "retry" ? "Retrying…" : "Retry"}
                </Button>
              </>
            )}
            {devServerUrl && (
              <div className="w-full flex items-center gap-2 rounded-md border bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2 text-sm">
                <span className="text-emerald-700 dark:text-emerald-300 font-medium">
                  Web running:
                </span>
                <a
                  href={devServerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-700 dark:text-emerald-300 underline font-mono"
                >
                  {devServerUrl}
                </a>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleStopDev("web")}
                  className="ml-auto text-xs"
                >
                  Stop
                </Button>
              </div>
            )}
            {status !== "discarded" && (
              <Button
                variant="destructive"
                onClick={handleDiscard}
                disabled={actionBusy !== null}
              >
                {actionBusy === "discard" ? "Discarding…" : "Discard"}
              </Button>
            )}
          </div>
          {actionNotice && (
            <p className="text-xs text-muted-foreground">{actionNotice}</p>
          )}
        </CardContent>
      </Card>

      <details open={!isReady}>
        <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground py-2">
          Pipeline events ({visibleEvents.length})
        </summary>
        <Card>
          <CardContent className="space-y-2 max-h-[32rem] overflow-y-auto text-xs font-mono pt-4">
            {visibleEvents.length === 0 && (
            <p className="text-muted-foreground italic">Waiting for events…</p>
          )}
          {visibleEvents.map((event) => (
            <EventRow key={event.id} event={event} />
          ))}
        </CardContent>
      </Card>
      </details>

      <ApprovalDialog
        pending={pendingApproval}
        resolving={resolvingApprovalId === pendingApproval?.approvalId}
        onApprove={() => resolveApproval("approved")}
        onReject={(note) => resolveApproval("rejected", note)}
      />

      <PromptChat events={events} sessionId={sessionId} status={status} worktreePath={worktreePath} />
    </div>
  );
}

interface PromptRun {
  id: number;
  prompt: string;
  innerEvents: ForgeEvent[];
  complete: boolean;
  result?: {
    status: string;
    durationMs: number;
    totalCostUsd: number;
    numTurns: number;
    errorMessage?: string;
  };
}

function extractPromptRuns(events: ForgeEvent[]): PromptRun[] {
  const runs: PromptRun[] = [];
  let current: PromptRun | null = null;

  for (const event of events) {
    const phase =
      typeof event.payload?.phase === "string" ? event.payload.phase : undefined;

    if (event.type === "step_start" && phase === "prompt") {
      current = {
        id: event.id,
        prompt: String(event.payload.message ?? ""),
        innerEvents: [],
        complete: false,
      };
      runs.push(current);
      continue;
    }

    if (event.type === "step_complete" && phase === "prompt" && current) {
      current.complete = true;
      current.result = {
        status: String(event.payload.status ?? "?"),
        durationMs: Number(event.payload.durationMs ?? 0),
        totalCostUsd: Number(event.payload.totalCostUsd ?? 0),
        numTurns: Number(event.payload.numTurns ?? 0),
        errorMessage: event.payload.errorMessage
          ? String(event.payload.errorMessage)
          : undefined,
      };
      current = null;
      continue;
    }

    // Collect inner events (assistant/user turns) while a prompt run is active
    if (current) {
      current.innerEvents.push(event);
    }
  }

  return runs;
}

function PromptRunView({ run }: { run: PromptRun }) {
  const durationStr = run.result
    ? run.result.durationMs > 60_000
      ? `${(run.result.durationMs / 60_000).toFixed(1)}m`
      : `${(run.result.durationMs / 1000).toFixed(1)}s`
    : "";

  // Filter inner events to only assistant/user turns with content blocks
  const chatEvents = run.innerEvents.filter(
    (e) =>
      e.type === "step_progress" &&
      !e.payload.phase &&
      Array.isArray(e.payload.content) &&
      (e.payload.sdkMessageType === "assistant" ||
        e.payload.sdkMessageType === "user"),
  );

  return (
    <div className="space-y-3 border-l-2 border-primary/20 pl-3">
      <div className="rounded-md bg-primary/5 px-3 py-2 text-sm">
        <span className="text-xs font-medium uppercase text-primary/60">
          You
        </span>
        <p className="mt-0.5 whitespace-pre-wrap">{run.prompt}</p>
      </div>

      {chatEvents.length > 0 && (
        <div className="space-y-2">
          {chatEvents.map((event) => (
            <AssistantTurnRow key={event.id} event={event} />
          ))}
        </div>
      )}

      {!run.complete && chatEvents.length === 0 && (
        <p className="text-xs text-muted-foreground italic animate-pulse">
          Agent is working…
        </p>
      )}

      {run.result && (
        <p className="text-xs text-muted-foreground">
          {run.result.status === "passed" ? "✓" : "✗"}{" "}
          {run.result.status === "passed" ? "Done" : "Failed"}
          {durationStr ? ` in ${durationStr}` : ""}
          {run.result.totalCostUsd > 0
            ? ` · $${run.result.totalCostUsd.toFixed(4)}`
            : ""}
          {run.result.errorMessage
            ? ` — ${run.result.errorMessage.slice(0, 200)}`
            : ""}
        </p>
      )}
    </div>
  );
}

function PromptChat({
  events,
  sessionId,
  status,
  worktreePath,
}: {
  events: ForgeEvent[];
  sessionId: string;
  status: string;
  worktreePath: string;
}) {
  const [prompt, setPrompt] = useState("");
  const [sending, setSending] = useState(false);

  const canPrompt =
    !!worktreePath &&
    status !== "discarded" &&
    status !== "created" &&
    status !== "idea_written";

  const runs = useMemo(() => extractPromptRuns(events), [events]);

  if (!canPrompt) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim() || sending) return;
    setSending(true);
    try {
      const res = await fetch(
        `/api/v1/forge/sessions/${sessionId}/prompt`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: prompt.trim() }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { error?: { message?: string } })?.error?.message ??
            `HTTP ${res.status}`,
        );
      }
      setPrompt("");
    } catch (err) {
      alert(err instanceof Error ? err.message : "prompt failed");
    } finally {
      setSending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Continue developing</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {runs.length > 0 && (
          <details open>
            <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground py-1 mb-2">
              Chat history ({runs.length} prompt{runs.length === 1 ? "" : "s"})
            </summary>
            <div className="space-y-6">
              {runs.map((run) => (
                <PromptRunView key={run.id} run={run} />
              ))}
            </div>
          </details>
        )}

        <form onSubmit={handleSubmit} className="space-y-3 pt-2 border-t">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.currentTarget.value)}
            placeholder="Fix the build error…  /  Add a search bar…  /  Run bun run build and fix whatever fails…"
            className="w-full min-h-[5rem] rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
            disabled={sending}
          />
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={!prompt.trim() || sending}>
              {sending ? "Sending…" : "Send prompt"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Runs <code className="bg-muted px-1 rounded">claude -p</code> in
              the worktree. Uses your subscription, not API credits.
            </p>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function StatusPill({ status, connected }: { status: string; connected: boolean }) {
  const label = status.replace(/_/g, " ");
  const color =
    status === "ready"
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
      : status === "failed"
        ? "bg-destructive/15 text-destructive"
        : status === "awaiting_approval"
          ? "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
          : status === "verifying"
            ? "bg-sky-100 text-sky-900 dark:bg-sky-950/40 dark:text-sky-200"
            : status === "testing"
              ? "bg-teal-100 text-teal-900 dark:bg-teal-950/40 dark:text-teal-200"
              : status === "building"
              ? "bg-violet-100 text-violet-900 dark:bg-violet-950/40 dark:text-violet-200"
              : "bg-muted text-muted-foreground";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${color}`}>
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full ${connected ? "bg-current" : "bg-current opacity-40"}`}
      />
      {label}
    </span>
  );
}

interface ContentBlock {
  type: string;
  text?: string;
  thinking?: string;
  name?: string;
  input?: string;
  toolUseId?: string;
  isError?: boolean;
  raw?: string;
}

function ContentBlockView({ block }: { block: ContentBlock }) {
  if (block.type === "text") {
    const text = block.text ?? "";
    if (!text.trim()) return null;
    return (
      <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed [&_pre]:bg-muted [&_pre]:text-xs [&_pre]:rounded-md [&_pre]:p-3 [&_code]:bg-muted [&_code]:px-1 [&_code]:rounded [&_code]:text-xs">
        <Markdown>{text}</Markdown>
      </div>
    );
  }
  if (block.type === "thinking") {
    const thinking = block.thinking ?? "";
    if (!thinking.trim()) return null;
    return (
      <div className="text-xs italic text-muted-foreground whitespace-pre-wrap border-l-2 border-muted pl-2">
        💭 {thinking}
      </div>
    );
  }
  if (block.type === "tool_use") {
    return (
      <div className="rounded-md border bg-muted/30 text-xs font-mono">
        <div className="border-b bg-muted/50 px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
          🔧 {block.name ?? "?"}
        </div>
        <pre className="max-h-64 overflow-auto px-2 py-1.5 whitespace-pre-wrap break-all">
          {block.input ?? ""}
        </pre>
      </div>
    );
  }
  if (block.type === "tool_result") {
    const tone = block.isError
      ? "border-destructive/40 bg-destructive/5"
      : "border-muted bg-muted/20";
    return (
      <div className={`rounded-md border text-xs font-mono ${tone}`}>
        <div className="border-b bg-muted/40 px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
          {block.isError ? "← tool error" : "← tool result"}
        </div>
        <pre className="max-h-64 overflow-auto px-2 py-1.5 whitespace-pre-wrap break-all">
          {block.text ?? ""}
        </pre>
      </div>
    );
  }
  // Unknown block type — show type + raw preview
  return (
    <div className="text-xs font-mono text-muted-foreground">
      [{block.type}] {block.raw ?? ""}
    </div>
  );
}

function AssistantTurnRow({ event }: { event: ForgeEvent }) {
  const payload = event.payload;
  const role = typeof payload.role === "string" ? payload.role : undefined;
  const sdkType =
    typeof payload.sdkMessageType === "string" ? payload.sdkMessageType : "?";
  const blocks = Array.isArray(payload.content)
    ? (payload.content as ContentBlock[])
    : [];

  const roleLabel = role === "user" ? "user / tool-result" : "assistant";
  const accent =
    role === "user"
      ? "border-l-2 border-sky-400/40 pl-2"
      : "border-l-2 border-violet-400/40 pl-2";

  return (
    <div className={`flex gap-2 ${accent}`}>
      <span className="text-muted-foreground shrink-0 w-20 truncate text-xs">
        {sdkType}
      </span>
      <div className="flex-1 space-y-1.5 min-w-0">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {roleLabel}
        </div>
        {blocks.length === 0 ? (
          <div className="text-xs text-muted-foreground italic">
            (no content blocks — empty turn)
          </div>
        ) : (
          blocks.map((block, i) => <ContentBlockView key={i} block={block} />)
        )}
      </div>
    </div>
  );
}

function EventRow({ event }: { event: ForgeEvent }) {
  const payload = event.payload;
  const phase = typeof payload.phase === "string" ? payload.phase : undefined;

  // For assistant/user events with content blocks, render the rich chat
  // view instead of a one-line summary. The check is: step_progress with
  // content array AND no `phase` (phase events are verify/implement
  // workflow markers, not chat turns).
  if (
    event.type === "step_progress" &&
    !phase &&
    Array.isArray(payload.content) &&
    (payload.sdkMessageType === "assistant" ||
      payload.sdkMessageType === "user")
  ) {
    return <AssistantTurnRow event={event} />;
  }

  let summary: string;
  switch (event.type) {
    case "status":
      summary = `→ ${payload.status}`;
      break;
    case "step_start":
      if (phase === "verify") {
        const surfaces = Array.isArray(payload.surfaces)
          ? payload.surfaces.join(" + ")
          : "?";
        summary = `▶ build verification: ${surfaces}`;
      } else if (phase === "implement") {
        const total = Number(payload.total ?? 0);
        const slugs = Array.isArray(payload.slugs)
          ? (payload.slugs as string[]).join(", ")
          : "?";
        summary = `▶ implementing ${total} feature${total === 1 ? "" : "s"}: ${slugs}`;
      } else if (phase === "prompt") {
        summary = `💬 prompt: ${payload.message ?? "..."}`;
      } else if (phase === "plan-review") {
        summary = `▶ plan review: ${payload.message ?? "starting…"}`;
      } else if (phase === "init-app") {
        summary = `▶ /init-app: ${payload.message ?? "starting…"}`;
      } else if (phase === "seed-demo") {
        summary = `▶ /seed-demo: ${payload.message ?? "starting…"}`;
      } else {
        summary = JSON.stringify(payload).substring(0, 120);
      }
      break;
    case "step_progress":
      if (phase === "verify") {
        summary = `verify (${payload.surface ?? "?"}): running — ${payload.command ?? "?"}`;
      } else if (phase === "implement") {
        const idx = Number(payload.featureIndex ?? 0);
        const total = Number(payload.featureTotal ?? 0);
        summary = `implement (${idx}/${total}): ${payload.slug ?? "?"} — running`;
      } else {
        summary = `assistant turn (${payload.sdkMessageType ?? "?"})`;
      }
      break;
    case "step_complete":
      if (phase === "verify") {
        if (payload.surface) {
          // Per-surface complete
          const duration = Number(payload.durationMs ?? 0);
          const durationStr = duration > 1000 ? `${(duration / 1000).toFixed(1)}s` : `${duration}ms`;
          const icon = payload.status === "passed" ? "✓" : "✗";
          const tail = payload.status === "failed" && payload.stderrTail
            ? ` — ${String(payload.stderrTail).slice(0, 200).replace(/\n/g, " ")}`
            : "";
          summary = `${icon} verify (${payload.surface}): ${payload.status} in ${durationStr}${tail}`;
        } else {
          // Overall verify complete (all three passed)
          const total = Number(payload.totalDurationMs ?? 0);
          const totalStr = total > 1000 ? `${(total / 1000).toFixed(1)}s` : `${total}ms`;
          summary = `✓ build verification passed (3/3 surfaces in ${totalStr})`;
        }
      } else if (phase === "implement") {
        if (payload.status === "skipped") {
          summary = `⊘ implement: ${payload.message ?? "skipped"}`;
        } else if (payload.status === "all_passed") {
          const total = Number(payload.total ?? 0);
          summary = `✓ all ${total} feature${total === 1 ? "" : "s"} implemented`;
        } else if (payload.slug) {
          // Per-feature complete
          const idx = Number(payload.featureIndex ?? 0);
          const total = Number(payload.featureTotal ?? 0);
          const duration = Number(payload.durationMs ?? 0);
          const durationStr = duration > 60_000
            ? `${(duration / 60_000).toFixed(1)}m`
            : duration > 1000
              ? `${(duration / 1000).toFixed(1)}s`
              : `${duration}ms`;
          const cost = Number(payload.totalCostUsd ?? 0);
          const costStr = cost > 0 ? ` cost=$${cost.toFixed(4)}` : "";
          summary = `✓ implement (${idx}/${total}): ${payload.slug} in ${durationStr}${costStr}`;
        } else {
          summary = `implement: ${JSON.stringify(payload).substring(0, 120)}`;
        }
      } else if (
        phase === "plan-review" ||
        phase === "init-app" ||
        phase === "seed-demo" ||
        phase === "prompt" ||
        phase === "qa-test"
      ) {
        const icon = payload.status === "passed" ? "✓" : "✗";
        const duration = Number(payload.durationMs ?? 0);
        const durationStr = duration > 60_000
          ? `${(duration / 60_000).toFixed(1)}m`
          : duration > 1000
            ? `${(duration / 1000).toFixed(1)}s`
            : `${duration}ms`;
        const turns = Number(payload.numTurns ?? 0);
        const cost = Number(payload.totalCostUsd ?? 0);
        const costStr = cost > 0 ? ` cost=$${cost.toFixed(4)}` : "";
        const turnsStr = turns > 0 ? ` turns=${turns}` : "";
        summary = `${icon} ${phase}: ${payload.status} in ${durationStr}${turnsStr}${costStr}`;
      } else {
        summary = `result: turns=${payload.numTurns} cost=$${Number(payload.totalCostUsd ?? 0).toFixed(4)}`;
      }
      break;
    case "approval_request":
      summary = `gate: ${payload.toolName} — ${payload.title ?? payload.displayName ?? "?"}`;
      break;
    case "error":
      summary = `✗ ${payload.message ?? "error"}`;
      break;
    case "done":
      summary = `done (completed=${payload.completed})`;
      break;
    default:
      summary = JSON.stringify(payload).substring(0, 120);
  }
  return (
    <div className="flex gap-2">
      <span className="text-muted-foreground shrink-0 w-20 truncate">{event.type}</span>
      <span className="flex-1 break-all">{summary}</span>
    </div>
  );
}
