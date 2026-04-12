import { spawn } from "node:child_process";
import { sessionStore, type SessionState } from "./session-store";
import type { RunAgentArgs, RunAgentResult } from "./runner-types";

// Subscription-backed runner. Shells out to the local `claude` CLI
// (`claude -p --output-format stream-json`) so forge runs count against the
// user's Claude Max quota instead of burning API credits.
//
// Known limitations vs. the SDK runner at `sdk-runner.ts`:
//
// 1. NO per-tool approvals. Claude Code 2.1.101 does not expose a
//    `--permission-prompt-tool` flag (verified empirically via `claude --help`
//    — only `--permission-mode`, `--allowedTools`, `--disallowedTools` exist).
//    The CLI runner hardcodes `--permission-mode bypassPermissions`, so every
//    state-changing Bash / Write / Edit call auto-allows. Users who need
//    browser approval dialogs should set `FORGE_USE_SDK=1` to force the SDK
//    runner, which preserves the `canUseTool` flow.
//
// 2. NO `--max-turns`. Claude Code 2.1.101 has no turn-count cap — only
//    `--max-budget-usd`. The `args.maxTurns` field is silently ignored on
//    this path; `maxBudgetUsd` is the effective safety cap. `--strict-mcp-config`
//    is passed to prevent parent MCP server inheritance leaking into the run.
//
// 3. Cost reporting. `total_cost_usd` is present in the `result` event but
//    the subscription user is NOT billed for it — it's an accounting number.
//    Returned as-is in `RunAgentResult.totalCostUsd` so the UI shows
//    "this would have cost $X on the API" which is still informative.
//
// 4. NO `--max-budget-usd` is passed on the CLI path. That flag enforces an
//    artificial stop based on the accounting number above, even though the
//    subscription user isn't actually being billed. Passing it literally killed
//    forge runs mid-bootstrap (error_max_budget_usd at ~$3 / 85 turns). The
//    real cap on subscription is Claude Max's 5-hour rate-limit window, which
//    the CLI handles natively — we don't need to duplicate it. `args.maxBudgetUsd`
//    is silently dropped on this path; the SDK runner still honors it because
//    the SDK path is genuinely API-metered.

/**
 * Parsed stream-json event from `claude -p --output-format stream-json`.
 * We only care about a handful of fields; everything else is preserved on
 * the raw object in case `args.onMessage` wants to forward it.
 */
interface StreamJsonEvent {
  type: string;
  subtype?: string;
  uuid?: string;
  session_id?: string;
  // result events
  is_error?: boolean;
  total_cost_usd?: number;
  num_turns?: number;
  duration_ms?: number;
  // assistant / user events
  message?: { role?: string; content?: unknown };
  // rate_limit events
  rate_limit_info?: {
    status?: string;
    rateLimitType?: string;
    resetsAt?: number;
    isUsingOverage?: boolean;
  };
  // catch-all
  [key: string]: unknown;
}

/**
 * Compact a message content block for SSE delivery. Preserves the block
 * type and meaningful fields (text, tool name + input, tool result, thinking),
 * trimming overly large values so the session store stays bounded.
 *
 * Per-block caps:
 * - text: 4000 chars (typical assistant prose fits; long files get truncated)
 * - thinking: 2000 chars (extended-thinking reasoning)
 * - tool_use input: 2000 chars of JSON (command strings, file contents)
 * - tool_result text: 2000 chars
 */
function compactContentBlock(
  block: Record<string, unknown>,
): Record<string, unknown> {
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
    // Stringify input and truncate if large. Keep as a string for the
    // client — the UI renders it as a code block, not an object tree.
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
    // Tool results can be strings, arrays of content blocks, or structured
    // shapes. Normalize to a single text string for display.
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

  // Unknown block type — preserve the type tag and stringify a short
  // preview so unusual events still show up in the log.
  return {
    type,
    raw: JSON.stringify(block).slice(0, 500),
  };
}

function emitSessionEvent(sessionId: string, evt: StreamJsonEvent) {
  // Project a CLI stream-json event into the existing session event queue.
  // Field names (`type`, `uuid`, `subtype`, `is_error`, `total_cost_usd`,
  // `num_turns`, `duration_ms`) are the same as the SDK's SDKMessage, so
  // the projection is the same shape as sdk-runner.ts's emitSessionEvent.
  const payload: Record<string, unknown> = { sdkMessageType: evt.type };

  if (evt.type === "assistant" || evt.type === "user") {
    payload.uuid = evt.uuid;
    // Extract and compact the message content blocks so the UI can render
    // the actual thinking / text / tool calls / tool results instead of
    // opaque "assistant turn" placeholders. Size-capped per block to keep
    // the in-memory session store bounded.
    const msg = evt.message as
      | { role?: string; content?: Array<Record<string, unknown>> }
      | undefined;
    if (msg?.role) payload.role = msg.role;
    if (msg?.content && Array.isArray(msg.content)) {
      payload.content = msg.content.map(compactContentBlock);
    }
  }
  if (evt.type === "result") {
    payload.subtype = evt.subtype;
    payload.isError = evt.is_error;
    payload.totalCostUsd = evt.total_cost_usd;
    payload.numTurns = evt.num_turns;
    payload.durationMs = evt.duration_ms;
  }
  if (evt.type === "rate_limit_event" && evt.rate_limit_info) {
    payload.rateLimitStatus = evt.rate_limit_info.status;
    payload.rateLimitType = evt.rate_limit_info.rateLimitType;
    payload.rateLimitResetsAt = evt.rate_limit_info.resetsAt;
  }

  // NOTE: Do NOT use "status" as a catch-all event type. "status" is reserved
  // for session-lifecycle transitions emitted by sessionStore.setStatus(),
  // whose payload shape is `{ status: <SessionStatus> }`. The UI formats
  // status events as `→ ${payload.status}`; using status for raw stream-json
  // events (system/init, rate_limit_event, user/tool_result) would render as
  // `→ undefined` in the event log. Route everything non-result under
  // step_progress instead — its formatter already reads `payload.sdkMessageType`
  // which we always set above.
  const eventType =
    evt.type === "result" ? "step_complete" : "step_progress";

  sessionStore.appendEvent(sessionId, eventType, payload);
}

/**
 * Build the argument list for `claude -p`. Prompt is NOT included here — it's
 * passed separately (as a positional arg when short, or via stdin when long).
 */
function buildClaudeArgs(args: RunAgentArgs): string[] {
  const argv: string[] = [
    "-p",
    "--output-format",
    "stream-json",
    "--verbose",
    "--permission-mode",
    "bypassPermissions",
    "--setting-sources",
    "project",
    // Prevent parent claude's MCP servers (Gmail, Google Calendar, etc.)
    // from leaking into the forge subprocess.
    "--strict-mcp-config",
  ];

  // NOTE: --max-budget-usd is deliberately NOT passed on the CLI path. See
  // the limitation comment at the top of this file. args.maxBudgetUsd is
  // silently ignored here.

  // Resume mode: `-c` tells claude to continue the most recent persisted
  // conversation in the current working directory. The prompt we pass below
  // becomes the next user message appended to that conversation. Sessions
  // are persisted to ~/.claude/projects/<cwd-hash>/<uuid>.jsonl by default.
  if (args.resume) {
    argv.push("-c");
  }

  // Prompt is the final positional argument. buildInitAppPrompt etc. produce
  // ~1–2kb strings, well below any plausible arg-length limit (ARG_MAX on
  // macOS is 256kb). No need for stdin piping.
  argv.push(args.prompt);

  return argv;
}

/**
 * Build the environment for the child `claude` process. Inherits OAuth
 * credentials from the parent's home directory (`~/.claude/`) by passing
 * through `process.env`, but unsets env vars that would confuse the child
 * or force it away from subscription-backed OAuth.
 *
 * **Critical**: we strip `ANTHROPIC_API_KEY` (and other auth-tier env vars)
 * before spawning. If present, `claude` prefers them over the OAuth token
 * stored in `~/.claude/`, meaning every forge-spawned `claude -p` run would
 * burn API credits instead of using the user's Claude Max subscription —
 * defeating the entire purpose of the CLI path. We strip them here so the
 * child always authenticates via OAuth.
 *
 * Users who explicitly want API-key mode should set `FORGE_USE_SDK=1`,
 * which routes through sdk-runner.ts instead. This CLI path is
 * subscription-only by design.
 */
function buildChildEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };

  // Don't let the forge parent's own claude-code session state leak in.
  delete env.CLAUDE_CODE_SESSION_ID;
  delete env.CLAUDE_CODE_ENTRYPOINT;
  delete env.CLAUDE_CODE_HOOK_EVENT;
  delete env.CLAUDE_AGENT_SDK_CLIENT_APP;

  // Strip every auth-tier env var the `claude` CLI recognizes so the
  // subprocess falls through to its stored OAuth subscription token.
  // See `claude --help` output around --bare and the "auth hierarchy"
  // section of the Claude Code docs — any of these forces a non-OAuth path.
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_AUTH_TOKEN;
  delete env.CLAUDE_CODE_USE_BEDROCK;
  delete env.CLAUDE_CODE_USE_VERTEX;
  delete env.CLAUDE_CODE_USE_FOUNDRY;
  delete env.AWS_BEARER_TOKEN_BEDROCK;
  delete env.GOOGLE_APPLICATION_CREDENTIALS;

  // Tag the subprocess so logs can distinguish forge runs from interactive runs.
  env.TRIPLANE_FORGE_RUN = "1";
  return env;
}

/**
 * Runs an agent against a Triplane worktree by shelling out to the local
 * `claude` CLI. Uses the user's Claude Max subscription; no API credits burned.
 *
 * Default path when `FORGE_USE_SDK` is not set. See file header for the
 * limitations compared to the SDK runner.
 */
export async function runAgentViaCli(args: RunAgentArgs): Promise<RunAgentResult> {
  const abortController = args.abortController ?? new AbortController();

  const collectedMessages: StreamJsonEvent[] = [];
  let completed = false;
  let totalCostUsd: number | undefined;
  let numTurns: number | undefined;
  let errorMessage: string | undefined;

  const claudeArgs = buildClaudeArgs(args);
  const childEnv = buildChildEnv();

  let child;
  try {
    child = spawn("claude", claudeArgs, {
      cwd: args.cwd,
      env: childEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e) {
    errorMessage = e instanceof Error ? e.message : String(e);
    if (args.sessionId) {
      sessionStore.appendEvent(args.sessionId, "error", { message: errorMessage });
    }
    return { messages: [], completed: false, errorMessage };
  }

  // Wire abort → SIGTERM the subprocess. The MCP server subprocess (if any
  // were running via --mcp-config, which we don't use) would die with it
  // via the stdio transport lifecycle; no cleanup work beyond this.
  const onAbort = () => {
    if (!child.killed) {
      child.kill("SIGTERM");
      // Give it 3 seconds to exit cleanly, then SIGKILL.
      setTimeout(() => {
        if (!child.killed) child.kill("SIGKILL");
      }, 3000);
    }
  };
  abortController.signal.addEventListener("abort", onAbort);

  // Stream stdout as newline-delimited JSON. Accumulate bytes across chunks
  // in case a JSON object spans a read boundary.
  let stdoutBuffer = "";
  child.stdout!.setEncoding("utf8");
  child.stdout!.on("data", (chunk: string) => {
    stdoutBuffer += chunk;
    let newlineIdx;
    while ((newlineIdx = stdoutBuffer.indexOf("\n")) !== -1) {
      const line = stdoutBuffer.slice(0, newlineIdx).trim();
      stdoutBuffer = stdoutBuffer.slice(newlineIdx + 1);
      if (!line) continue;

      let evt: StreamJsonEvent;
      try {
        evt = JSON.parse(line) as StreamJsonEvent;
      } catch {
        // Not JSON — probably a prose line the CLI emitted to stdout by
        // accident. Log and skip.
        if (args.sessionId) {
          sessionStore.appendEvent(args.sessionId, "status", {
            cliStdoutLine: line.slice(0, 500),
          });
        }
        continue;
      }

      collectedMessages.push(evt);
      args.onMessage?.(evt);
      if (args.sessionId) {
        emitSessionEvent(args.sessionId, evt);
      }

      if (evt.type === "result") {
        totalCostUsd = evt.total_cost_usd;
        numTurns = evt.num_turns;
        completed = !evt.is_error;
        if (evt.is_error) {
          const subtype = evt.subtype ?? "unknown";
          // Hand-map the common subtypes so the session log is helpful.
          // "error_max_budget_usd" used to fire every long run when we
          // passed --max-budget-usd 3 — the flag is no longer sent, but the
          // mapping stays in case the CLI enforces budget via some other
          // mechanism (inherited subscription cap, etc.).
          const hint =
            subtype === "error_max_budget_usd"
              ? "budget cap hit — on CLI/subscription path this indicates a --max-budget-usd flag was passed; check cli-runner.ts"
              : subtype === "error_max_turns"
                ? "turn-count cap hit"
                : subtype === "error_during_execution"
                  ? "claude errored mid-run — check stderr"
                  : `subtype: ${subtype}`;
          errorMessage = `CLI result indicated error (${hint})`;
        }
      }
    }
  });

  // Collect stderr for error reporting — the CLI writes diagnostics and
  // auth failures here. Keep it short so session events don't explode.
  let stderrBuffer = "";
  child.stderr!.setEncoding("utf8");
  child.stderr!.on("data", (chunk: string) => {
    stderrBuffer += chunk;
    // Cap the buffer to the last 4kb so long runs don't accumulate.
    if (stderrBuffer.length > 4096) {
      stderrBuffer = stderrBuffer.slice(-4096);
    }
  });

  // Wait for the process to exit.
  const exitCode: number = await new Promise((resolve) => {
    child.on("close", (code) => resolve(code ?? -1));
    child.on("error", (e) => {
      errorMessage = e instanceof Error ? e.message : String(e);
      resolve(-1);
    });
  });

  abortController.signal.removeEventListener("abort", onAbort);

  // Flush any trailing partial-line bytes — unusual, but handle gracefully.
  if (stdoutBuffer.trim()) {
    try {
      const evt = JSON.parse(stdoutBuffer.trim()) as StreamJsonEvent;
      collectedMessages.push(evt);
      if (args.sessionId) emitSessionEvent(args.sessionId, evt);
    } catch {
      // ignore
    }
  }

  // If we never saw a result event AND the exit code was non-zero, treat
  // the run as failed and surface the stderr tail as the error message.
  if (!completed && exitCode !== 0) {
    if (!errorMessage) {
      errorMessage =
        stderrBuffer.trim() ||
        `claude CLI exited with code ${exitCode} and no result event`;
    }
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
