# Triplane — Monorepo

> Priorli's full-stack monorepo template. **Read this at the start of every Claude Code session.** Keep it short.

## Repo structure

- `web/` — Next.js web app (API routes + pages + i18n + Prisma + Clerk)
- `mobile/` — Compose Multiplatform mobile app (Android + iOS, KMM shared module + Compose UI)
- `specs/` — Shared feature specifications. The contract that keeps web and mobile in sync.
- `.claude/skills/` — Project-scoped Claude Code skills
- `PLAN.md` — Stack table, architecture principles, feature matrix, phase tracker, decisions log
- `LESSONS.md` — Why every decision is what it is. Read this once before starting work.
- `mobile_plan.md` — Mobile-specific phase tracker

## When implementing a feature

1. Read the spec file in `specs/features/<name>.md` first.
2. Check the feature matrix in `PLAN.md`.
3. Implement on the target platform following the spec.
4. **Verify the spec checkboxes by reading the actual code, not by trusting the boxes** — drift is real.
5. Update both the spec checkboxes AND the `PLAN.md` matrix row when done.
6. If the feature requires API changes, update OpenAPI docs in `web/src/lib/openapi/` (or use the `/api-change` skill).
7. Run the build verification commands (see below).
8. Add an entry to `PLAN.md`'s recent decisions log if the *why* is non-obvious.

**Skill:** the `/feature` skill (`.claude/skills/feature/SKILL.md`) automates this workflow. Auto-triggers on phrases like "add a feature", "is X done on mobile", "finish X feature". Three modes: **add new** (drafts spec from `_template.md`), **check status** (verifies spec vs code), **continue work** (plans + implements + updates matrix). **Prefer it over reciting the workflow by hand.**

## Architecture principles (load-bearing rules)

These are the non-negotiable rules. Each came from a real pain point in Travolp. See `LESSONS.md` for the rationale.

1. All API endpoints live under `/api/v1/*`.
2. Every API route uses Clerk's `auth()` helper (handles cookies + bearer tokens).
3. Web app calls its own API via `fetch('/api/v1/...')` — no server actions, no direct Prisma.
4. Response shape is always `{ data: T } | { error: { code, message } }`.
5. Soft delete everything user-deletable (`deletedAt` timestamp).
6. Mobile uses Clean Architecture in the KMM shared module (Domain → Data → Presentation).
7. Mobile UI is feature-based (`feature/items/`, `feature/auth/`), not layer-based.
8. Mobile auth uses native Clerk SDKs (Android + iOS). **Never WebView** — Google blocks OAuth in embedded WebViews.
9. `Mobile (Android)` and `Mobile (iOS)` are separate columns in the feature matrix from day 1.
10. Features target web + Android + iOS. The feature matrix in `PLAN.md` is the source of truth — a row can land incrementally (✅/✅/🔲/🔲), but drift between the matrix and the actual code is the real bug. Run `/audit` to check. **Exception:** developer-only tooling whose core mechanism cannot run on mobile (currently only the forge — `git worktree` + Claude Agent SDK + local filesystem + SSE worker). Mark those `N/A` in the mobile columns and justify in the decisions log. The test is "can't exist on mobile", not "harder on mobile".
11. Phase numbers are stable and never reused.
12. commonMain by default, expect/actual at platform seams only.
13. OpenAPI updated on every API change.

The full numbered list (with rationale) is in `PLAN.md` § Architecture principles.

## Web app (`web/`)

- Run dev: `cd web && bun run dev`
- Run build (verification): `cd web && bun run build`
- Deploy: `fly deploy` from repo root (fly.toml is at root, Dockerfile refs `web/` paths)
- Docker build context is the repo root; `.dockerignore` excludes `mobile/` and `specs/`
- See `web/AGENTS.md` for additional Next.js-specific rules (when present)
- **Forge runner auth (forge branch only):** forge runs shell out to the local `claude` CLI by default, using your Claude Code subscription (no API credits burned). Set `FORGE_USE_SDK=1` to fall back to `@anthropic-ai/claude-agent-sdk` with `ANTHROPIC_API_KEY` — that path preserves per-tool browser approvals via `canUseTool`; the CLI path runs with `--permission-mode bypassPermissions` because Claude Code 2.1.101 has no `--permission-prompt-tool` flag.

## Mobile app (`mobile/`)

- Compose Multiplatform 1.10+ with Clean Architecture
- Shared module (KMM): domain models, use cases, repositories, API client (Ktor)
- Compose UI in `composeApp/` — shared across Android and iOS
- Build (Android verification): `cd mobile && ./gradlew :composeApp:assembleDebug`
- Build (iOS verification — catches Kotlin/Native incompat): `cd mobile && ./gradlew :composeApp:compileKotlinIosSimulatorArm64`
- **Run BOTH builds before declaring a feature done.** Android-green doesn't mean iOS-green.
- Mobile-specific architecture details: `mobile_plan.md`

## Build verification (run before declaring done)

```bash
cd web && bun run build                                                       # web
cd mobile && ./gradlew :composeApp:assembleDebug                              # Android
cd mobile && ./gradlew :composeApp:linkDebugFrameworkIosSimulatorArm64        # iOS framework link (includes ObjC export)

# iOS launch verification — the bar that catches PlistSanityCheck, missing
# startKoin, runtime IrLinkageError, and other launch-time crashes that
# `xcodebuild build` greens through silently. Build green ≠ launch green.
cd mobile && xcodebuild -project iosApp/iosApp.xcodeproj -scheme iosApp \
  -configuration Debug -destination 'platform=iOS Simulator,name=iPhone 17' \
  CODE_SIGNING_ALLOWED=NO build
SIM_ID=$(xcrun simctl list devices | grep "iPhone 17 (" | head -1 | grep -oE '\([0-9A-F-]{36}\)' | tr -d '()')
xcrun simctl boot "$SIM_ID" 2>/dev/null || true
APP="$(xcodebuild -showBuildSettings -project iosApp/iosApp.xcodeproj -scheme iosApp -configuration Debug -destination "platform=iOS Simulator,id=$SIM_ID" | grep -m1 BUILT_PRODUCTS_DIR | awk '{print $3}')/Triplane.app"
xcrun simctl install "$SIM_ID" "$APP"
xcrun simctl launch "$SIM_ID" com.priorli.triplane
sleep 3 && pgrep -f Triplane >/dev/null && echo "alive" || echo "CRASHED — see ~/Library/Logs/DiagnosticReports/Triplane-*.ips"
```

**Why three legs, not one:**
- `assembleDebug` catches Android compile + lint regressions.
- `linkDebugFrameworkIosSimulatorArm64` catches K/N → ObjC export regressions that `compileKotlinIosSimulatorArm64` (compile-only) silently skips. **Do not** use `compileKotlinIosSimulatorArm64` as the iOS bar.
- `xcodebuild build` + `simctl install` + `simctl launch` + 3-second liveness catches what builds *don't*: Compose `PlistSanityCheck`, missing `startKoin {}`, runtime `IrLinkageError` from dep version skew, and any other initialization crash that fires only when the simulator actually executes the app's first instruction. Phase 7 shipped an iOS app that "built green" but crashed within 1s of every launch — see Travolp 2026-05-07 lessons.

The `/release-check` skill runs the build legs in parallel and then invokes `/audit` for drift detection — prefer it. (TODO: wire the install+launch leg into `/release-check`; tracked in PLAN.md decisions log 2026-05-07.)

## Common gotchas (from LESSONS.md)

- **`String.format` is JVM-only** — don't use it in commonMain. Use manual rounding: `(km * 10).toInt() / 10.0`.
- **Stale Gradle cache** after dependency changes — fix with `./gradlew :composeApp:compileDebugKotlinAndroid --rerun-tasks`.
- **iOS doesn't run end-to-end until Phase 7** ships (Clerk iOS SDK). All commonMain code compiles for iOS, but auth is stubbed.
- **Library docs lie. Read the source on GitHub** when integrating a new dependency — especially Dokka-generated docs which often 404.
- **Cascading version bumps** — adopting one library can force Kotlin/CMP/AGP/compileSdk upgrades. Use the `/upgrade-deps` skill to handle the cascade.
- **Next.js 16 `params` is a `Promise<...>`** — always `await params` in route handlers and Server Components. In Client Components, use `use(params)` from React.
- **`coil-network-okhttp` is JVM-only** — use `coil-network-ktor3` instead for Compose Multiplatform.
- **KDoc and unbalanced braces** — Kotlin/Native's KDoc parser chokes on `{...}` text that looks like unclosed inline tags. Prefer `//` line comments when the text contains braces.
- **`IrExternalPackageFragmentImpl → IrClass` cast crash during iOS link is a `kotlinx-datetime` version-skew, NOT a K/N exporter bug.** When `linkDebugFrameworkIosSimulatorArm64` crashes inside `createConstructorAdapter`, it's almost always a transitive dep that pulled `kotlinx-datetime` 0.7.1 (where `Instant` is a typealias) while the local pin is 0.6.2 (where it's a class). Bump `kotlinx-datetime` in `libs.versions.toml` to whatever `dependencyInsight --configuration iosSimulatorArm64CompileKlibraries --dependency org.jetbrains.kotlinx:kotlinx-datetime` reports as resolved. Triplane's pin is `0.7.1`; downstream forks bumping CMP/material3 should re-check this. See LESSONS.md § "Pain: `IrExternalPackageFragmentImpl → IrClass` cast crash".
- **`internal` for `composeApp/feature/<name>/*` is good API hygiene, not a K/N bug workaround.** Keeps the Swift-facing surface small (only `feature/auth/ClerkAuthBridge.kt` stays `public`). Originally adopted as a workaround for the cast crash above, but the actual root cause was the dep skew — the convention stays for hygiene reasons.
- **Turn on `-Xpartial-linkage-loglevel=error` first when iOS link breaks mysteriously.** Add to `composeApp/build.gradle.kts` inside `kotlin { ... }`:
  ```kotlin
  targets.withType(org.jetbrains.kotlin.gradle.plugin.mpp.KotlinNativeTarget::class.java).configureEach {
      binaries.all { freeCompilerArgs += listOf("-Xpartial-linkage-loglevel=error") }
  }
  ```
  Converts cryptic `IrExternalPackageFragmentImpl → IrClass` cast crashes into clear `unlinked class symbol '<package>/<Class>|null[0]'` messages. Single highest-leverage diagnostic for K/N issues.
- **Module version coherence is not automatic.** Adding `compose.material3` can pull `kotlinx-datetime` 0.7.1 transitively; Gradle conflict-resolution promotes to 0.7.1 but the local klibs were compiled against the pinned-lower version, so cross-module IR refs corrupt. After every dep change, run `./gradlew :composeApp:dependencyInsight --configuration iosSimulatorArm64CompileKlibraries --dependency <name>` for the deps you care about (especially `kotlinx-datetime`, `koin`, anything in `compose.*`).
- **`koin-compose-viewmodel:4.0.x` is incompatible with `lifecycle-viewmodel-compose:2.10.0`** — surfaces as runtime `IrLinkageError` reading a private `LocalViewModelStoreOwner.<companion>.stable` at first composition. Fix: bump `koin = "4.2.1"` (≥ 4.1.x rebuilt against modern lifecycle).
- **`startKoin {}` must be called in `MainViewController.kt` on iOS.** Android starts Koin in `MainActivity.onCreate`; iOS gets nothing by default. Without an idempotent `startKoin {}` inside the `ComposeUIViewController` lambda, the app crashes at first composition with `IllegalStateException: KoinApplication has not been started`. Use `KoinPlatform.getKoin()` + `runCatching` for the idempotent guard — `GlobalContext.getOrNull()` is not always re-exported on iOS in koin 4.x.
- **xcconfig `//` is a comment.** `API_BASE_URL = https://...` truncates to `https:`. Workaround: `https:/$()/host`. The `$()` expands to nothing at evaluation time.
- **`xcodebuild -destination 'generic/platform=iOS Simulator'` produces multi-arch `ARCHS`.** Breaks `embedAndSignAppleFrameworkForXcode` with `Could not infer iOS target architectures`. Use `'platform=iOS Simulator,name=iPhone 17'` or similar specific simulator instead.
- **`xcodebuild build` is NOT the iOS verification bar.** A successful Xcode build means the binary linked and signed. It does NOT mean Compose's `PlistSanityCheck` passes, that Koin is started, or that runtime `IrLinkageError` doesn't trip. Always finish with `xcrun simctl install + launch` and a 3-second liveness check — see § Build verification.
- **`web/src/app/global-error.tsx` is a load-bearing invariant.** Next.js 16 prerenders `/_global-error` as part of `next build`. If the file is missing, or if it imports ANY context provider (`ClerkProvider`, `NextIntlClientProvider`, `ThemeProvider`, anything with a React context), the build crashes with `Cannot read properties of null (reading 'useContext')`. The file must be `"use client"`, render its own `<html>`/`<body>`, and pull nothing from providers. Treat it as a template contract: do not edit, do not wrap in providers, do not move it under `[locale]/`. Canonical content lives at `web/src/lib/forge/canonical/global-error.tsx.ts` — forge verify-builds auto-repairs drift via `web/src/lib/forge/verify-global-error.ts`, and `/init-app` Step 7 has a matching pre-flight check for standalone runs.
- **`NODE_ENV=development` during `next build`** breaks prerendering. The build script uses `NODE_ENV=production next build` to prevent shell inheritance from the dev session.
- **Clerk `<SignIn/>` needs `[[...rest]]` catch-all** — a static `sign-in/page.tsx` 404s on Clerk sub-routes (`/sign-in/factor-one`, `/sign-in/sso-callback`). Use `sign-in/[[...rest]]/page.tsx`.
- **`prisma db push` before first run** — a new downstream DB has no tables. Every API route 500s silently until you run `prisma db push` or `prisma migrate deploy`.
- **Missing env vars → silent 500s** — if `process.env.SOME_KEY` is undefined, routes crash before the error wrapper can produce `{ error: { code, message } }`. Every env var must be in `.env.example`.
- **Next.js 16 `proxy.ts` must use a function declaration** — `export const proxy = clerkMiddleware(...)` silently fails. Next.js 16 renamed `middleware.ts` to `proxy.ts` and requires `export function proxy(...)` or `export const proxy = function(...)`. If the proxy never runs, next-intl locale rewrites don't happen and `/` returns 404.
- **Kotlin package dirs must be nested, not a single folder** — the package `com.priorli.myapp` on disk is `com/priorli/myapp/` (3 nested folders), NOT a single folder named `com.priorli.myapp` or `com\/priorli\/myapp`. When building paths from a dotted namespace, use `namespace.replace(/\./g, "/")`.
- **iOS `AuthTokenProvider.getToken()` MUST be synchronous (read `TokenStorage` directly).** `mobile/shared/.../ApiClient.kt`'s `defaultRequest { runBlocking { authTokenProvider.getToken() } }` runs on the calling coroutine's thread — `Dispatchers.Main.immediate` for `viewModelScope.launch` on iOS. `runBlocking` then blocks the main thread; if `getToken` calls into Swift and Swift schedules `Task { @MainActor }`, the Task can never run because the main actor is held. Deadlock. The Swift bridge keeps the cache warm via Clerk's `auth.events` stream + a 30-s backstop refresh; the Ktor hot path reads `NSUserDefaults["clerk_token"]` synchronously. See LESSONS.md § "Pain: iOS auth deadlock".
- **iOS `isSignedIn` derives from the cached JWT, NOT `Clerk.shared.user`.** Clerk's local state can lag the server: after server-side invalidation, `Clerk.shared.user` stays non-nil AND `Clerk.shared.auth.signOut()` itself fails with `ClerkAPIError(code: "signed_out")`, so you can't use either to clear local state. The cache (NSUserDefaults `"clerk_token"`) is the single source of truth — when `cacheCurrentToken()` fails it writes nil, the bridge's polling sees the change, `rememberIsSignedIn` flips, NavGraph navigates back to Auth.
- **`xcrun simctl install` of an unsigned build (`CODE_SIGNING_ALLOWED=NO`) breaks Clerk auth.** Unsigned builds get a different Keychain access group than dev-signed builds; sessions persisted by one are invisible to the other and the server rejects the resulting session cookies. Symptoms: "Not Authenticated" only in the simulator, real device works, Xcode-launched simulator works. **For any auth-touching iOS change, launch from Xcode** — the Run Script phase still rebuilds the Kotlin framework so iteration stays fast. Reserve `simctl install` for non-auth smoke tests.
- **The Clerk iOS SDK module is `ClerkKit`, not `Clerk`.** The package's *name* in `Package.swift` is `"Clerk"`, but its library product is `ClerkKit` (and `ClerkKitUI`). Swift `import` resolves product/module names. So `import ClerkKit` (and `import ClerkKitUI` if using the prebuilt `AuthView`). The `Clerk` *type* (e.g. `Clerk.shared`, `Clerk.configure(...)`) lives inside the `ClerkKit` module — name resolution still works once the import is right.
- **ClerkKit requires `IPHONEOS_DEPLOYMENT_TARGET = 17.0` minimum.** `Package.swift` declares `.iOS(.v17)`. Lower deployment targets fail with `compiling for iOS X.Y, but module 'ClerkKit' has a minimum deployment target of iOS 17.0`. Update both the pbxproj `IPHONEOS_DEPLOYMENT_TARGET` lines AND `Configuration/Config.xcconfig`.
- **When chasing a Kotlin/Native ↔ Swift bridge "function entered but nothing inside ran" bug, look at the calling Kotlin coroutine's dispatcher first.** `Task { @MainActor }` will silently fail to drain if the main thread is blocked (not suspended). The fix is almost always on the Kotlin side: hop dispatchers, switch to a synchronous-only bridge call, or eliminate the `runBlocking`. Adding `DispatchQueue.main.async` wrappers on the Swift side is symptom-suppression — libdispatch's main queue also waits for the runloop, which is what `runBlocking` is starving.

## Available skills

All nineteen skills live under `.claude/skills/<name>/SKILL.md` and auto-trigger from natural-language prompts. Prefer them over reciting the underlying workflow. Skills are grouped below: the first two bootstrap a downstream project from the template; the plan-review family (CEO/Eng/Design/DevEx/QA + orchestrator) critiques an `IDEA.md` before bootstrap; `/seed-demo` and `/stub-external-api` fake data at the DB layer and HTTP-boundary layer respectively so a downstream project can demo before real data / real API keys exist; the middle four drive day-to-day feature work; `/design-import` and `/design-study` form the design-system evolution pair (exact-value Figma round-trip + vision-driven inspiration); the last two handle cross-cutting maintenance.

| Skill | Purpose |
|---|---|
| `/ideate` | Raw-idea brainstormer. Adaptive 5–8 question Q&A that produces `IDEA.md` at repo root — product description, target user, MVP feature backlog. First step when bootstrapping a new product from the template. |
| `/init-app` | One-shot downstream bootstrapper. Consumes `IDEA.md`, wraps `bin/init.sh`, rewrites `PLAN.md`/`README.md`/`mobile_plan.md` template-meta, auto-renames display strings (Compose + web + Prisma), resets the feature matrix, build-verifies, then loops `/feature add` for each MVP backlog item. Refuses on an already-initialized template. |
| `/plan-autoplan` | Five-role planning review orchestrator. Chains `/plan-ceo-review` → `/plan-eng-review` → `/plan-design-review` → `/plan-devex-review` → `/plan-qa-review` on an `IDEA.md`, produces `PLAN_REVIEW.md` with per-reviewer sections and a `## Next steps` block. Invoked by the Triplane Forge web UI when the "planning review" checkbox is ticked; runs before `/init-app`. |
| `/plan-ceo-review` | CEO-style scope and framing critique. Reads `IDEA.md`, appends `## CEO review` with scope cuts, target-user sharpening, and a 0–10 PMF score. |
| `/plan-eng-review` | Engineering architecture + test-strategy review. Reads `CLAUDE.md § Architecture principles` + `§ Common gotchas`, appends `## Engineering review` with surface list (web / Android / iOS), risk list, and a 0–10 implementability score. |
| `/plan-design-review` | Design rubric reviewer. Appends `## Design review` with a 4-axis rubric (clarity / discoverability / delight / accessibility), top 3 interaction decisions, and one "cut for v0.1" call. Prose only — no mocks. |
| `/plan-devex-review` | Developer-experience reviewer. Appends `## DevEx review` with top 3 onboarding friction points and recommended `README.md` / `CLAUDE.md` additions for the downstream project. Recommendations only — does not edit docs directly. |
| `/plan-qa-review` | Plan-phase QA reviewer — **no browser automation**. Appends `## QA review` with per-feature test scenarios, cross-feature risks, a regression watchlist citing Triplane invariants, and a 0–10 testability score. Runs last in the `/plan-autoplan` chain. |
| `/qa` | Browser-based QA runner. Reads test scenarios from `PLAN_REVIEW.md` (or synthesizes from spec files), generates Playwright e2e tests in `web/e2e/`, runs them against a live dev server, reports pass/fail per scenario. Web-only for v1. Optionally fixes app code (not tests) on failure. Also available as a `qa-test` forge phase after verify-builds (soft-fail — QA failures are warnings, not blockers). |
| `/seed-demo` | Pre-presentation demo-data populator. Reads `web/prisma/schema.prisma`, generates/refreshes `web/prisma/seed.ts` with `@faker-js/faker`-powered fixtures scoped to `DEMO_USER_ID`, patches `web/package.json` (adds Faker + Prisma seed config + `db:seed` script), runs `bun install`, and optionally runs `bun run db:seed`. Idempotent (pinned Faker PRNG + hard-delete-then-reseed). Refuses on the pristine template. Re-runnable after `/feature add`. v1: Items-only, no Attachment seeding (skips S3). Optionally wired into `/forge/new` as a postlude checkbox. |
| `/stub-external-api` | HTTP-boundary stubber for external services. Takes an OpenAPI spec URL, runs `openapi-typescript` to generate typed schemas, then scaffolds a stub/real client pair under `web/src/lib/<service>/` (schema.d.ts + client.ts + stub-client.ts + http-client.ts + factory.ts + index.ts) and appends `<SERVICE>_API_KEY` to `web/.env.example`. The factory returns the Faker-powered stub when the key is unset, the real `fetch()` client when it is — no code changes needed when the key arrives. Deterministic stubs via `faker.seed(hashOfRequestParams)`. Standalone-only (not wired into forge). Pairs with `/seed-demo` (DB layer) — both part of the "fake it until you ship it" toolkit. v1 requires an OpenAPI 3.x spec URL; Swagger 2 and spec-less services are v2. |
| `/feature` | Spec-driven feature workflow — **add** (draft spec), **check** (verify spec vs code), **continue** (implement). The primary authoring skill. |
| `/scaffold` | New-feature file scaffolder. Generates placeholder files following the Items + Photos canonical structure. Refuses without an approved spec. |
| `/api-change` | Endpoint cascade walker. Enumerates the ~12 places a single `/api/v1/*` change propagates (zod, OpenAPI, server, client, mobile DTOs, mapper, domain, screens, spec). |
| `/audit` | Repo-wide drift detector. Cross-checks every spec's checkboxes against `PLAN.md` matrix and actual code. Read-only. |
| `/design-import` | Figma→code design-token importer. Wraps `bin/tokens-pull.sh`: reads `design/tokens.dtcg.incoming.json` (pushed by Tokens Studio Git sync), extracts brand OKLch + fonts + scales into `design/tokens.json`, warns loudly on non-expressible fields (non-brand colors, dark-mode overrides, extra scale entries), regenerates CSS/Kotlin/DTCG outputs, runs `/release-check`. For schema extensions (new color like `accent`, new scale slot), route through `/design-study` instead. |
| `/design-study` | Vision-driven design-system evolution. Accepts screenshots, URLs (captured via Playwright), Figma exports, and prose prompts. Uses Claude vision to extract dominant colors (OKLch estimates), type scale samples, corner-radius class, and recurring component patterns; cross-references against `design/tokens.json`; writes `design/studies/<timestamp>/DESIGN_STUDY.md` with proposed token deltas, schema-extension plans (e.g. adding an `accent` color), component gap list, and accessibility spot-checks. Read-only by default; `--apply` applies diffs atomically and runs `/release-check`, rolling back on build failure. Confidence notes on every proposal (OKLch estimates from screenshots are ±0.02 L / ±5° h). Pairs with `/design-import` — use this skill for inspiration, `/design-import` for exact-value Tokens Studio sync. |
| `/upgrade-deps` | Version cascade handler. Researches target version's own pins, updates `libs.versions.toml`, clean-rebuilds, logs the new set in PLAN.md. |
| `/release-check` | Runs web + Android + iOS build verifications in parallel, then `/audit`, reports a single summary. |

## Working with Claude Code on this project

- **Be specific.** "Implement Phase 4 of `specs/features/items.md`" beats "add items support."
- **Use plan mode for non-trivial work.** Get alignment before code.
- **Trust the skills.** `/feature` is more reliable than reciting the workflow.
- **Verify, don't trust.** Always grep the actual code rather than trusting checkboxes.
- **Long sessions:** save the plan, end the session, start fresh. Phase numbering survives compaction.
