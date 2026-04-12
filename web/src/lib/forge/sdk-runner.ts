import { query, type Options, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { sessionStore, type SessionState } from "./session-store";
import type { RunAgentArgs, RunAgentResult } from "./runner-types";

// This file is the old `agent-runner.ts` body, split out so `agent-runner.ts`
// can be a thin router. Wire-for-wire identical behavior to pre-0.1.3 — zero
// semantic changes. Used when `process.env.FORGE_USE_SDK === "1"`.

const DEFAULT_MAX_TURNS = 60;
const DEFAULT_MAX_BUDGET_USD = 5;
const DEFAULT_SAFE_READ_TOOLS = ["Read", "Glob", "Grep"];

function compactContentBlock(
  block: Record<string, unknown>,
): Record<string, unknown> {
  // Same shape as cli-runner.ts's compactContentBlock. Duplicated rather
  // than shared to keep the two runners independent — if SDK message shape
  // diverges from CLI stream-json shape later, each side can adapt without
  // coupling to the other.
  const type = typeof block.type === "string" ? block.type : "unknown";

  if (type === "text") {
    const text = String(block.text ?? "");
    return {
      type: "text",
      text: text.length > 4000 ? text.slice(0, 4000) + "…" : text,
    };
  }
  if (type === "thinking") {
    const thinking = String(block.thinking ?? "");
    return {
      type: "thinking",
      thinking:
        thinking.length > 2000 ? thinking.slice(0, 2000) + "…" : thinking,
    };
  }
  if (type === "tool_use") {
    const name = typeof block.name === "string" ? block.name : "?";
    const id = typeof block.id === "string" ? block.id : undefined;
    let inputStr: string;
    try {
      inputStr = JSON.stringify(block.input ?? {}, null, 2);
    } catch {
      inputStr = String(block.input ?? "");
    }
    if (inputStr.length > 2000) {
      inputStr = inputStr.slice(0, 2000) + "\n…";
    }
    return { type: "tool_use", name, id, input: inputStr };
  }
  if (type === "tool_result") {
    const toolUseId =
      typeof block.tool_use_id === "string" ? block.tool_use_id : undefined;
    const isError = block.is_error === true;
    let text = "";
    const content = block.content;
    if (typeof content === "string") {
      text = content;
    } else if (Array.isArray(content)) {
      text = content
        .map((c) => {
          if (typeof c === "string") return c;
          if (c && typeof c === "object" && "text" in c) {
            return String((c as { text: unknown }).text ?? "");
          }
          return "";
        })
        .filter(Boolean)
        .join("\n");
    }
    return {
      type: "tool_result",
      toolUseId,
      isError,
      text: text.length > 2000 ? text.slice(0, 2000) + "…" : text,
    };
  }
  return { type, raw: JSON.stringify(block).slice(0, 500) };
}

function emitSessionEvent(sessionId: string, msg: SDKMessage) {
  // Project SDKMessage envelopes into the session event queue. For
  // assistant/user events, we now preserve the content blocks (text, tool
  // calls, tool results, thinking) so the UI can render the actual chat
  // content instead of opaque "assistant turn" placeholders. Size-capped
  // per block via compactContentBlock.
  const payload: Record<string, unknown> = { sdkMessageType: msg.type };

  if (msg.type === "assistant" || msg.type === "user") {
    payload.uuid = (msg as { uuid?: string }).uuid;
    // Cast via `unknown` to dodge SDKMessage's stricter content-block
    // union type — we treat blocks generically as Record<string, unknown>
    // and let compactContentBlock normalize field extraction.
    const envelope = msg as unknown as {
      message?: { role?: string; content?: Array<Record<string, unknown>> };
    };
    if (envelope.message?.role) payload.role = envelope.message.role;
    if (envelope.message?.content && Array.isArray(envelope.message.content)) {
      payload.content = envelope.message.content.map(compactContentBlock);
    }
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

  // NOTE: Do NOT use "status" as a catch-all. "status" is reserved for
  // session-lifecycle transitions from sessionStore.setStatus() whose
  // payload is `{ status: <SessionStatus> }`. Non-assistant/non-result
  // SDK messages (user/tool_result envelopes) go under step_progress.
  const eventType =
    msg.type === "result" ? "step_complete" : "step_progress";

  sessionStore.appendEvent(sessionId, eventType, payload);
}

/**
 * Runs an agent against a Triplane worktree using the Claude Agent SDK.
 *
 * Uses `ANTHROPIC_API_KEY` from the environment. Costs API credits. Supports
 * per-tool browser approvals via the `canUseTool` hook wired to `args.onApproval`.
 * This is the fallback runner — set `FORGE_USE_SDK=1` to force this path.
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
export async function runAgentViaSdk(args: RunAgentArgs): Promise<RunAgentResult> {
  if (args.resume) {
    // Resume is CLI-only in v1. The Agent SDK has a `resume` option that
    // takes a session UUID, but plumbing it through the forge session store
    // (which currently doesn't track claude session UUIDs separately from
    // forge session IDs) is v2 work. For now, fail loud so the UI doesn't
    // silently restart the session from scratch.
    throw new Error(
      "Resume is not supported on the SDK path. Unset FORGE_USE_SDK to use the CLI runner (which supports resume via `claude -c`).",
    );
  }

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
    allowedTools: DEFAULT_SAFE_READ_TOOLS,
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