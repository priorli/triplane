---
name: qa
description: Use this skill to execute browser-based QA tests against a running web app. Reads test scenarios from PLAN_REVIEW.md or generates them from spec files, writes Playwright e2e tests, runs them against a live dev server, and reports pass/fail. Web-only for v1. Triggers on phrases like "run QA", "test the app", "browser test this", "e2e test", "smoke test the web", "verify the features work", "run the QA tests".
invocable: true
---

# /qa — Browser-driven QA testing

Execute the test scenarios written by `/plan-qa-review` (or synthesized
from spec files) as real Playwright browser tests against a running dev
server. Web surface only for v1.

**Distinct from `/plan-qa-review`:** that skill WRITES test scenarios
before code exists (prose in PLAN_REVIEW.md). THIS skill EXECUTES them
after code exists (Playwright in a browser).

## Step 1 — Locate test scenarios

Read `PLAN_REVIEW.md` at the repo root. Look for `## QA review` and
its per-feature subsections. Each subsection has:

- Feature name (the `###` heading)
- Golden path scenario
- Edge case 1
- Edge case 2
- Acceptance criterion

If `PLAN_REVIEW.md` doesn't exist or has no `## QA review` section,
fall back to `specs/features/*.md` (excluding `_template.md`):

- Read each spec's Description and API sections
- Synthesize: golden path = the primary user workflow, edge case 1 =
  empty/missing data, edge case 2 = boundary condition from the API
  contract
- Use the spec's acceptance criteria if present

If neither source yields scenarios, halt with:
> No test scenarios found. Run `/plan-qa-review` first to generate them,
> or create `specs/features/*.md` spec files.

## Step 2 — Install Playwright

Run:
```bash
cd web && bun add -D @playwright/test && npx playwright install chromium
```

This is idempotent — safe to run repeatedly. Check the exit code. If
installation fails (e.g., system dependencies missing on Linux), halt
with the error and suggest `npx playwright install --with-deps chromium`.

## Step 3 — Write playwright.config.ts

Write `web/playwright.config.ts`:

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
  outputDir: './e2e/test-results',
});
```

## Step 4 — Generate test files

For each feature's scenarios, write `web/e2e/<feature-slug>.spec.ts`.

**Test writing rules:**

- Use Playwright's recommended locators: `getByRole`, `getByText`,
  `getByLabel`, `getByPlaceholder`. Avoid CSS selectors.
- Each test starts fresh from `page.goto()` — no shared state.
- For auth-gated pages: check if the page redirected to `/sign-in`.
  If so, call `test.skip('requires Clerk auth setup')`.
- For data-dependent tests: check if expected content exists on the page.
  If not, call `test.skip('requires seeded data — run /seed-demo')`.
- Never use `page.waitForTimeout()` — use `expect(locator).toBeVisible()`
  or `page.waitForURL()` instead.
- Set `test.setTimeout(30_000)` if the default isn't enough.

**Structure:**

```typescript
import { test, expect } from '@playwright/test';

test.describe('<Feature Name>', () => {
  test('golden path: <description>', async ({ page }) => {
    await page.goto('/<route>');
    // interact + assert
    await expect(page.getByRole('heading', { name: '...' })).toBeVisible();
  });

  test('edge case 1: <description>', async ({ page }) => {
    // ...
  });

  test('edge case 2: <description>', async ({ page }) => {
    // ...
  });
});
```

## Step 5 — Start or discover the dev server

Check if a dev server is already running:

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
```

If it responds (any HTTP code), use that URL.

If not running, start one:

```bash
cd web && bun run dev &
```

Watch stdout for `http://localhost:XXXX` and capture the URL. Wait up
to 30 seconds. If it doesn't start, halt with the error.

## Step 6 — Run tests

```bash
cd web && BASE_URL=<captured-url> npx playwright test --reporter=list
```

Capture the full stdout and stderr.

## Step 7 — Report results

Parse the Playwright output and produce a structured report:

```
## QA test results

### Summary
- Total: N scenarios across M features
- Passed: X
- Failed: Y
- Skipped: Z (auth-gated or data-dependent)

### Per-feature results

#### <Feature Name>
- [PASS] golden path: <description> (1.2s)
- [FAIL] edge case 1: <description> (2.3s)
  Error: <assertion message>
  Screenshot: web/e2e/test-results/<file>.png
- [SKIP] edge case 2: requires seeded data

### Next steps
- Fix N failing tests by addressing <specific issues>
- Run /seed-demo to unblock Z skipped tests
- Re-run /qa to verify
```

## Step 8 — Cleanup

If you started the dev server in Step 5, kill it:

```bash
kill %1 2>/dev/null || true
```

Leave `web/e2e/` and `web/playwright.config.ts` in place for debugging.
They are gitignored and disposable.

## Step 9 — Fix loop (opt-in)

If tests failed, ask the user:
> N tests failed. Should I fix the app code and re-run?

If yes:
1. Read each failure's error message and screenshot
2. Fix the **source code** — NEVER modify test files (tests are the spec)
3. Re-run only the failed tests: `npx playwright test --grep "<pattern>"`
4. Report the new results
5. Maximum 3 fix-and-rerun iterations. After 3, stop and report remaining
   failures.

## Critical rules

- **Tests are the spec.** Never modify test files to make them pass.
  Fix the application code instead.
- **Web-only for v1.** Do not attempt mobile QA (Maestro, Appium, etc.).
- **Test files are disposable.** Generated fresh each /qa run. Never
  commit them.
- **Do not install Playwright globally.** Always `npx playwright`.
- **Prefer resilient locators.** `getByRole` > `getByText` > `getByTestId`
  > CSS selectors (never).
- **Auth is a known v1 limitation.** Skip auth-gated tests gracefully.
  Do not try to automate Clerk sign-in.
- **Cost awareness.** Each /qa run costs ~$1-2. Don't run in a loop
  unless the user explicitly asks for the fix loop.

## Files this skill creates (all disposable, gitignored)

- `web/playwright.config.ts`
- `web/e2e/*.spec.ts` (one per feature)
- `web/e2e/test-results/` (screenshots, traces)
