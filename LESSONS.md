# Lessons — what we learned building Travolp

> If you're reading this in 6 months wondering "why is the project structured this way?", start here. Every decision in Triplane has a reason that came from a real pain point in Travolp. This document is the rationale you'll forget.

---

## Table of contents
1. [The big picture](#the-big-picture)
2. [Patterns that worked](#patterns-that-worked)
3. [Pain points and how Triplane prevents them](#pain-points-and-how-triplane-prevents-them)
4. [The auth saga](#the-auth-saga)
5. [The drift problem](#the-drift-problem)
6. [Architecture decisions](#architecture-decisions)
7. [Library research patterns](#library-research-patterns)
8. [Build verification practices](#build-verification-practices)
9. [Working with Claude Code on this stack](#working-with-claude-code-on-this-stack)
10. [Anti-patterns we hit and ruled out](#anti-patterns-we-hit-and-ruled-out)

---

## The big picture

Travolp is a trip-planning app with a Next.js web client, an Android client (Compose Multiplatform), and a stubbed iOS client (also CMP, gated on Phase 12.7 / Clerk iOS SDK integration). It was built phase-by-phase over many Claude Code sessions, starting from a single Next.js app and growing into a monorepo with shared feature specs that drive parallel implementation on web and mobile.

The most important things we learned aren't about any specific library — they're about **how to organize work** so that two clients implementing the same feature stay in sync, and how to give Claude Code enough structure to be genuinely productive without re-discovering the project on every session.

These are the lessons. Triplane bakes them in.

---

## Patterns that worked

### 1. Spec files as the contract between web and mobile

Every feature lives as a markdown file in `specs/features/<name>.md` with these sections:
- **Description** — one paragraph: what does this feature do and why
- **API** — endpoints (method, path, request, response) plus exact field-level schemas
- **Web Implementation** — page routes, components, key interactions
- **Mobile Implementation** — screens, ViewModels, shared module changes
- **Status** — checkboxes per platform

**Why this matters:** When you ask Claude to implement the mobile side of a feature, you don't have to explain the requirements again — Claude reads the spec. Same for the web side. The spec is also the natural place to capture decisions ("we render distance as `<1km → meters`, `≥1km → 1 decimal`") that would otherwise be lost in commit messages.

**Triplane's version:** `specs/features/_template.md` is pre-filled with the right structure, and the `/feature` skill walks you through creating, checking, and finishing features against it.

### 2. OpenAPI as the runtime contract

The Next.js API exposes OpenAPI 3.1 docs at `/api/v1/docs` via `zod-to-openapi` + Scalar UI. Every endpoint registers its request schema (Zod) and response schema (also Zod) in `web/src/lib/openapi/`. The mobile client's Ktor DTOs are derived from the same shapes.

**Why this matters:** When the API contract changes, the mobile DTOs need to change too — and if you forget, the runtime breaks silently (deserialization throws on a missing field). With OpenAPI as the source of truth, you have a single document to diff against, and the `/api-change` skill can walk you through the cascade.

### 3. Recent decisions log with dates

PLAN.md has a table of every meaningful decision, with a date column. When future-you (or Claude in a fresh session) asks "why does the auth provider work this way?", the decisions log answers in seconds. The diff alone never tells you *why*.

**Why this matters:** Code rots in 6 months. Rationale rots in 6 weeks. A decisions log is the cheapest possible knowledge management system, and it pays for itself the first time you avoid a re-litigation of an old debate.

**Triplane's version:** `PLAN.md` has a pre-formatted decisions log table, and the `/feature` skill reminds you to add an entry when finishing a non-trivial feature.

### 4. Architecture principles as a numbered list

PLAN.md has 13 numbered "load-bearing rules" — things like *"All API endpoints live under /api/v1/*"* and *"Mobile UI is feature-based"*. They're numbered so you can reference them ("violates principle #11"). They don't change often, and when they do change, that's a major decision worth a log entry.

**Why this matters:** Without explicit principles, every code review becomes a re-debate of conventions. With them, you can shut down a debate by pointing at a rule. Claude Code, in particular, benefits enormously from numbered principles because they're addressable.

### 5. Phase-based plan with discrete checkpoints

PLAN.md tracks phases (1.0, 1.1, ... 12.9) with explicit goals. Each phase is suspendable and resumable. When a session times out or compacts, the phase tracker tells the next session exactly where to pick up.

**Why this matters:** Open-ended work drifts. Phased work converges. The phase plan also forces honesty: "Phase 12.4 needs maps" is testable; "we should add maps" is not.

### 6. Feature-based folder structure (after we refactored from layer-based)

Originally Travolp's mobile code was organized by layer (`ui/`, `viewmodel/`, `repo/`). Halfway through, we refactored to feature-based (`feature/trips/`, `feature/days/`, `feature/maps/`) with each folder containing its screens, viewmodels, and components together. This was the single biggest improvement to mobile maintainability.

**Why this matters:** A new feature is a single directory. A retired feature is a single directory deletion. Cross-feature shared code lives in `common/`. The mental model matches the spec file structure (one folder per feature).

**Triplane's version:** Built feature-first from day one. Never go through the layer-based phase.

### 7. commonMain by default, expect/actual at platform seams only

We learned to keep as much code as possible in `commonMain` and only drop to `androidMain`/`iosMain` when the API genuinely differs. The list of platform-specific files in Triplane is short and audit-able:
- Auth (`AuthScreen`, `AuthState`, `PlatformModule`)
- TokenStorage (SharedPreferences vs NSUserDefaults)
- External map intent (`openExternalMap`)
- Image picker (handled by Peekaboo, no custom expect/actual needed)

Everything else — screens, ViewModels, repositories, use cases, navigation, theme, even the map composable (via kmp-maps) — is in commonMain.

**Why this matters:** The more code in commonMain, the less work to add a feature. The seams are the cost; minimize them.

### 8. Build verification commands captured in CLAUDE.md

Every session starts with Claude reading CLAUDE.md, which lists:
- `cd web && bun run build` — verify web compiles
- `cd mobile && ./gradlew :composeApp:assembleDebug` — verify Android compiles
- `cd mobile && ./gradlew :composeApp:compileKotlinIosSimulatorArm64` — verify iOS compiles

When a session ends, Claude knows to run these. When you start a session and ask "what's broken?", Claude knows what to check.

**Why this matters:** Without this, every session re-discovers the build commands by trial and error. With it, "verify nothing broken" is a 30-second action.

### 9. The `/feature` Claude Code skill

Workflow-as-instructions ("read CLAUDE.md, then check the spec, then verify against the matrix, then update both") is fragile — Claude forgets steps under context pressure. Workflow-as-skill (a markdown file Claude loads on demand) is reliable.

**Why this matters:** The `/feature` skill is the single biggest leverage point for using Claude Code on this stack. It's the difference between "Claude usually follows the workflow" and "Claude always follows the workflow."

**Triplane's version:** The `/feature` skill ships with Triplane out of the box.

---

## Pain points and how Triplane prevents them

### Pain: Spec/matrix drift

**What happened:** PLAN.md's feature matrix and 7 of 11 spec files in `specs/features/` claimed mobile was "🔲 Not started" for features that had been shipping for weeks. Nobody updated the checkboxes when work landed.

**Root cause:** Updating checkboxes is friction. Friction loses to inertia. Without an automated check, drift is inevitable.

**Triplane prevents this with:**
- The `/feature` skill always verifies spec checkboxes against actual code, not just trusts the box.
- The `/audit` skill (Phase 5) runs the same check across all features at once. Run it at the end of every session.
- The matrix has per-platform columns (Android + iOS) from day 1, so you can't accidentally hide an iOS gap inside a single "Mobile" cell.

### Pain: Single "Mobile" column hid the iOS gap

**What happened:** Travolp's matrix had one "Mobile" column. We marked features as ✅ when Android shipped — but iOS was completely non-functional (auth stubbed, no token, every API call would 401). The iOS gap was invisible until a manual audit late in development.

**Root cause:** Coarse status granularity. "Mobile = ✅" is a lie when Android works and iOS is a wall.

**Triplane prevents this with:**
- `Mobile (Android)` and `Mobile (iOS)` as two separate columns in the matrix from day 1.
- Spec files use `[ ] Mobile (Android)` and `[ ] Mobile (iOS)` separately in the Status section.
- The `_template.md` ships with both checkboxes pre-filled, so you can't forget one.

### Pain: Pre-existing iOS-incompat code (`String.format`) discovered late

**What happened:** A few lines of `"%.1f".format(km)` in commonMain compiled fine for Android but broke `compileKotlinIosSimulatorArm64`. Discovered weeks after the code was written, while wiring up the maps feature.

**Root cause:** Android-only build verification. iOS compile was never run, so iOS-incompatible patterns went undetected.

**Triplane prevents this with:**
- `compileKotlinIosSimulatorArm64` listed as a build verification command in CLAUDE.md from day 1.
- The `/release-check` skill (Phase 5) runs both Android and iOS compile checks before declaring a session done.
- A pre-commit hook (Phase 6) optionally runs the iOS compile on commit.

### Pain: Auth was 3 attempts before we landed it

We tried (a) embedding the web sign-in in a WebView and parsing the JWT cookie, (b) injecting JavaScript to call `Clerk.session.getToken()` from inside the WebView, and finally (c) the native Clerk Android SDK. The first two were dead ends because **Google blocks Sign in with Google in embedded WebViews** (since 2021).

**Root cause:** We didn't know about the Google policy at the start. Each failed attempt was a session of work.

**Triplane prevents this with:**
- Native Clerk Android SDK is the **only** documented auth path. WebView OAuth isn't even mentioned as an option in CLAUDE.md.
- Clerk iOS SDK is pre-planned for Phase 12.7 (after Android stabilizes). Same approach, same SDK pattern.
- See [The auth saga](#the-auth-saga) below for the full story.

### Pain: Cascading version bumps when adopting Clerk SDK

**What happened:** Clerk Android SDK 1.0.11 required Kotlin ≥ 2.3.10, which required Compose Multiplatform ≥ 1.10.3, which required AGP ≥ 8.9.1, which required `compileSdk` 36. Each upgrade exposed new errors. The cascade took most of a session to resolve.

**Root cause:** Versions in `libs.versions.toml` were pinned to a coherent set, but adding one new library forced a global re-coherence.

**Triplane prevents this with:**
- `libs.versions.toml` is pinned to a known-coherent set including the Clerk SDK from day 1.
- The `/upgrade-deps` skill (Phase 5) handles cascades when you do need to bump: it researches compatible versions via web search, updates the file, runs a clean rebuild, and captures the new pins in PLAN.md's decisions log.

### Pain: Library docs returned 404

**What happened:** When integrating `kmp-maps`, the Dokka docs at `docs.swmansion.com/kmp-maps/` were partially broken — many class detail pages 404'd. We had to read the source from GitHub via `curl` to discover the actual API surface (e.g., that `Polyline` has a `lineColor` field, that `CameraPosition` accepts `bounds: MapBounds`, that marker color customization on Android requires `customMarkerContent` because `AndroidMarkerOptions` has no color field).

**Root cause:** Library docs are unreliable; source is the only ground truth.

**Triplane prevents this with:**
- A note in CLAUDE.md: *"When integrating a new library, prefer reading the actual source on GitHub over the docs site. Docs lie. Source compiles."*
- The decisions log captures library API discoveries so future sessions don't re-research.

### Pain: Phase 12.7 meant 2 different things

PLAN.md's Phase 12.7 said "Feature specs for all existing features" in one place and "iOS auth — Clerk iOS SDK" in others. Same number, different meanings, in the same file.

**Root cause:** Phase numbers were edited without tracing all references.

**Triplane prevents this with:**
- Phase definitions live in **one canonical place** in PLAN.md.
- The `/feature` skill checks for phase number drift when it audits.

### Pain: Stale Gradle cache

When adopting Clerk, the first build failed even after the dependency was added correctly. Resolution: `./gradlew :composeApp:compileDebugKotlinAndroid --rerun-tasks`.

**Triplane prevents this with:**
- `/upgrade-deps` skill includes `--rerun-tasks` as a fallback step.
- CLAUDE.md mentions the cache-flush command as a known recovery step.

### Pain: Kotlin/Native ObjC exporter crashes on certain composeApp public types

**What happened:** Phase 7 (iOS auth) hit `java.lang.ClassCastException: IrExternalPackageFragmentImpl cannot be cast to IrClass` inside `ObjCExportCodeGeneratorKt.createConstructorAdapter` every time the `linkDebugFrameworkIosSimulatorArm64` task ran. Bisect narrowed the trigger to Phase 4's `composeApp/feature/items/*` code combined with shared-domain types crossing the module boundary. Upgrading Kotlin 2.3.10 → 2.3.20 stable did **not** fix the crash. `@HiddenFromObjC` on `ItemDetailViewModel`/`PickedPhoto` did not fix it either.

**Root cause:** A Kotlin/Native 2.3.x ObjC-export bug that trips on some public type shapes when they're reachable through the composeApp framework's public API surface. Not specific to one class — narrowing further would have required more bisecting than the session budget allowed.

**Triplane prevents this with:**
- **Workaround**: every `composeApp/feature/<name>/*` type is marked `internal`. Internal visibility excludes the type from the ObjC export surface, so the buggy exporter never touches it. Compose + Koin still work because `internal` is same-module-accessible.
- **Rule**: Swift-facing bridge types (e.g. `feature/auth/ClerkAuthBridge.kt` — the protocol + holder + SAM callbacks) stay `public`. Everything else in composeApp feature folders stays `internal`.
- Documented in CLAUDE.md § Common gotchas so future feature work defaults to `internal` from the start.
- The link-not-compile verification rule (see the § "Build verification practices" callout above) ensures future exporter crashes surface at PR time, not three phases later.

### Pain: Research agents hallucinated API shapes for a new library

**What happened:** Phase 7 used an Explore subagent to research Clerk iOS SDK. The agent reported `Clerk.shared.configure(publishableKey:)` and `try await Clerk.shared.session?.getToken()?.jwt` and `try await Clerk.shared.signOut()`. All three were wrong:

1. `configure` is a static method on `Clerk`, not an instance method — correct: `Clerk.configure(publishableKey:)`
2. `.getToken()` returns `String?` directly, no `.jwt` wrapper — correct: `Clerk.shared.auth.getToken()`
3. Sign out lives on `auth`, not `Clerk` — correct: `Clerk.shared.auth.signOut()`

The Swift code compiled against the agent's API shapes failed with four distinct errors. We fixed them by reading the actual `Clerk.swift` source from the SPM checkout in Xcode DerivedData.

**Root cause:** Even "verified research" from an LLM-powered agent can be wrong in ways that look plausible. Subagents don't run the code they describe.

**Triplane prevents this with:**
- New rule in § Library research patterns: **after adopting a library, read the source or let the compiler tell you**. Research agents are OK for "does it exist" and "which package" questions; they are not OK for API shape details. Trust only what compiles.
- The `/upgrade-deps` skill documents this: "Library docs lie. Research agents hallucinate. Source compiles."

---

## The auth saga

This deserves its own section because it cost the most sessions and produced the most learning.

### What we tried

**Attempt 1 (failed): WebView with cookie extraction**
- Render Clerk's hosted sign-in page in an Android WebView
- After successful sign-in, read the `__session` cookie and extract the JWT
- **Why it failed:** The `__session` cookie value isn't a raw JWT — it's a Clerk-encoded session token. Calling our API with it returned `Invalid JWT form`.

**Attempt 2 (failed): WebView with JavaScript bridge**
- Same WebView, but inject JavaScript that calls `window.Clerk.session.getToken()` and posts the result back to native via `Android.postJwt(token)`
- The JS bridge worked. The token was a valid JWT.
- **Why it failed:** Google Sign in with Google **does not work in embedded WebViews** as of policy change in late 2021. Users see "This browser or app may not be secure" and the sign-in flow refuses to start. There's no workaround — Google won't budge.

**Attempt 3 (worked): Native Clerk Android SDK**
- `com.clerk:clerk-android-api` + `clerk-android-ui` (1.0.11)
- Provides a prebuilt `AuthView` Compose composable that handles the entire sign-in flow
- Uses Android Credential Manager for Google sign-in (the supported native flow, not WebView)
- Works first try

### What we learned

1. **Never use WebView for OAuth.** Google blocks it. Any hosted-page sign-in flow that includes Google as an option is unusable in a WebView.
2. **Native SDKs > rolled-your-own.** Clerk's prebuilt `AuthView` composable was a 50-line integration. The WebView attempts cost ~3 sessions.
3. **The auth flow is the foundation everything else depends on.** No auth → no API calls → no app. Get auth right first, before any feature work.
4. **iOS auth is its own integration.** Clerk has a separate iOS SDK with its own setup. Don't assume what works on Android transfers.
5. **JWT injection happens in one place.** All API calls go through a single Ktor `HttpClient` that has an `AuthTokenProvider` interface; the platform module provides the implementation. This means switching auth providers is a one-file change.

### Triplane's auth approach

- Native Clerk Android SDK on Android (commonMain provides interface, androidMain provides Clerk-backed implementation)
- Native Clerk iOS SDK on iOS (Phase 7 in Triplane's plan, equivalent to Phase 12.7 in Travolp)
- `AuthScreen` is `expect`/`actual` because the auth UI is platform-native
- `AuthTokenProvider` is an interface in `commonMain`, with platform-specific implementations that read fresh JWTs from the respective Clerk SDK
- API client injects the JWT via Ktor `HttpResponseValidator` — single point of integration

---

## The drift problem

This was the second-most-expensive lesson, after auth.

### What happened

By Phase 12.4 of Travolp, the `PLAN.md` feature matrix and 7 of 11 `specs/features/*.md` files said "Mobile: 🔲 Not started" for features that had been shipping since Phases 12.0–12.3. The work landed; the documentation didn't update.

When a fresh session started and asked "what's left on mobile?", the answer from the docs was "everything" — which was wrong.

### Why it happened

1. **Updating two places is friction.** When you finish work, you want to move on. Stopping to update PLAN.md and the spec file feels bureaucratic.
2. **No automated check.** Nothing in the workflow verified that the checkboxes matched the code.
3. **Coarse Mobile column.** "Mobile = ✅" hid the fact that iOS was completely non-functional. The matrix told a story that made the iOS gap invisible.
4. **Different humans / Claude sessions did different parts.** Each session was trying to ship its phase, not curate the matrix.

### How we fixed it (in Travolp, retroactively)

1. Audited every feature against actual code (mobile feature folders, navigation routes, DI registrations).
2. Found the drift: 7 features were Android-shipped but marked 🔲. Two features (AI Chat, Attachments) were genuinely missing UI.
3. Realized the iOS gap was hidden because the auth blocker (Phase 12.7) made every iOS feature uniformly unrunnable, but the single Mobile column treated this as "feature by feature."
4. Split the Mobile column into `Mobile (Android)` + `Mobile (iOS)`.
5. Added an `Auth` row to the matrix to make the iOS upstream blocker explicit.
6. Updated all 11 spec files and the matrix to reflect verified state.
7. Built the `/feature` skill to prevent recurrence.

### How Triplane prevents it

1. **`Mobile (Android)` and `Mobile (iOS)` columns from day 1.** No coarse "Mobile" column to hide gaps in.
2. **`/feature` skill always verifies against code.** Never trusts checkboxes.
3. **`/audit` skill runs the cross-check across all features at once.** Designed to run at session start or session end.
4. **A row for `Auth` in the matrix.** Forces the iOS blocker to be visible upstream of the per-feature work.
5. **The iOS column note above the matrix:** explicitly says "every iOS 🔲 below is gated on Phase 7 (Clerk iOS SDK)." Makes the structural truth findable in 5 seconds.

---

## Architecture decisions

These are the load-bearing rules. Each one cost something to learn. Triplane bakes them in.

### 1. `/api/v1/*` versioning from day 1
Versioned API routes. Mobile clients are pinned to a version. Web app calls its own API the same way mobile does (`fetch('/api/v1/...')`). No server actions for data mutations, no direct Prisma access from server components. **Why:** without this, web and mobile drift apart. With it, the API is a real contract.

### 2. `{ data: T }` / `{ error: { code, message } }` response shape
Every API response uses this shape, via typed helpers in `web/src/lib/api-response.ts`. **Why:** error handling is uniform across both clients; type guards are trivial; no special-casing per endpoint.

### 3. Soft deletes via `deletedAt` on every user-deletable entity
DELETE endpoints set the timestamp instead of removing rows. All queries filter `deletedAt: null`. Files in object storage are preserved. **Why:** users hit "delete" by accident; "oops" recovery is a Tuesday, not a four-alarm fire. Real deletion is a separate cleanup job.

### 4. Clean Architecture in the KMM shared module
Domain (models, use cases, repository interfaces) → Data (DTOs, API client, repository implementations, mappers) → Presentation (ViewModels + Compose UI). Domain depends on nothing. Data depends on domain. Presentation depends on domain. **Why:** ViewModels become trivially testable. The API can be swapped (e.g., for offline mode in Phase 9) without touching screens.

### 5. Mobile UI is feature-based, not layer-based
Each feature folder (`feature/trips/`, `feature/days/`, `feature/maps/`) contains screens, viewmodels, and components together. Shared components in `common/`. **Why:** features are added and removed as units. Layer-based folders create scattered changes for any single feature.

### 6. commonMain by default, expect/actual at platform seams only
Maximize sharing. Drop to platform code only when the API genuinely differs (auth UI, token storage, external intents). **Why:** every line in commonMain runs on both platforms by default. Platform code is the cost; minimize it.

### 7. Native auth SDKs (Clerk Android + Clerk iOS), never WebView
Google blocks OAuth in WebViews. There's no workaround. Use the native SDKs. **Why:** see [The auth saga](#the-auth-saga).

### 8. OpenAPI 3.1 spec is the API contract
Every endpoint registers its request and response schemas. The spec is served at `/api/v1/docs` via Scalar UI. Mobile DTOs are derived from the same shapes. **Why:** without a single source of truth, web and mobile DTOs silently drift.

### 9. Every API route uses Clerk's `auth()` helper
Same code handles cookies (web) and `Authorization: Bearer <token>` (mobile). No special-casing per client. **Why:** one auth code path means one set of bugs.

### 10. `Mobile (Android)` and `Mobile (iOS)` as separate matrix columns from day 1
Coarse columns hide platform gaps. Per-platform columns force honesty. **Why:** see [The drift problem](#the-drift-problem).

### 11. Phase numbers are stable and never reused
Once a phase is named "Phase 7 — iOS auth," it never becomes anything else. **Why:** Travolp's Phase 12.7 meant two different things in two different places. We don't want that.

### 12. Recent decisions log entries are dated and durable
When you make a non-trivial decision, log it in PLAN.md's decisions log with the date. Future-you will not remember why. **Why:** see [Patterns that worked § 3](#3-recent-decisions-log-with-dates).

### 13. Build verification is in CLAUDE.md
Every session knows the verify commands. **Why:** no session should re-discover build commands.

---

## Library research patterns

When integrating a new library:

1. **Check if it's still maintained.** Last commit date, GitHub stars, open issues.
2. **Find a library that targets your exact stack.** For Compose Multiplatform, look for libraries explicitly listing CMP support — not just Kotlin.
3. **Read the source before trusting docs.** Dokka docs and project websites lie. The `commonMain` source on GitHub is ground truth.
4. **Check the example app.** Most well-maintained libraries have a `sample/` or `example/` directory showing real usage.
5. **Capture API discoveries in PLAN.md decisions log.** The next session shouldn't have to re-research what `IosMarkerOptions.tintColor` does.
6. **Verify version compatibility before adoption.** If the library forces a Kotlin/CMP/AGP cascade, capture all the new pinned versions in `libs.versions.toml` and the decisions log.
7. **Research agents hallucinate API shapes.** Subagent-produced research is fine for "does this library exist" and "which package" questions but untrustworthy for exact function signatures, return types, and method chaining. Phase 7's Clerk iOS research got three separate API shapes wrong (`Clerk.shared.configure` vs `Clerk.configure`, `.getToken()?.jwt` vs `.getToken()` returning `String?`, `Clerk.shared.signOut()` vs `Clerk.shared.auth.signOut()`). Fix: once SPM / Gradle has resolved the library, read the actual `.swift` / `.kt` source out of the local cache (Xcode DerivedData, `~/.gradle/caches/`). The compiler is the ultimate source of truth — if it compiles, the API shape is right.

The `/upgrade-deps` skill (Phase 5) automates much of this.

---

## Forge-discovered gotchas (Phase 10)

These gotchas surfaced during Triplane Forge test runs — automated app bootstrapping where the pipeline had to build and run a complete downstream app end-to-end. They affect the template and every downstream project.

### Next.js 16 requires `global-error.tsx`

**What happened:** `bun run build` failed during static export with `TypeError: Cannot read properties of null (reading 'useContext')` on the `/_global-error` page.

**Root cause:** Next.js 16 tries to prerender a default global error boundary during build. Without `web/src/app/global-error.tsx`, the auto-generated version calls `useContext` outside any provider (no ClerkProvider, no ThemeProvider) and crashes. Only manifests during production builds — dev mode hides it.

**Fix:** Add a minimal `global-error.tsx` at the app root with `"use client"`, its own `<html>/<body>` tags, and no dependency on context providers. Baked into the template.

### `NODE_ENV=development` during `next build` breaks prerendering

**What happened:** `bun run build` ran with the shell's `NODE_ENV=development` inherited from the dev session. React's development-only code paths ran during prerendering, triggering extra `useContext` checks that crashed on the `/_global-error` page.

**Root cause:** `next build` does not force `NODE_ENV=production`. It trusts the environment. If you ran `bun run dev` earlier in the same shell, `NODE_ENV=development` persists.

**Fix:** Changed the build script to `NODE_ENV=production next build`. Baked into the template's `package.json`.

### Clerk `<SignIn/>` needs a catch-all route

**What happened:** Clerk's `<SignIn/>` component threw a configuration error saying the route is not a catch-all route.

**Root cause:** Clerk's sign-in flow has multi-step sub-routes (`/sign-in/factor-one`, `/sign-in/sso-callback`). A static `sign-in/page.tsx` only matches `/sign-in` — the sub-routes 404.

**Fix:** Move the page to `sign-in/[[...rest]]/page.tsx` (optional catch-all). Same for sign-up if present. Baked into the template.

### Missing `prisma db push` before first run

**What happened:** Every `/api/v1/*` endpoint returned 500 with an empty body. The `requireUser()` helper's `prisma.user.upsert()` threw because the User table didn't exist.

**Root cause:** The Prisma schema existed but no migrations had been run and `prisma db push` was never called. The database was empty.

**Fix:** Downstream apps forged from the template must run `prisma db push` (dev) or `prisma migrate deploy` (prod) before the first request. The `/init-app` skill should prompt for this, or verify builds should catch it.

### Missing env vars cause silent 500s

**What happened:** API routes returned 500 with empty response bodies, causing `"Unexpected end of JSON input"` on the client. No useful error message.

**Root cause:** When `process.env.SOME_KEY` is undefined and code calls an external API or Prisma with it, the error is thrown before the route's error-handling wrapper can produce a `{ error: { code, message } }` response. The empty 500 is invisible.

**Fix:** Every `process.env.*` reference should have a corresponding entry in `.env.example`. Features that add new env vars must update `.env.example` in the same PR. The `/feature continue` prompt now mandates this.

### Kotlin package directories must be nested, not dotted or escaped

**What happened:** A forge run created `mobile/shared/src/commonMain/kotlin/com\/priorli\/supercellua/` — a single directory literally named `com\/priorli\/supercellua` (with backslash-slash separators baked into its name) — instead of the correct nested structure `com/priorli/supercellua/` (three nested directories).

**Root cause:** The `buildFeatureContinuePrompt` in `web/src/lib/forge/worker.ts` used a `<namespace>` placeholder without specifying whether it should be dotted (`com.priorli.supercellua`) or path-form (`com/priorli/supercellua`). The agent guessed wrong and — in one run — produced an escape-slashed dotted form as a single folder name. Kotlin packages use dotted notation (`package com.priorli.supercellua`) but on disk they MUST be nested directories (each dot is a directory separator).

**Fix:** The prompt builder now accepts the `namespace` as a parameter, computes the path form upfront (`namespace.replace(/\./g, "/")`), and substitutes the actual path into the prompt. The `<namespace>` placeholder is gone. Added a post-init sanity check that greps for literal `\` or `.` in directory names under `mobile/*/src/*/kotlin/`.

### Next.js 16 `proxy.ts` requires a function declaration

**What happened:** The landing page at `/` returned 404. All locale-prefixed routes (`/en-US/`, `/en-US/home`) worked fine, but the root `/` never redirected.

**Root cause:** Next.js 16 renamed `middleware.ts` to `proxy.ts` and requires the exported `proxy` to be an actual function declaration. The template used `export const proxy = clerkMiddleware(...)` which Next.js 16 didn't recognize as a valid proxy function. The middleware never ran, so next-intl's locale rewrite from `/` to `/en-US/` never happened.

**Fix:** Change the export to a function declaration: `export const proxy = clerkMiddleware((auth, request) => { ... })` must be a recognizable function expression, not just an assigned value from a library call. Alternatively, wrap it: `export function proxy(...args) { return clerkMiddleware(handler)(...args); }`. The key test: if `/` 404s but `/en-US/` works, the proxy isn't running.

---

## Build verification practices

After any non-trivial change:

```bash
# Web
cd web && bun run build

# Mobile — Android
cd mobile && ./gradlew :composeApp:assembleDebug

# Mobile — iOS framework link (NOT compile — see callout below)
cd mobile && ./gradlew :composeApp:linkDebugFrameworkIosSimulatorArm64
```

The iOS framework link is the task that catches the subtle issues Android ignores AND the ObjC exporter crashes that source-level compile silently skips. **Always run the link, not the compile, before declaring a feature done.**

### Why `link`, not `compile` — the verification gap we hit

Phase 4 shipped with `:composeApp:compileKotlinIosSimulatorArm64` as the documented iOS verification target. It worked: compile was green across every Phase 4 change. Then Phase 7 tried to build the actual iOS framework and discovered a Kotlin/Native ObjC-exporter crash — `java.lang.ClassCastException: IrExternalPackageFragmentImpl cannot be cast to IrClass` inside `createConstructorAdapter` — triggered by Phase 4 composeApp public types. The crash had been sitting in the repo for three phases, undetected.

**Root cause:** `compileKotlinIosSimulatorArm64` only performs **source-level compilation** to klib. It does not run the ObjC header exporter. `linkDebugFrameworkIosSimulatorArm64` performs the full framework build — compile + link + ObjC export — and is where exporter crashes surface. Picking the compile task as the verification bar meant the exporter was never exercised outside a real iOS build.

**Triplane prevents this with:**
- `linkDebugFrameworkIosSimulatorArm64` as the documented iOS verification target in CLAUDE.md, `/release-check` skill, and `.github/workflows/ci.yml` — all three places that used to say `compile` now say `link`.
- Explicit anti-pattern callout in CLAUDE.md § Common gotchas.
- The `/release-check` skill bundles all three (web build + Android assembleDebug + iOS framework link) into one command.

---

## Working with Claude Code on this stack

What works:

1. **Be specific.** "Implement Phase 4 of `specs/features/items.md`" beats "add items support."
2. **Use plan mode for non-trivial work.** Get alignment before code.
3. **Trust the skills.** `/feature` is more reliable than reciting the workflow each session.
4. **Verify, don't trust.** Always grep the actual code rather than trusting checkboxes or memory.
5. **Capture rationale, not just changes.** Add a decisions log entry when the *why* is non-obvious.
6. **Phase numbering for resumability.** Phases survive context compaction; ad-hoc todo lists don't.
7. **Pressure-test architectural decisions with a Plan subagent before executing.** Phase 4's 5-tradeoff review (attachment FK, upload strategy, bucket visibility, repository split, HomeScreen fate) ran through a Plan agent that confirmed 4 defaults and pushed back on 1 — the HomeScreen retention that kept Phase 7's iOS bring-up isolated from Items. One ~10-minute review prevented a coupling that would have cost hours in Phase 7. The cost is cheap; the unlock is real.

What doesn't work:

1. **"Implement everything for items."** Too vague — Claude will interpret broadly.
2. **Trusting checkboxes without verifying code.** Drift is real.
3. **Skipping plan mode for "small" changes.** Small changes touching shared code aren't small.
4. **Ignoring the iOS compile.** Android-green doesn't mean iOS-green.
5. **Long sessions without compaction checkpoints.** Save the plan, end the session, start fresh.

---

## Anti-patterns we hit and ruled out

| Anti-pattern | Why we ruled it out |
|---|---|
| **WebView for OAuth** | Google blocks it. Always use native SDK. |
| **Server actions for data mutations** | Breaks the API contract that mobile depends on. Use `fetch('/api/v1/...')` from the web client too. |
| **Direct Prisma access from server components** | Same reason — bypasses the API contract. |
| **Layer-based folder structure** | Scatters every feature change across `ui/`, `viewmodel/`, `repo/`. Refactored to feature-based mid-project. |
| **`String.format` in commonMain** | iOS Kotlin/Native doesn't support it. Use manual rounding or a multiplatform formatter. |
| **Single "Mobile" column in the matrix** | Hides platform gaps. Always split Android/iOS. |
| **Trusting library docs over source** | Docs return 404 and lie. Read the source. |
| **Phase number reuse** | Phase 12.7 meant 2 things. Confusing forever. Phase numbers are immutable once assigned. |
| **Spec checkboxes without verification** | Drift is inevitable. Always verify against code. |
| **Adding dependencies without checking the cascade** | One library can force Kotlin/CMP/AGP/compileSdk upgrades. Plan the cascade first. |
| **Hard deletes on user content** | "Oops" should be recoverable. Soft delete everything. |
| **Auth tokens in TokenStorage instead of fresh from Clerk** | Stale tokens cause silent 401s. Always fetch fresh via `Clerk.auth.getToken()`. |
| **Hardcoded API base URLs** | Use BuildConfig (Android) and per-build environment configuration. |
| **Using `compileKotlinIosSimulatorArm64` as the iOS verification target** | Compile-only tasks skip the ObjC exporter. Use `linkDebugFrameworkIosSimulatorArm64` — catches everything `compile` catches plus the exporter crashes. Phase 4 hid an ObjC-export regression this way for three phases. |
| **Public types in `composeApp/feature/<name>/*` that Swift doesn't need** | Triggers a Kotlin/Native ObjC-exporter cast crash on certain type shapes (confirmed on 2.3.10 and 2.3.20). Mark as `internal` — same-module access is enough for Compose and Koin, and `internal` types skip ObjC export entirely. Only the `feature/auth/ClerkAuthBridge.kt` protocol + holder needs to stay `public` for Swift. |
| **Trusting subagent-produced API shapes for new libraries** | LLM research agents hallucinate method signatures and return types. Fine for "does it exist" and package names; not fine for exact APIs. Read the library source from the local SPM / Gradle cache, or let the compiler reject wrong shapes. |

---

## Closing

Triplane is the answer to a question we kept asking ourselves: *"if we were starting Travolp today, what would we do differently?"*

Every section above has a one-line answer. Every answer is baked into Triplane.

If you're starting a new Priorli project from this template, the most valuable thing you can do is **read this document once before you start writing code**. You'll save yourself the same lessons.
