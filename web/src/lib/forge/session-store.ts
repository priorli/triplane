import { randomUUID } from "node:crypto";

export type SessionStatus =
  | "created"
  | "idea_written"
  | "bootstrapping"
  | "awaiting_approval"
  | "building"
  | "spec_drafting"
  | "ready"
  | "failed"
  | "discarded";

export type ForgeEventType =
  | "status"
  | "step_start"
  | "step_progress"
  | "step_complete"
  | "bash_output"
  | "approval_request"
  | "approval_resolved"
  | "error"
  | "done";

export interface ForgeEvent {
  id: number;
  sessionId: string;
  type: ForgeEventType;
  timestamp: string;
  payload: Record<string, unknown>;
}

export interface PendingApproval {
  approvalId: string;
  title: string;
  body: string;
  resolve: (decision: { approved: boolean; note?: string }) => void;
}

export interface SessionInputs {
  productName: string;
  tagline: string;
  description: string;
  targetUser: string;
  features: Array<{ name: string; description: string }>;
  slug: string;
  namespace: string;
  displayName: string;
  brandColor?: { L: number; C: number; h: number };
}

export interface SessionState {
  sessionId: string;
  userId: string;
  worktreePath: string;
  inputs: SessionInputs;
  status: SessionStatus;
  events: ForgeEvent[];
  pendingApprovals: Map<string, PendingApproval>;
  createdAt: Date;
  updatedAt: Date;
  workerPid: number | null;
  errorMessage: string | null;
  abortController: AbortController | null;
}

class SessionStore {
  private sessions = new Map<string, SessionState>();
  private nextEventId = 1;

  create(args: {
    userId: string;
    worktreePath: string;
    inputs: SessionInputs;
  }): SessionState {
    const sessionId = randomUUID();
    const now = new Date();
    const state: SessionState = {
      sessionId,
      userId: args.userId,
      worktreePath: args.worktreePath,
      inputs: args.inputs,
      status: "created",
      events: [],
      pendingApprovals: new Map(),
      createdAt: now,
      updatedAt: now,
      workerPid: null,
      errorMessage: null,
      abortController: null,
    };
    this.sessions.set(sessionId, state);
    return state;
  }

  get(sessionId: string): SessionState | undefined {
    return this.sessions.get(sessionId);
  }

  setStatus(sessionId: string, status: SessionStatus): void {
    const s = this.sessions.get(sessionId);
    if (!s) return;
    s.status = status;
    s.updatedAt = new Date();
    this.appendEvent(sessionId, "status", { status });
  }

  appendEvent(
    sessionId: string,
    type: ForgeEventType,
    payload: Record<string, unknown>,
  ): ForgeEvent | undefined {
    const s = this.sessions.get(sessionId);
    if (!s) return;
    const event: ForgeEvent = {
      id: this.nextEventId++,
      sessionId,
      type,
      timestamp: new Date().toISOString(),
      payload,
    };
    s.events.push(event);
    s.updatedAt = new Date();
    return event;
  }

  eventsSince(sessionId: string, lastEventId: number): ForgeEvent[] {
    const s = this.sessions.get(sessionId);
    if (!s) return [];
    return s.events.filter((e) => e.id > lastEventId);
  }

  registerApproval(
    sessionId: string,
    approval: PendingApproval,
  ): void {
    const s = this.sessions.get(sessionId);
    if (!s) return;
    s.pendingApprovals.set(approval.approvalId, approval);
  }

  resolveApproval(
    sessionId: string,
    approvalId: string,
    decision: { approved: boolean; note?: string },
  ): boolean {
    const s = this.sessions.get(sessionId);
    if (!s) return false;
    const approval = s.pendingApprovals.get(approvalId);
    if (!approval) return false;
    approval.resolve(decision);
    s.pendingApprovals.delete(approvalId);
    return true;
  }

  setWorkerPid(sessionId: string, pid: number | null): void {
    const s = this.sessions.get(sessionId);
    if (!s) return;
    s.workerPid = pid;
    s.updatedAt = new Date();
  }

  setAbortController(
    sessionId: string,
    controller: AbortController | null,
  ): void {
    const s = this.sessions.get(sessionId);
    if (!s) return;
    s.abortController = controller;
    s.updatedAt = new Date();
  }

  abort(sessionId: string, reason = "aborted by user"): boolean {
    const s = this.sessions.get(sessionId);
    if (!s) return false;
    if (s.abortController && !s.abortController.signal.aborted) {
      s.abortController.abort();
    }
    for (const approval of s.pendingApprovals.values()) {
      approval.resolve({ approved: false, note: reason });
    }
    s.pendingApprovals.clear();
    return true;
  }

  fail(sessionId: string, errorMessage: string): void {
    const s = this.sessions.get(sessionId);
    if (!s) return;
    s.status = "failed";
    s.errorMessage = errorMessage;
    s.updatedAt = new Date();
    this.appendEvent(sessionId, "error", { message: errorMessage });
  }

  remove(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  all(): SessionState[] {
    return Array.from(this.sessions.values());
  }
}

const globalKey = "__triplane_forge_session_store__" as const;
type GlobalWithStore = typeof globalThis & { [globalKey]?: SessionStore };

function getSessionStore(): SessionStore {
  const g = globalThis as GlobalWithStore;
  if (!g[globalKey]) {
    g[globalKey] = new SessionStore();
  }
  return g[globalKey];
}

export const sessionStore = getSessionStore();
