import { query, type Options, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { sessionStore, type SessionState } from "./session-store";

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

export type OnMessage = (msg: SDKMessage) => void;

export interface RunAgentArgs {
  /** Absolute path to the worktree the agent should run in. */
  cwd: string;
  /** The user prompt that triggers the run. For /init-app: `Run /init-app`. */
  prompt: string;
  /** Optional forge session ID for event emission to the session store. */
  sessionId?: string;
  /** Optional abort signal to cancel the run. */
  abortController?: AbortController;
  /** Callback for every SDKMessage. Use to stream to SSE or log. */
  onMessage?: OnMessage;
  /**
   * Callback for approval gates. Called before each tool execution when
   * `permissionMode` triggers a prompt. Return `{ behavior: 'allow' }` to let
   * the tool run, `{ behavior: 'deny', message }` to block it with an
   * explanation the model can read and adapt to.
   *
   * If omitted, falls back to auto-allow (useful in the hello-world test).
   */
  onApproval?: OnApproval;
  /**
   * Permission mode. Defaults to 'acceptEdits' so file edits auto-run but
   * bash commands route through `canUseTool`. Override to 'bypassPermissions'
   * for fully-automated runs (requires `allowDangerouslySkipPermissions`).
   */
  permissionMode?: Options["permissionMode"];
  /**
   * Tool names that auto-allow without firing canUseTool. Defaults to the
   * safe-reads list: Read, Glob, Grep. Bash/Write/Edit/NotebookEdit still
   * route through the approval gate.
   */
  allowedTools?: string[];
  /**
   * Max turns before the run forcibly stops. Safety cap; defaults to 60.
   */
  maxTurns?: number;
  /** Max budget in USD. Safety cap; defaults to 5 dollars. */
  maxBudgetUsd?: number;
}

export interface RunAgentResult {
  messages: SDKMessage[];
  completed: boolean;
  totalCostUsd?: number;
  numTurns?: number;
  errorMessage?: string;
}

const DEFAULT_MAX_TURNS = 60;
const DEFAULT_MAX_BUDGET_USD = 5;
const DEFAULT_SAFE_READ_TOOLS = ["Read", "Glob", "Grep"];

function emitSessionEvent(sessionId: string, msg: SDKMessage) {
  // Project SDKMessage envelopes into the session event queue.
  // Keep payload small: strip large message bodies that aren't meant for UI.
  const payload: Record<string, unknown> = { sdkMessageType: msg.type };

  if (msg.type === "assistant" || msg.type === "user") {
    payload.uuid = (msg as { uuid?: string }).uuid;
  }
  if (msg.type === "result") {
    const result = msg as {
      subtype?: string;
      is_error?: boolean;
      total_cost_usd?: number;
      num_turns?: number;
      duration_ms?: number;
    };
    payload.subtype = result.subtype;
    payload.isError = result.is_error;
    payload.totalCostUsd = result.total_cost_usd;
    payload.numTurns = result.num_turns;
    payload.durationMs = result.duration_ms;
  }

  const eventType =
    msg.type === "result"
      ? "step_complete"
      : msg.type === "assistant"
        ? "step_progress"
        : "status";

  sessionStore.appendEvent(sessionId, eventType, payload);
}

/**
 * Runs an agent against a Triplane worktree using the Claude Agent SDK.
 *
 * Key options locked in:
 * - `cwd` is the worktree path. All file operations + skill discovery are scoped here.
 * - `settingSources: ['project']` enables auto-loading of `.claude/skills/*` and CLAUDE.md
 *   from the worktree. This is how `/init-app`, `/feature add`, etc become invocable.
 * - `tools: { type: 'preset', preset: 'claude_code' }` gives the agent Bash, Read, Edit,
 *   Glob, Grep, and the rest of Claude Code's built-in tool surface. No custom tools needed.
 * - `systemPrompt: { type: 'preset', preset: 'claude_code' }` uses Claude Code's default
 *   system prompt, which includes skill-discovery wiring.
 * - `persistSession: false` keeps session history in memory only. The forge has its own
 *   session store (src/lib/forge/session-store.ts).
 * - `canUseTool` is wired to the optional `onApproval` callback. If omitted, auto-allows.
 */
export async function runAgent(args: RunAgentArgs): Promise<RunAgentResult> {
  const abortController = args.abortController ?? new AbortController();

  const collectedMessages: SDKMessage[] = [];
  let completed = false;
  let totalCostUsd: number | undefined;
  let numTurns: number | undefined;
  let errorMessage: string | undefined;

  const options: Options = {
    cwd: args.cwd,
    settingSources: ["project"],
    systemPrompt: { type: "preset", preset: "claude_code" },
    tools: { type: "preset", preset: "claude_code" },
    allowedTools: args.allowedTools ?? DEFAULT_SAFE_READ_TOOLS,
    permissionMode: args.permissionMode ?? "acceptEdits",
    persistSession: false,
    maxTurns: args.maxTurns ?? DEFAULT_MAX_TURNS,
    maxBudgetUsd: args.maxBudgetUsd ?? DEFAULT_MAX_BUDGET_USD,
    abortController,
    env: {
      ...process.env,
      CLAUDE_AGENT_SDK_CLIENT_APP: "triplane-forge/0.1.2",
    },
    canUseTool: async (toolName, input, ctx) => {
      if (args.onApproval) {
        const decision = await args.onApproval({
          toolName,
          input,
          title: ctx.title,
          displayName: ctx.displayName,
          blockedPath: ctx.blockedPath,
          decisionReason: ctx.decisionReason,
        });
        if (decision.behavior === "deny") {
          return {
            behavior: "deny",
            message: decision.message ?? "Denied by user via forge approval gate.",
            interrupt: false,
          };
        }
        return { behavior: "allow", updatedInput: input };
      }
      return { behavior: "allow", updatedInput: input };
    },
  };

  try {
    const q = query({ prompt: args.prompt, options });

    for await (const msg of q) {
      collectedMessages.push(msg);
      args.onMessage?.(msg);
      if (args.sessionId) {
        emitSessionEvent(args.sessionId, msg);
      }

      if (msg.type === "result") {
        const result = msg as {
          subtype?: string;
          is_error?: boolean;
          total_cost_usd?: number;
          num_turns?: number;
        };
        totalCostUsd = result.total_cost_usd;
        numTurns = result.num_turns;
        completed = !result.is_error;
        if (result.is_error) {
          errorMessage = `SDK result indicated error (subtype: ${result.subtype})`;
        }
      }
    }
  } catch (e) {
    errorMessage = e instanceof Error ? e.message : String(e);
    completed = false;
    if (args.sessionId) {
      sessionStore.appendEvent(args.sessionId, "error", { message: errorMessage });
    }
  }

  if (args.sessionId) {
    const state: SessionState | undefined = sessionStore.get(args.sessionId);
    if (state) {
      sessionStore.appendEvent(args.sessionId, "done", {
        completed,
        totalCostUsd,
        numTurns,
        errorMessage,
      });
    }
  }

  return {
    messages: collectedMessages,
    completed,
    totalCostUsd,
    numTurns,
    errorMessage,
  };
}
