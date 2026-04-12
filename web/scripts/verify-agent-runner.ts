// Hello-world smoke test for sub-phase 9.2 agent-runner.
//
// Creates a scratch worktree of main, asks Claude a trivial bash task via the
// Claude Agent SDK, and verifies the message stream completes. Uses the
// `claude_code` tool preset (Bash, Read, Edit, Glob, Grep, etc) and
// auto-approves every tool call via the onApproval hook.
//
// Usage:
//   cd web && bun scripts/verify-agent-runner.ts
//
// Prereqs: authenticated Claude CLI (ran `claude login`) or ANTHROPIC_API_KEY
// env var set. If neither is present the SDK call will fail and the test will
// report the failure but NOT delete the worktree (so you can poke at it).

import { createWorktree, removeWorktree } from "../src/lib/forge/worktree";
// Smoke test targets the SDK runner directly so the SDKMessage typing in
// this file stays concrete. `agent-runner.ts` is a router whose OnMessage
// type is `unknown` to accommodate the CLI path — the test is specifically
// exercising the SDK path, not the router.
import { runAgentViaSdk as runAgent } from "../src/lib/forge/sdk-runner";
import { sessionStore } from "../src/lib/forge/session-store";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

const SMOKE_SESSION_ID = "smoke-test-9-2-" + Date.now();

async function main() {
  console.log("=== agent-runner hello-world smoke test ===\n");
  console.log("Session ID:", SMOKE_SESSION_ID);

  const authHint =
    process.env.ANTHROPIC_API_KEY
      ? "ANTHROPIC_API_KEY set"
      : "no ANTHROPIC_API_KEY — will try CLI OAuth (claude login)";
  console.log("Auth:", authHint, "\n");

  // 1. Create worktree
  console.log("1. Creating worktree of main...");
  const handle = await createWorktree(SMOKE_SESSION_ID);
  console.log(`   ${handle.path}\n`);

  // 2. Register a session for event collection
  const state = sessionStore.create({
    userId: "smoke-test",
    worktreePath: handle.path,
    inputs: {
      productName: "Smoke Test",
      tagline: "ignored",
      description: "ignored",
      targetUser: "ignored",
      features: [{ name: "Probe", description: "probe" }],
      slug: "smoke-test",
      namespace: "com.smoke.test",
      displayName: "Smoke Test",
    },
    phaseFlags: {
      planReview: false,
      seedDemo: false,
      implementFeatures: false,
      verifyBuilds: false,
      platformTarget: "all",
      qaTest: false,
    },
    baseUrl: "http://localhost:3000",
  });

  const toolCalls: Array<{ name: string; input: unknown }> = [];
  const assistantTurns: number[] = [];

  let messageCount = 0;
  // OnMessage is typed as `(msg: unknown) => void` at the router level to
  // support the CLI runner (which produces raw stream-json). Cast to
  // SDKMessage inside the body since we're targeting the SDK runner.
  const onMessage = (rawMsg: unknown) => {
    const msg = rawMsg as SDKMessage;
    messageCount++;
    if (msg.type === "assistant") {
      const asst = msg as {
        message?: { content?: Array<{ type: string; name?: string; input?: unknown; text?: string }> };
      };
      const blocks = asst.message?.content ?? [];
      for (const b of blocks) {
        if (b.type === "tool_use") {
          toolCalls.push({ name: b.name ?? "?", input: b.input });
          console.log(`   [tool_use] ${b.name}`);
        }
        if (b.type === "text" && typeof b.text === "string") {
          const preview = b.text.substring(0, 200).replace(/\n/g, " ");
          console.log(`   [assistant.text] ${preview}${b.text.length > 200 ? "…" : ""}`);
          assistantTurns.push(b.text.length);
        }
      }
    }
    if (msg.type === "result") {
      const result = msg as { subtype?: string; total_cost_usd?: number; num_turns?: number };
      console.log(
        `   [result] subtype=${result.subtype} turns=${result.num_turns} cost_usd=${result.total_cost_usd}`,
      );
    }
  };

  // 3. Run the agent with a trivial prompt
  console.log("2. Running agent with a trivial bash task...");
  console.log("   (this will make real Claude API calls — cost should be <$0.05)\n");

  const prompt =
    "Using the Bash tool, run `ls -la` in the current working directory. " +
    "Then tell me the name of any `.md` file you find at the top level, " +
    "one line each. Be concise — no preamble.";

  const autoAllowCount = { count: 0 };
  const result = await runAgent({
    cwd: handle.path,
    prompt,
    sessionId: state.sessionId,
    maxTurns: 10,
    maxBudgetUsd: 0.25,
    onMessage,
    onApproval: async (req) => {
      autoAllowCount.count++;
      console.log(`   [approval auto-allow] ${req.toolName} (${req.title ?? req.displayName ?? "no-title"})`);
      return { behavior: "allow" };
    },
  });

  console.log("\n3. Final result:");
  console.log(`   completed:     ${result.completed}`);
  console.log(`   messages:      ${messageCount}`);
  console.log(`   tool calls:    ${toolCalls.length}`);
  console.log(`   approvals:     ${autoAllowCount.count}`);
  console.log(`   turns:         ${result.numTurns}`);
  console.log(`   cost (USD):    ${result.totalCostUsd}`);
  if (result.errorMessage) {
    console.log(`   error:         ${result.errorMessage}`);
  }

  // 4. Verify expected shape
  console.log("\n4. Verifying the run:");
  const checks: Array<[string, boolean, string]> = [
    ["stream completed", result.completed, "agent-runner reported successful completion"],
    ["messages received", messageCount > 0, "at least one SDKMessage was streamed"],
    ["bash tool called", toolCalls.some((t) => t.name === "Bash"), "Bash tool was invoked"],
    ["assistant spoke", assistantTurns.length > 0, "at least one assistant text block received"],
  ];

  let failed = false;
  for (const [name, passed, detail] of checks) {
    console.log(`   ${passed ? "✓" : "✗"} ${name} — ${detail}`);
    if (!passed) failed = true;
  }

  // 5. Cleanup
  console.log("\n5. Cleanup:");
  if (failed || !result.completed) {
    console.log(`   KEEPING worktree for investigation: ${handle.path}`);
    console.log(`   Remove manually: git worktree remove --force ${handle.path}`);
  } else {
    await removeWorktree(SMOKE_SESSION_ID);
    console.log("   ✓ worktree removed");
  }
  sessionStore.remove(state.sessionId);

  console.log(
    `\n=== ${failed || !result.completed ? "FAILED" : "PASSED"} ===`,
  );
  if (failed || !result.completed) process.exit(1);
}

main().catch((e) => {
  console.error("\nUNHANDLED:", e);
  process.exit(1);
});
