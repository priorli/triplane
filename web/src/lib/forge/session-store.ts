import { randomUUID } from "node:crypto";

export type SessionStatus =
  | "created"
  | "idea_written"
  | "bootstrapping"
  | "awaiting_approval"
  | "building"
  | "spec_drafting"
  | "verifying"
  | "testing"
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

/**
 * Design-study session inputs, written into the worktree under
 * `design/studies/pending/sources/` before the skill runs. `imageNames`
 * references files relative to that directory; the skill reads them via
 * its normal vision pipeline.
 */
export interface DesignStudyInputs {
  imageNames: string[];
  urls: string[];
  prompt: string;
}

export type SessionType = "bootstrap" | "design-study";

/**
 * Which forge phases the user enabled when the session was created. Stored
 * on the session so that each phase can look up its own successor without
 * needing a long-lived worker closure — any HTTP request handler can read
 * these flags from the session store and trigger the next phase via
 * `triggerNextPhase()`.
 */
export type PlatformTarget = "web" | "mobile" | "all";

export interface PhaseFlags {
  planReview: boolean;
  seedDemo: boolean;
  implementFeatures: boolean;
  verifyBuilds: boolean;
  platformTarget: PlatformTarget;
  qaTest: boolean;
}

export interface SessionState {
  sessionId: string;
  userId: string;
  worktreePath: string;
  /**
   * Discriminator between the bootstrap pipeline (plan-review → init-app →
   * seed-demo → …) and the design-study single-phase flow. Bootstrap is the
   * default for backward compatibility.
   */
  type: SessionType;
  inputs: SessionInputs;
  /**
   * Design-study-specific inputs. Populated only when `type === "design-study"`.
   */
  designStudyInputs?: DesignStudyInputs;
  /**
   * Timestamped directory name under `design/studies/` where the prelude's
   * output landed (e.g. `20260413T123045`). Set by the design-study phase
   * handler after it renames `pending/` → `<timestamp>/`; consumed by the
   * downstream `design-apply` phase to locate `design-study-result.json`.
   */
  designStudyTimestampDir?: string;
  /**
   * The per-session phase toggles the user selected when creating the
   * forge session. Read by phase-runner.ts's `getNextPhase()` to chain
   * the forge pipeline HTTP-hop by HTTP-hop. Ignored for design-study sessions
   * (which have a fixed single-phase pipeline).
   */
  phaseFlags: PhaseFlags;
  /**
   * The HTTP origin (protocol + host + port) where this session's Next.js
   * server is reachable. Extracted from the incoming POST /sessions
   * request at creation time and used by `triggerNextPhase()` to fire
   * the next phase's HTTP request at the correct port — so we don't have
   * to hardcode localhost:3000 or require a FORGE_BASE_URL env var.
   *
   * Example: "http://localhost:3001"
   */
  baseUrl: string;
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
    phaseFlags: PhaseFlags;
    baseUrl: string;
    type?: SessionType;
    designStudyInputs?: DesignStudyInputs;
  }): SessionState {
    const sessionId = randomUUID();
    const now = new Date();
    const state: SessionState = {
      sessionId,
      userId: args.userId,
      worktreePath: args.worktreePath,
      type: args.type ?? "bootstrap",
      inputs: args.inputs,
      designStudyInputs: args.designStudyInputs,
      phaseFlags: args.phaseFlags,
      baseUrl: args.baseUrl,
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
