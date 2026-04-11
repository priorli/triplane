// Shared types for forge agent runners.
//
// Both `sdk-runner.ts` (uses @anthropic-ai/claude-agent-sdk) and
// `cli-runner.ts` (shells out to the local `claude` CLI) implement the same
// `runAgent` shape. These types live here so neither runner has to import
// from the other, and `agent-runner.ts` is a thin router that re-exports
// them for existing consumers (`worker.ts` imports `ApprovalRequest` etc.
// from `./agent-runner` unchanged).

export interface ApprovalRequest {
  toolName: string;
  title?: string;
  displayName?: string;
  input: Record<string, unknown>;
  blockedPath?: string;
  decisionReason?: string;
}

export interface ApprovalDecision {
  behavior: "allow" | "deny";
  message?: string;
}

export type OnApproval = (request: ApprovalRequest) => Promise<ApprovalDecision>;

/**
 * Callback for every streamed message from the runner. The payload shape is
 * "SDKMessage-ish" — the SDK path passes actual SDKMessage instances, and
 * the CLI path passes parsed stream-json events which happen to use the
 * same field names for the fields we care about (`type`, `uuid`, `subtype`,
 * `is_error`, `total_cost_usd`, `num_turns`, `duration_ms`).
 *
 * Callers should not rely on the full SDK type — treat it as `unknown` and
 * narrow on `msg.type`.
 */
export type OnMessage = (msg: unknown) => void;

export interface RunAgentArgs {
  /** Absolute path to the worktree the agent should run in. */
  cwd: string;
  /** The user prompt that triggers the run. For /init-app: `Run /init-app`. */
  prompt: string;
  /** Optional forge session ID for event emission to the session store. */
  sessionId?: string;
  /** Optional abort signal to cancel the run. */
  abortController?: AbortController;
  /** Callback for every streamed message. Use to log or stream to SSE. */
  onMessage?: OnMessage;
  /**
   * Callback for approval gates. Used only by the SDK runner — the CLI
   * runner does NOT support per-tool approvals (the `claude` CLI lacks a
   * `--permission-prompt-tool` flag in v2.1.101). In CLI mode, this is
   * silently ignored; the CLI runs with `--permission-mode bypassPermissions`.
   * If you need per-tool browser approvals, set `FORGE_USE_SDK=1` in the
   * environment to force the SDK path.
   */
  onApproval?: OnApproval;
  /**
   * Permission mode. Honored by the SDK runner; on the CLI runner, this is
   * always effectively `bypassPermissions` regardless of what's passed (see
   * `onApproval` above for rationale).
   */
  permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan";
  /**
   * Max turns before the run forcibly stops. Honored by the SDK runner.
   * The CLI runner does NOT pass this through — `claude` in v2.1.101 has
   * no `--max-turns` flag. `maxBudgetUsd` (which the CLI does honor) is the
   * effective backstop instead.
   */
  maxTurns?: number;
  /** Max budget in USD. Honored by both runners. Defaults to 5 dollars. */
  maxBudgetUsd?: number;
  /**
   * When true, resume the most recent persisted conversation in `cwd` instead
   * of starting a fresh one. CLI-only (maps to `claude -c`). The SDK runner
   * throws on this flag — resume-through-SDK is a v2 feature. The `prompt`
   * field becomes the continuation message appended to the prior conversation.
   */
  resume?: boolean;
}

export interface RunAgentResult {
  /** All streamed messages, in order. Shape is runner-specific. */
  messages: unknown[];
  /** True if the run finished without error. */
  completed: boolean;
  /** Final cost in USD reported by the runner's `result` event. */
  totalCostUsd?: number;
  /** Number of turns the run took. */
  numTurns?: number;
  /** If `completed === false`, the failure reason. */
  errorMessage?: string;
}
