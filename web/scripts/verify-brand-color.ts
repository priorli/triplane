// Standalone smoke test for sub-phase 9.5 — the brand-color bash pipeline.
//
// Exercises `rewrite-docs.sh --brand-color L,C,h` end to end WITHOUT calling
// Claude. Creates a fresh worktree of main, runs the script directly, verifies
// that design/tokens.json + web/src/app/generated/tokens.css +
// mobile/.../common/theme/DesignTokens.kt all rotate to the new brand palette,
// then cleans up.
//
// Run with:
//   cd web && bun scripts/verify-brand-color.ts
//
// Deterministic, ~5 seconds, $0 API cost. Catches regressions in the
// `rewrite-docs.sh --brand-color` pipeline (shipped in sub-phase 9.0) before
// they reach the Claude integration.

import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createWorktree, removeWorktree } from "../src/lib/forge/worktree";
import { sessionStore } from "../src/lib/forge/session-store";

const SMOKE_SESSION_ID = "smoke-brand-9-5-" + Date.now();

// Target brand color — a saturated blue
const BRAND_L = 0.55;
const BRAND_C = 0.2;
const BRAND_H = 250;
const BRAND_TRIPLE = `${BRAND_L},${BRAND_C},${BRAND_H}`;

interface RunResult {
  stdout: string;
  stderr: string;
  code: number;
}

async function run(
  cmd: string,
  args: string[],
  cwd: string,
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    child.on("error", reject);
    child.on("close", (code) => resolve({ stdout, stderr, code: code ?? 0 }));
  });
}

interface Check {
  name: string;
  passed: boolean;
  detail: string;
}

async function main() {
  console.log("=== brand-color pipeline smoke test ===\n");
  console.log(`Session ID:  ${SMOKE_SESSION_ID}`);
  console.log(`Brand:       L=${BRAND_L}, C=${BRAND_C}, h=${BRAND_H}\n`);

  // 1. Create worktree
  console.log("1. Creating worktree of main...");
  const handle = await createWorktree(SMOKE_SESSION_ID);
  console.log(`   ${handle.path}\n`);

  // Register session so worktree cleanup also cleans the store
  sessionStore.create({
    userId: "smoke-test",
    worktreePath: handle.path,
    inputs: {
      productName: "Test App",
      tagline: "smoke test",
      description: "smoke test",
      targetUser: "smoke test",
      features: [{ name: "Probe", description: "probe" }],
      slug: "test-app",
      namespace: "com.smoke.testapp",
      displayName: "Test App",
      brandColor: { L: BRAND_L, C: BRAND_C, h: BRAND_H },
    },
  });

  const checks: Check[] = [];
  let failed = false;

  try {
    // 2. Run rewrite-docs.sh --brand-color inside the worktree
    console.log("2. Running rewrite-docs.sh --brand-color...");
    const result = await run(
      "./.claude/skills/init-app/rewrite-docs.sh",
      [
        "--display-name",
        "Test App",
        "--slug",
        "test-app",
        "--brand-color",
        BRAND_TRIPLE,
        "--yes",
      ],
      handle.path,
    );
    console.log(`   exit code: ${result.code}`);
    if (result.code !== 0) {
      console.log("   stdout:", result.stdout.split("\n").slice(-5).join("\n"));
      console.log("   stderr:", result.stderr.split("\n").slice(-5).join("\n"));
      throw new Error(`rewrite-docs.sh exited with code ${result.code}`);
    }

    // Tail of stdout is useful context
    const tailLines = result.stdout.split("\n").filter((l) => l.includes("Step 5") || l.includes("brand") || l.includes("regenerated"));
    for (const line of tailLines.slice(-5)) {
      console.log("   >", line);
    }
    console.log("");

    // 3. Verify design/tokens.json has the new brand values
    console.log("3. Verifying design/tokens.json...");
    const tokensJsonPath = join(handle.path, "design/tokens.json");
    const tokensJsonText = await readFile(tokensJsonPath, "utf-8");
    const tokensJson = JSON.parse(tokensJsonText);
    const brand = tokensJson.brand;
    const brandMatch =
      brand &&
      brand.L === BRAND_L &&
      brand.C === BRAND_C &&
      brand.h === BRAND_H;
    checks.push({
      name: "tokens.json brand updated",
      passed: brandMatch,
      detail: brandMatch
        ? `brand = {L: ${brand.L}, C: ${brand.C}, h: ${brand.h}}`
        : `expected {L: ${BRAND_L}, C: ${BRAND_C}, h: ${BRAND_H}}, got ${JSON.stringify(brand)}`,
    });

    // 4. Verify web/src/app/generated/tokens.css has the brand in light mode
    console.log("4. Verifying web/src/app/generated/tokens.css...");
    const tokensCssPath = join(
      handle.path,
      "web/src/app/generated/tokens.css",
    );
    const tokensCss = await readFile(tokensCssPath, "utf-8");

    // Looking for something like `--brand: oklch(0.55 0.2 250);` in the
    // `:root` (light) block. Numbers may have variable decimal precision.
    const lightBrandRe = /--brand:\s*oklch\(\s*0\.55\s+0\.2[0]?\s+250(?:\.\d+)?\s*\)/;
    const lightBrandMatch = lightBrandRe.test(tokensCss);
    checks.push({
      name: "tokens.css light --brand",
      passed: lightBrandMatch,
      detail: lightBrandMatch
        ? "found --brand: oklch(0.55 0.2 250) pattern"
        : `pattern ${lightBrandRe} not found — tokens.css may still have the gray default`,
    });

    // Dark mode brand — the generator derives it as
    // `clamp(1 - L + 0.7, 0, 0.97) C h` which for L=0.55 → clamp(1.15, 0, 0.97) = 0.97
    const darkBrandRe = /--brand:\s*oklch\(\s*0\.97\d*\s+0\.2[0]?\s+250(?:\.\d+)?\s*\)/;
    const darkBrandMatch = darkBrandRe.test(tokensCss);
    checks.push({
      name: "tokens.css dark --brand derived",
      passed: darkBrandMatch,
      detail: darkBrandMatch
        ? "found --brand: oklch(0.97… 0.2 250) pattern in .dark block"
        : `pattern ${darkBrandRe} not found — dark-mode derivation may be broken`,
    });

    // 5. Verify mobile DesignTokens.kt has the brand in LightColorScheme
    console.log("5. Verifying mobile/.../DesignTokens.kt...");
    const designTokensPath = join(
      handle.path,
      "mobile/composeApp/src/commonMain/kotlin/com/priorli/triplane/common/theme/DesignTokens.kt",
    );
    const designTokens = await readFile(designTokensPath, "utf-8");

    // Looking for `primary = colorFromOklch(0.55, 0.2, 250)` or similar
    // in the LightColorScheme block.
    const kotlinBrandRe =
      /colorFromOklch\(\s*0\.55\s*,\s*0\.2[0]?\s*,\s*250(?:\.\d+)?\s*\)/;
    const kotlinBrandMatch = kotlinBrandRe.test(designTokens);
    checks.push({
      name: "DesignTokens.kt colorFromOklch light brand",
      passed: kotlinBrandMatch,
      detail: kotlinBrandMatch
        ? "found colorFromOklch(0.55, 0.2, 250) pattern"
        : `pattern ${kotlinBrandRe} not found — DesignTokens.kt may still be gray`,
    });

    // Dark-mode brand in DarkColorScheme
    const kotlinDarkBrandRe =
      /colorFromOklch\(\s*0\.97\d*\s*,\s*0\.2[0]?\s*,\s*250(?:\.\d+)?\s*\)/;
    const kotlinDarkBrandMatch = kotlinDarkBrandRe.test(designTokens);
    checks.push({
      name: "DesignTokens.kt colorFromOklch dark brand derived",
      passed: kotlinDarkBrandMatch,
      detail: kotlinDarkBrandMatch
        ? "found colorFromOklch(0.97…, 0.2, 250) pattern"
        : `pattern ${kotlinDarkBrandRe} not found`,
    });
  } catch (e) {
    failed = true;
    console.error("\n  UNEXPECTED ERROR:", e);
  }

  // 6. Report
  console.log("\n6. Verification summary:");
  for (const check of checks) {
    console.log(`   ${check.passed ? "✓" : "✗"} ${check.name}`);
    if (!check.passed) {
      console.log(`       ${check.detail}`);
      failed = true;
    } else {
      console.log(`       ${check.detail}`);
    }
  }

  // 7. Cleanup
  console.log("\n7. Cleanup:");
  if (failed) {
    console.log(`   KEEPING worktree for investigation: ${handle.path}`);
    console.log(`   Remove manually: git worktree remove --force ${handle.path} && git branch -D forge-session-${SMOKE_SESSION_ID}`);
  } else {
    await removeWorktree(SMOKE_SESSION_ID);
    console.log("   ✓ worktree removed");
  }
  sessionStore.remove(SMOKE_SESSION_ID);

  console.log(`\n=== ${failed ? "FAILED" : "PASSED"} ===`);
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error("\nUNHANDLED:", e);
  process.exit(1);
});
