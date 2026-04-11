// Thin router between two forge runners:
//
// - `cli-runner.ts` (DEFAULT) — shells out to the local `claude` CLI.
//   Uses the user's Claude Max subscription (no API credits). No per-tool
//   approvals (Claude Code 2.1.101 lacks a `--permission-prompt-tool` flag),
//   so runs with `--permission-mode bypassPermissions`.
//
// - `sdk-runner.ts` (FALLBACK, opt-in via `FORGE_USE_SDK=1`) — uses the
//   `@anthropic-ai/claude-agent-sdk` with `ANTHROPIC_API_KEY`. Preserves
//   per-tool browser approvals via the `canUseTool` hook.
//
// Public API is unchanged from pre-0.1.3: `runAgent(args)`, and the types
// `RunAgentArgs`, `RunAgentResult`, `ApprovalRequest`, `ApprovalDecision`,
// `OnApproval`, `OnMessage`. Consumers (worker.ts) don't care which runner
// handled the call.

import type { RunAgentArgs, RunAgentResult } from "./runner-types";
import { runAgentViaCli } from "./cli-runner";
import { runAgentViaSdk } from "./sdk-runner";

export type {
  RunAgentArgs,
  RunAgentResult,
  ApprovalRequest,
  ApprovalDecision,
  OnApproval,
  OnMessage,
} from "./runner-types";

/**
 * Run a forge agent against a worktree. Picks CLI or SDK path based on
 * the `FORGE_USE_SDK` env var (default: CLI / subscription-backed).
 */
export async function runAgent(args: RunAgentArgs): Promise<RunAgentResult> {
  const useSdk = process.env.FORGE_USE_SDK === "1";
  return useSdk ? runAgentViaSdk(args) : runAgentViaCli(args);
}
