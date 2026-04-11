"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
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
    null | "abort" | "discard" | "copy" | "resume" | "retry"
  >(null);
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

        if (event.type === "done" || event.type === "error") {
          source.close();
          setConnected(false);
        }
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
            {isReady && (
              <>
                <a
                  href={downloadUrl}
                  className={buttonVariants({ variant: "default" })}
                  download
                >
                  Download tar.gz
                </a>
                <Button
                  variant="outline"
                  onClick={handleCopyPath}
                  disabled={actionBusy !== null || !worktreePath}
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
              <Button
                variant="outline"
                onClick={handleRetry}
                disabled={actionBusy !== null}
                title="Start over with a fresh worktree, using the same form inputs"
              >
                {actionBusy === "retry" ? "Retrying…" : "Retry"}
              </Button>
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

      <Card>
        <CardHeader>
          <CardTitle>Event stream</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 max-h-[32rem] overflow-y-auto text-xs font-mono">
          {visibleEvents.length === 0 && (
            <p className="text-muted-foreground italic">Waiting for events…</p>
          )}
          {visibleEvents.map((event) => (
            <EventRow key={event.id} event={event} />
          ))}
        </CardContent>
      </Card>

      <ApprovalDialog
        pending={pendingApproval}
        resolving={resolvingApprovalId === pendingApproval?.approvalId}
        onApprove={() => resolveApproval("approved")}
        onReject={(note) => resolveApproval("rejected", note)}
      />
    </div>
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

function EventRow({ event }: { event: ForgeEvent }) {
  const payload = event.payload;
  let summary: string;
  switch (event.type) {
    case "status":
      summary = `→ ${payload.status}`;
      break;
    case "step_progress":
      summary = `assistant turn (${payload.sdkMessageType ?? "?"})`;
      break;
    case "step_complete":
      summary = `result: turns=${payload.numTurns} cost=$${Number(payload.totalCostUsd ?? 0).toFixed(4)}`;
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
