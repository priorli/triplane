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
11. [White-label & multi-tenancy lessons (Travolp Phase 1 + 2a)](#white-label--multi-tenancy-lessons-travolp-phase-1--2a-2026-05-08)
12. [Push notifications & background delivery lessons (Travolp 2026-05-10)](#push-notifications--background-delivery-lessons-travolp-2026-05-10)
13. [Push part 2 — iOS FCM, foreground UX, debug tooling (Travolp 2026-05-10)](#push-part-2--ios-fcm-foreground-ux-debug-tooling-travolp-2026-05-10)
14. [CI/CD pipeline lessons (Travolp 2026-05-11)](#cicd-pipeline-lessons-travolp-2026-05-11)
15. [Live location & cross-platform notification surface (Travolp 2026-05-11)](#live-location--cross-platform-notification-surface-travolp-2026-05-11)
16. [Local release orchestrator & ops gotchas (Travolp 2026-05-11)](#local-release-orchestrator--ops-gotchas-travolp-2026-05-11)

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

### Pain: `IrExternalPackageFragmentImpl → IrClass` cast crash during ObjC export — actually a `kotlinx-datetime` version-skew bug

> **2026-05-07 update:** Travolp's iOS bring-up isolated the *real* root cause of this crash. The original Triplane attribution ("K/N 2.3.x ObjC-export bug on certain public type shapes") was wrong — the symptom was real, but the cause is a transitive dep-version skew that the exporter trips over while serializing constructor adapters. The `internal`-visibility workaround we shipped in Phase 7 worked by *reducing* the ObjC export surface so the exporter never reached the broken klib refs, but it never fixed the underlying issue. This entry documents both: what's actually wrong, and the diagnostic that surfaces it in seconds instead of hours.

**What happened (original):** Phase 7 (iOS auth) hit `java.lang.ClassCastException: IrExternalPackageFragmentImpl cannot be cast to IrClass` inside `ObjCExportCodeGeneratorKt.createConstructorAdapter` every time `:composeApp:linkDebugFrameworkIosSimulatorArm64` ran. Bisect narrowed the trigger to Phase 4's feature types crossing the shared-domain module boundary. Kotlin 2.3.10 → 2.3.20 didn't fix it. `@HiddenFromObjC` didn't fix it. Marking feature types `internal` did fix it — by accident.

**Actual root cause:** `libs.versions.toml` pins `kotlinx-datetime = "0.6.2"`, but `compose.material3` (whatever the CMP plugin's alias resolves to) transitively pulls `kotlinx-datetime = "0.7.1"`. Gradle conflict-resolution promotes to 0.7.1 — but `:shared` and `:composeApp` were compiled against 0.6.2's API where `kotlinx.datetime.Instant` is a real class. In 0.7.1 it's a deprecated typealias to `kotlin.time.Instant` (introduced in Kotlin 2.x stdlib). When K/N's ObjC exporter walks the framework's public API surface and encounters a constructor whose enclosing class declaration came from the now-typealiased `kotlinx.datetime.Instant`, the IR loader can't find the class — it returns an `IrExternalPackageFragmentImpl` placeholder instead — and `getConstructedClass(constructor)`'s cast to `IrClass` blows up.

The 2026-04-13 design-system decisions log entry literally said "*pre-existing `kotlinx.datetime/Instant` linkage warnings on shared module are unrelated to this phase — same warnings before and after*". Those warnings were the bug. They were never benign.

**Diagnostic — turn this on first when iOS link goes sideways:**

```kotlin
// composeApp/build.gradle.kts, inside kotlin { ... }
targets.withType(org.jetbrains.kotlin.gradle.plugin.mpp.KotlinNativeTarget::class.java).configureEach {
    binaries.all {
        freeCompilerArgs += listOf("-Xpartial-linkage-loglevel=error")
    }
}
```

This converts the K/N "partial linkage warnings" (which the compiler hides during normal builds, then crashes opaquely later) into hard errors that **name the unlinked symbol**. With the flag on, the cast crash above turns into:

```
e: <project> @ <file>:<line>: Property accessor 'startDate.<get-startDate>' uses
   unlinked class symbol 'kotlinx.datetime/Instant|null[0]'
```

Now the cause is obvious. Without the flag, the cast is the only signal you get, and it points at the compiler instead of your `libs.versions.toml`.

**Fix:**

1. Run `./gradlew :composeApp:dependencyInsight --configuration iosSimulatorArm64CompileKlibraries --dependency org.jetbrains.kotlinx:kotlinx-datetime`. Note the resolved version.
2. Bump `kotlinx-datetime` in `libs.versions.toml` to match the resolved version (currently 0.7.1).
3. Stop the Gradle daemon, clean, rebuild. The link succeeds. Existing usages of `kotlinx.datetime.Instant` keep working because it's a typealias.

**Triplane bakes this in:**

- `libs.versions.toml` pins `kotlinx-datetime = "0.7.1"` (and `koin = "4.2.1"` for a related runtime IrLinkageError — see next entry).
- The `-Xpartial-linkage-loglevel=error` diagnostic is recommended in CLAUDE.md § Common gotchas as the first move when iOS link surfaces unhelpful errors.
- The `internal`-visibility convention on `composeApp/feature/<name>/*` types stays — not as a K/N bug workaround, but as good API hygiene (keeps the Swift export surface small, makes the auth bridge types stand out as the only intentional `public` surface). The new framing lives in CLAUDE.md.
- The verification bar moved from "`xcodebuild build` greens" to "`xcrun simctl install + launch` and process survives ≥3s" — see the next pain entry.

### Pain: `koin-compose-viewmodel:4.0.4` crashes at first composition on iOS

**What happened:** App built green, launched on simulator, then immediately crashed during first `setContent` with `kotlin.internal.IrLinkageError: Can not read value from backing field of property 'androidx_lifecycle_viewmodel_compose_LocalViewModelStoreOwner$stable': Private backing field of property declared in module <org.jetbrains.androidx.lifecycle:lifecycle-viewmodel-compose> can not be accessed in module <io.insert-koin:koin-compose-viewmodel>`.

**Root cause:** koin-compose-viewmodel:4.0.4 was compiled against an older `lifecycle-viewmodel-compose` where `LocalViewModelStoreOwner.<companion>.stable` was visible. Lifecycle 2.10.0 made it `private`. The K/N link permits this (linkage check is non-fatal by default), but the runtime partial-linkage engine refuses the access at first call. Surfaces during composition because that's when koin-compose-viewmodel reads the `LocalViewModelStoreOwner`.

**Diagnostic:** Same `-Xpartial-linkage-loglevel=error` flag from the previous entry surfaces this at link time, not runtime.

**Fix:** Bump `koin = "4.2.1"` in `libs.versions.toml`. Versions ≥ 4.1.x rebuilt against modern lifecycle.

**Triplane bakes this in:** `libs.versions.toml` pins `koin = "4.2.1"`. `/upgrade-deps` knows to keep koin and lifecycle in lockstep — bumping one without the other re-triggers this class of error.

### Pain: `startKoin {}` is not called on iOS

**What happened:** App launched, crashed immediately with `kotlin.IllegalStateException: KoinApplication has not been started`. Stack pointed at `org.koin.core.context.MutableGlobalContext#get()` from inside `LocalKoinScopeContext$1.invoke#internal` — i.e., Compose tried to resolve a Koin scope and there was no Koin to resolve from.

**Root cause:** Triplane's iOS entry was bare: `fun MainViewController() = ComposeUIViewController { App() }`. Android starts Koin in `MainActivity.onCreate`. iOS got nothing. The Phase 7 iOS bring-up never actually launched the app on simulator — only `xcodebuild build` was run, which doesn't exercise `App()`'s composition — so the missing init slept undetected.

**Fix:** Idempotent guard inside the `ComposeUIViewController` lambda:

```kotlin
package com.priorli.triplane

import androidx.compose.ui.window.ComposeUIViewController
import com.priorli.triplane.di.appModule
import com.priorli.triplane.di.platformModule
import com.priorli.triplane.shared.di.sharedModule
import org.koin.core.context.startKoin
import org.koin.mp.KoinPlatform

fun MainViewController() = ComposeUIViewController {
    val started = runCatching { KoinPlatform.getKoin() }.isSuccess
    if (!started) {
        startKoin { modules(platformModule, sharedModule, appModule) }
    }
    App()
}
```

Use `KoinPlatform.getKoin()` (with `runCatching`), not `GlobalContext.getOrNull()` — koin 4.x moved `GlobalContext` and the latter is not always re-exported via `koin-core` on iOS.

**Triplane bakes this in:** the canonical `MainViewController.kt` ships with the guard above. The pattern matches what Android does in `MainActivity.onCreate`, just gated to run once.

### Pain: `xcodebuild build` greens silently while the app crashes on launch

**What happened:** Phase 7 declared "iOS green end-to-end" because `xcodebuild build` returned `BUILD SUCCEEDED`. In reality, the app crashed within 1s of any launch — Compose `PlistSanityCheck` threw, then later `IrLinkageError` from the koin/lifecycle skew, then `KoinApplication has not been started`. None of those were caught by build verification because none of them happen until the simulator process actually executes the app's first instruction.

**Root cause:** `xcodebuild build` checks "the binary linked and signed". It does NOT check "the app survives launch". For Compose Multiplatform iOS in particular, half the failure modes are runtime initialization checks (Plist sanity, Compose runtime setup, K/N runtime IrLinkageError) that only fire during the simulator's first dispatch loop.

**Fix — verification chain that catches launch-time failures:**

```bash
# 1. Build (existing)
xcodebuild -project mobile/iosApp/iosApp.xcodeproj -scheme iosApp \
  -configuration Debug -destination 'platform=iOS Simulator,name=iPhone 17' \
  CODE_SIGNING_ALLOWED=NO build

# 2. Boot, install, launch, and verify the process survives
SIM_ID=$(xcrun simctl list devices | grep "iPhone 17 (" | head -1 | grep -oE '\([0-9A-F-]{36}\)' | tr -d '()')
xcrun simctl boot "$SIM_ID" 2>/dev/null || true
APP_PATH="$(xcodebuild -showBuildSettings -project mobile/iosApp/iosApp.xcodeproj \
  -scheme iosApp -configuration Debug -destination "platform=iOS Simulator,id=$SIM_ID" \
  | grep -m1 BUILT_PRODUCTS_DIR | awk '{print $3}')/Triplane.app"
xcrun simctl install "$SIM_ID" "$APP_PATH"
xcrun simctl launch "$SIM_ID" com.priorli.triplane
sleep 3
pgrep -f Triplane >/dev/null && echo "alive" || echo "CRASHED — see ~/Library/Logs/DiagnosticReports/Triplane-*.ips"
```

Crash reports for simulator apps land in `~/Library/Logs/DiagnosticReports/<AppName>-*.ips` (JSON-ish format). The Kotlin exception is in the backtrace as `kfun:` symbols.

**Triplane bakes this in:**
- CLAUDE.md § Build verification adds an "install + launch" step after the link/build steps.
- `/release-check` skill upgrades to run install + launch + 3s liveness as part of the iOS leg (TODO — see decisions log entry 2026-05-07; the skill upgrade is a separate session).
- `xcodebuild build` is explicitly called out as **not** the verification bar.

### Pain: xcconfig `//` is a comment

**What happened:** `API_BASE_URL = https://api.example.com` in `Configuration/Config.xcconfig` reads as `https:` at runtime — the `//api.example.com` part is silently stripped because xcconfig treats `//` as the start of a comment.

**Diagnostic:** `xcodebuild -showBuildSettings -project iosApp.xcodeproj | grep API_BASE_URL` reports the truncated value.

**Fix:** Insert an empty `$()` between the slashes so the `//` never appears literally:

```
API_BASE_URL = https:/$()/api.example.com
```

The `$()` expands to nothing at xcconfig evaluation time. Final value: `https://api.example.com`.

**Triplane bakes this in:** the canonical `Config.xcconfig` uses `https:/$()/...` for all URL values, with a comment explaining the workaround.

### Pain: iOS auth deadlock — `runBlocking` on main + Swift `Task { @MainActor }` (the most expensive bug of the second iOS bring-up session)

**What happened:** After Travolp's iOS Clerk integration appeared to land cleanly (sign-in returned a valid `SignIn` and `setActive(sessionId:)` succeeded), the very first API call hung forever on the trips screen. No timeout, no error — just a spinner. Captured stdout showed exactly:

```
[ClerkAuthBridge] signInWithPassword invoking Kotlin callback   ← OK
[TokenProvider] requesting token from bridge                    ← Kotlin entered the bridge call
                                                                ← Swift body never logs anything
```

Wrapping the Swift body in `DispatchQueue.main.async { Task { @MainActor in ... } }` did not help: the dispatch never fired.

**Root cause:** `mobile/shared/.../ApiClient.kt` builds the Ktor client with:
```kotlin
defaultRequest {
    url(baseUrl)
    val token = runBlocking { authTokenProvider.getToken() }
    ...
}
```
Ktor's `defaultRequest { ... }` block runs synchronously on the **calling coroutine's thread**. For `viewModelScope.launch` on iOS that is `Dispatchers.Main.immediate` — i.e. the main thread. `runBlocking` then **blocks the main thread**. Inside, the iOS `AuthTokenProvider.getToken()` (the original implementation) called the Swift bridge's `getTokenAsync`, which scheduled `Task { @MainActor in await Clerk.shared.auth.getToken() }`. The Task needs the main actor (== main thread) to run — but the main thread is held by `runBlocking`. The Task never executes, the Kotlin callback is never invoked, the continuation never resumes, the API call never sends. Deadlock.

`signInWithPassword` worked because the AuthScreen's `viewModelScope.launch { bridge.signInWithPassword(...) }` is **suspending**, not blocking — it releases the main thread for the Swift Task to run on. `runBlocking` does not suspend, it busy-waits.

**Diagnostic:** add an entry NSLog **before** the `Task { @MainActor }` block in the Swift bridge method. If the entry log fires but no log inside the Task fires, something is preventing the @MainActor task from being drained — and the calling thread (which holds the main actor) is the prime suspect. Check the call site for `runBlocking`.

**Fix:** make the iOS `AuthTokenProvider.getToken()` **synchronous** so `runBlocking` never has to wait. Have Swift push the current Clerk JWT into `TokenStorage` (NSUserDefaults under `"clerk_token"`) whenever the session changes; Kotlin reads it back via the synchronous `TokenStorage.getToken()` already in place. The Kotlin-defined `bridge.getTokenAsync` method stays on the protocol for completeness but is no longer in the API hot path.

Token freshness is maintained by Swift via two mechanisms — both in the bridge:
1. **Subscribe to `Clerk.shared.auth.events`** (an `AsyncStream<AuthEvent>`). On `tokenRefreshed`, write the token. On `signedOut`/`accountDeleted`, clear it. On `signInCompleted`/`signUpCompleted`/`sessionChanged`, fetch and cache.
2. **Periodic backstop loop** that calls `Clerk.shared.auth.getToken()` every ~30 s and writes the result. Also runs once at app startup (no `if user != nil` gate) so a Keychain-restored stale session is detected before the home screen fires its first request.

**Bonus subtlety: `isSignedIn` derives from the cached token, NOT `Clerk.shared.user`.** Clerk's local state can lag the server. After a session is invalidated server-side, `Clerk.shared.user` stays non-nil for some time, AND `Clerk.shared.auth.signOut()` itself fails with `signed_out` — so you cannot use it to clear local state. The token cache is the SINGLE SOURCE OF TRUTH for "are we authenticated for our API?". Both `isSignedIn()` and `observeSignedIn()` in the bridge read the cached token, not Clerk's user property.

**Triplane bakes this in:** the canonical `iosApp/iosApp/ClerkAuthBridgeImpl.swift` ships with the cache + auth-events observer + 30-s refresh loop, and `composeApp/.../di/PlatformModule.ios.kt`'s `ClerkBridgeAuthTokenProvider` reads `TokenStorage` synchronously. The eventual right-er fix would refactor `ApiClient.kt` to use Ktor's `Auth { bearer { loadTokens {...}; refreshTokens {...} } }` plugin (suspend-aware, no `runBlocking`); that refactor is out of scope for any single bug fix because the file is shared with Android. Until then, the synchronous-cache pattern is mandatory on iOS.

### Pain: `xcrun simctl install` of a `CODE_SIGNING_ALLOWED=NO` build silently breaks Clerk auth

**What happened:** The deadlock above was partially masked for two hours because the simulator had been receiving CLI-built unsigned binaries (`xcodebuild ... CODE_SIGNING_ALLOWED=NO build` → `xcrun simctl install`). Every login attempt produced `ClerkAPIError(code: "signed_out", message: "Signed out")` even with valid credentials. The same code launched from Xcode worked correctly. We assumed the deadlock and the auth failure were the same bug; they weren't.

**Root cause:** Clerk persists session refresh tokens in the iOS Keychain. Unsigned builds get a different Keychain access group than dev-signed builds — Keychain entries written by one are invisible to the other, and any session-cookie/UAT cookie pair the server expects becomes invalid. Symptoms include "the previous successful login is now signed_out", login flows that succeed at the API layer but produce no usable token afterwards, and `signed_out` errors that won't go away across rebuilds.

**Diagnostic:** if "Not Authenticated" reproduces in the simulator but not on a real device, AND the same code under Xcode works, this is the cause.

**Fix:** for any iOS dev/test cycle that exercises auth, **launch from Xcode**, not from `xcrun simctl install + launch`. The Run Script phase in `iosApp.xcodeproj` already runs the Kotlin framework build, so iteration is fast.

**Triplane bakes this in:** § Build verification's iOS block already prefers `xcodebuild ... -destination 'platform=iOS Simulator,name=iPhone 17'` for binary-level checks, but that's still unsigned. Add a one-line note in the iOS section: *for any auth-touching change, run from Xcode (signed build) — `simctl install` of an unsigned binary corrupts Clerk's Keychain access*.

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

**Sequel — same bug in shell:** `bin/init.sh` and `bin/design-tokens.sh` both produced the same `com\/priorli\/x` garbage on macOS because they used `NEW_PATH="${NAMESPACE//./\/}"`. On macOS's bash 3.2, that parameter expansion preserves the replacement's `\` literally — so every `.` becomes `\/` instead of `/`, and the resulting string is one directory name with embedded backslashes, not three nested directories. Linux bash 5 handles it correctly, which is why the bug slept through CI and only bit locally. **The portable fix is `tr`:**

```sh
NEW_PATH=$(printf '%s' "$NAMESPACE" | tr '.' '/')   # ✅ correct everywhere
NEW_PATH="${NAMESPACE//./\/}"                       # ❌ breaks on macOS bash 3.2
```

Rule of thumb: whenever you convert a dotted namespace to a path in shell, use `tr '.' '/'`, not parameter expansion. Same for JavaScript/TypeScript — `.replace(/\./g, "/")` — never string templates with escape tricks.

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

Phase 4 shipped with `:composeApp:compileKotlinIosSimulatorArm64` as the documented iOS verification target. It worked: compile was green across every Phase 4 change. Then Phase 7 tried to build the actual iOS framework and discovered a `java.lang.ClassCastException: IrExternalPackageFragmentImpl cannot be cast to IrClass` crash — initially blamed on a K/N exporter bug, later (2026-05-07, in Travolp) traced to a `kotlinx-datetime` version skew between modules; see § Pain section above. The crash had been sitting in the repo for three phases, undetected.

**Root cause:** `compileKotlinIosSimulatorArm64` only performs **source-level compilation** to klib. It does not run the ObjC header exporter. `linkDebugFrameworkIosSimulatorArm64` performs the full framework build — compile + link + ObjC export — and is where exporter crashes surface. Picking the compile task as the verification bar meant the exporter was never exercised outside a real iOS build.

But there's a second gap: `linkDebugFrameworkIosSimulatorArm64` and even `xcodebuild build` only check that the binary compiles, links, and signs. They don't check that the app launches. Phase 7 declared "iOS green" on `xcodebuild build` and shipped a binary that crashed within 1s of every simulator launch (CMP `PlistSanityCheck`, runtime `IrLinkageError` from version skews, and missing `startKoin` — see Travolp's 2026-05-07 pain entries). The full verification chain has three legs, not one.

**Triplane prevents this with:**
- `linkDebugFrameworkIosSimulatorArm64` as the documented iOS verification target in CLAUDE.md, `/release-check` skill, and `.github/workflows/ci.yml`.
- An additional `xcrun simctl install` + `xcrun simctl launch` + 3-second liveness check after the link, called out in CLAUDE.md § Build verification. **Build green ≠ launch green** — runtime initialization checks (Plist sanity, K/N partial-linkage runtime errors, missing DI init) only fire during the simulator's first dispatch loop.
- Explicit anti-pattern callouts in CLAUDE.md § Common gotchas.
- The `/release-check` skill bundles all three legs into one command (TODO: skill upgrade for the install+launch leg, see PLAN.md decisions log 2026-05-07).

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
| **Public types in `composeApp/feature/<name>/*` that Swift doesn't need** | Keeps the ObjC export surface small. Originally adopted as a workaround for an `IrExternalPackageFragmentImpl → IrClass` cast crash later traced to a `kotlinx-datetime` version skew (see Pain entry above) — but the convention is good API hygiene regardless. Only the `feature/auth/ClerkAuthBridge.kt` protocol + holder needs to stay `public` for Swift. |
| **Trusting subagent-produced API shapes for new libraries** | LLM research agents hallucinate method signatures and return types. Fine for "does it exist" and package names; not fine for exact APIs. Read the library source from the local SPM / Gradle cache, or let the compiler reject wrong shapes. |
| **Pinning `kotlinx-datetime`, `koin`, etc. without checking transitive resolution** | A top-level pin doesn't override a higher transitive version — Gradle promotes to the higher version, but the local klibs were compiled against the lower. `dependencyInsight --configuration iosSimulatorArm64CompileKlibraries --dependency <name>` after every dep change. Triplane learned this the hard way with `kotlinx-datetime` 0.6.2 → 0.7.1 (Travolp 2026-05-07). |
| **Treating `xcodebuild build` as iOS verification** | A successful Xcode build means "the binary linked and signed". It does NOT mean "Compose's runtime checks pass", "Koin is started", "K/N partial-linkage doesn't crash at runtime". Always finish with `xcrun simctl install + launch` and a 3-second liveness check. |
| **Ignoring K/N partial-linkage warnings** | They turn into runtime `IrLinkageError` crashes on first composition. Set `freeCompilerArgs += "-Xpartial-linkage-loglevel=error"` on iOS targets when debugging. Treat any partial-linkage warning as a fix-now. |
| **xcconfig values containing `//`** | xcconfig treats `//` as a comment start. `https://api.example.com` parses as `https:`. Use `https:/$()/api.example.com` — the `$()` expands to nothing at evaluation time. |
| **`xcodebuild -destination 'generic/platform=iOS Simulator'`** | Produces multi-arch ARCHS (`arm64 x86_64`) which breaks `embedAndSignAppleFrameworkForXcode`. Use `'platform=iOS Simulator,name=iPhone 17'` or similar specific simulator. |
| **Bare `MainViewController.kt` without `startKoin`** | iOS gets no equivalent of Android's `MainActivity.onCreate`, so Koin never starts → `IllegalStateException: KoinApplication has not been started` at first composition. Always idempotent-guard `startKoin {}` inside the `ComposeUIViewController` lambda. |

---

## White-label & multi-tenancy lessons (Travolp Phase 1 + 2a, 2026-05-08)

After v0.2 of Travolp shipped, the product pivoted from a solo trip planner to a B2B white-label platform: each travel agency gets their own branded mobile app (separate App Store listing, separate bundle id) backed by a shared multi-tenant server. Phase 1 (data model + per-agency mobile build pipeline + invite flow) and Phase 2a (custom domains) both shipped. Lessons that map back to Triplane:

### 1. If multi-tenancy is *plausible*, add it on day 1

Backfilling tenancy into a single-tenant schema is doable (we did it) but the "default tenant" backfill bakes a literal-string id into the codebase forever. In Travolp the legacy tenant's id is the literal `'travolp'` and every existing `Trip` row's `tenantId` defaults to that string — touch it and the backfill breaks. If a future Triplane-based project even *might* go B2B, the cost of starting tenant-aware is one extra `Tenant` table + a `tenantId String @default("default")` column on user-owned entities. The cost of retrofitting is paying that price PLUS a permanent hardcoded id-string contract.

**Triplane's version (recommendation, not yet baked in):** if a project's `PLAN.md` flags B2B/agency/multi-tenant in the requirements, scaffold the tenancy model up front. Reference shape: `Tenant { slug, kind, brandPrimary?, customDomain? }`, `Membership { userId, tenantId, role }`, `<Entity>.tenantId` indexed.

### 2. Do not use Clerk Organizations

We added them, ripped them out the same day. Reasons:
- Paid tier on production Clerk plans (~$25/mo + per-MAU).
- Hosted accept page can't be tenant-branded (tourist redeeming a Greek-Escape invite lands on a clerk.com page).
- Mobile token-direct flow blocked on Clerk-iOS-SDK org parity, which doesn't exist.
- We mirror everything to our own DB anyway — the webhook is the only thing they buy us.

The replacement pattern: own `TenantInvite` table (id, tenantId, email, role, token, status, expiresAt) mirroring `TripInvite`, `Resend` for email delivery, `getVerifiedClerkEmails` for email-binding. Total replacement was ~1 session of work and it eliminated three operational liabilities at once. **Don't put Clerk Orgs back unless someone makes a strong case.**

### 3. The "rip-out" lesson generalizes

When a Phase 1 expedient turns out to add ongoing cost (paid tier, vendor lock-in, mobile-SDK gap), rip it out before Phase 2 work compounds the dependency. The cost of removing Clerk Orgs after one session was small; after Phase 2 was built on top of org-scoped tokens, it would have been weeks. Same logic applies to: payment-provider lock-in, hosted-page UX, vendor-managed user storage.

### 4. Per-tenant mobile builds: gradle flavors + iOS xcconfig overlays

True white-label means each agency gets their own App Store listing, not runtime theming. The pattern that worked:

- **Source of truth**: `branding/tenants/<slug>.json` — name, displayName, primaryColor, iosBundleId, androidAppId, deepLinkScheme, appLinkHost, apiBaseUrl. One file per tenant.
- **Asset pipeline**: a single Bun + sharp + opentype.js script reads the JSONs and emits per-tenant Android `res/values/*.xml` + drawable + iOS asset catalog + iOS entitlements file.
- **Android**: `build.gradle.kts` reads the JSONs at configure time and registers one `productFlavor` per tenant. Each flavor sets `applicationId`, `manifestPlaceholders`, BuildConfig fields. Tasks become `assembleTravolpDebug`, `assembleExampleAgencyDebug`, etc.
- **iOS**: per-tenant xcconfig overlays at `iosApp/Configuration/Tenants/<slug>.xcconfig` set `PRODUCT_BUNDLE_IDENTIFIER`, `PRODUCT_NAME`, etc. A shell script copies staged assets into the live catalog, runs `xcodebuild -xcconfig ...`, and `git checkout` restores the catalog post-build.
- **Runtime read**: `expect object TenantConfig` exposes slug, displayName, brandPrimaryHex, deepLinkScheme, appLinkHost. Android actual reads BuildConfig; iOS actual reads `NSBundle.mainBundle.infoDictionary` keys set by the xcconfig overlay.

### 5. iOS entitlements gotcha

xcconfig variable substitution **does not work inside .entitlements files** (Apple's tooling reads them as static plists). For per-tenant Associated Domains (`applinks:tours.greekescape.com`), generate per-tenant entitlements files in your asset pipeline and have each xcconfig point `CODE_SIGN_ENTITLEMENTS` at the right one. There's a one-time manual Xcode step where you `Add Files to "iosApp"…` for each new tenant entitlement file — xcconfig only tells Xcode where to find it, not to bundle it.

### 6. Edge middleware can't run Prisma — use an internal lookup endpoint

Custom-domain routing (Host-header → tenant slug → URL rewrite) needs DB access from middleware. Next.js `proxy.ts` defaults to Edge runtime where Prisma is finicky. The pattern that worked: an internal `GET /api/internal/tenant-by-host?host=...` endpoint with `export const runtime = "nodejs"` returns `{ tenant: { slug } | null }`. The Edge middleware `fetch`es it with an in-memory cache (per-Edge-instance, 60s TTL with negative caching for unknown hosts). One DB hit per host per minute per instance.

### 7. Custom-domain rewrite must run intl middleware on the rewritten URL

If you do `NextResponse.rewrite(new URL("/{locale}/agencies/{slug}/..."))` and skip the next-intl middleware, you lose locale negotiation on the custom domain. The pattern: build a `NextRequest` for the rewritten URL, call `intlMiddleware(rewriteRequest)`, and return its response (falling back to a plain rewrite if it returns nothing). URL bar stays on the agency's domain.

### 8. Mobile per-agency deep links via manifest placeholders

Every flavor needs to respond to its own URL scheme + universal-link host, not the platform's. Pattern:
- `branding/tenants/<slug>.json` carries `deepLinkScheme` + `appLinkHost`.
- `build.gradle.kts` injects them as `manifestPlaceholders["deepLinkScheme"]` + `["appLinkHost"]` per flavor.
- `AndroidManifest.xml` uses `android:scheme="${deepLinkScheme}"` and `android:host="${appLinkHost}"`.
- iOS `Info.plist` `CFBundleURLSchemes` references `$(DEEP_LINK_SCHEME)`; per-tenant entitlements file sets the right `applinks:`.
- `NavGraph` deep-link `uriPattern`s and the iOS `routeIosDeepLink` parser read `TenantConfig.deepLinkScheme` + `TenantConfig.appLinkHost` instead of hardcoded strings.

Verified end-to-end by inspecting the merged manifest of a non-default flavor — the substitution lands at packaging time, not at runtime.

### 9. Tenant resolution: header on mobile, host or path on web, default fallback

Single resolver in `lib/tenant.ts`:
- `tenantSlugFromHeader(req)` reads `X-Tenant-Slug` (mobile sends it from `BuildConfig.TENANT_SLUG`).
- Web uses URL path (`/[locale]/agencies/[slug]/...`) or Host header (custom domain rewrite).
- Anything that doesn't resolve falls back to a literal default tenant (in our case `'travolp'`).
- `requireMembership({ userId, tenantSlug, anyOf? })` does the role check, with kind-aware relaxation for the public-tenant case.

Every tenant-scoped API route uses `requireMembership(...)` instead of bare `auth()`. `web/AGENTS.md` documents this rule explicitly so a future Claude session doesn't accidentally write a tenant-leaky query.

### 10. Manual ops process for first ~10 agencies, automate later

We did NOT build self-service everything. Phase 2a custom domains require ops to run `fly certs add tours.greekescape.com` after the agency saves. Per-tenant mobile builds require ops to run `bun run build-tenant.ts <slug>` and submit to the stores. Self-service everything is Phase 2b. The lesson: don't build automation for a step that hasn't proven to be a bottleneck. Manual ops scales fine for the first 5–10 customers and forces real engagement with each onboarding.

---

## Push notifications & background delivery lessons (Travolp 2026-05-10)

After group chat and the in-app inbox shipped, Travolp wired FCM (unified
for Android + APNs-via-Firebase-proxy) end-to-end across web + Android +
iOS. The fan-out pipeline (server-side `sendPush` → `firebase-admin` →
device) and the device-token registration loop (mobile boots → grabs token
→ POSTs to `/api/v1/me/devices` → server fans out on the next chat
message) all came online in one session, mostly because every step had a
gotcha that didn't surface in the other steps. Lessons that map back to
Triplane:

### 1. Swift-callable Kotlin bridges live in composeApp, not shared

Travolp's first attempt put `expect class PushTokenProvider` and the
Swift-callable top-level `setApnsToken(token:)` bridge in
`mobile/shared/src/iosMain/...`. Build was green and the type compiled,
but `iOSApp.swift` couldn't see `PushTokenBridgeKt` ("Cannot find in
scope"). Root cause: `composeApp` depends on `:shared` as
`implementation` (not `api`), so `:shared` symbols are bundled into the
final framework binary but **not surfaced in the generated Swift header**.
The Swift code only sees what's exported from `ComposeApp.framework`,
which is `composeApp/src/iosMain/...`. Existing patterns (`ClerkAuthBridge`,
`MapBackdropBridge`, `ImagePickerBridge`) all live in composeApp/iosMain
for exactly this reason.

**The rule for Triplane:** any Kotlin top-level function or class that
Swift code calls directly (via the auto-generated `<FileName>Kt` static
class) MUST live in `composeApp/src/iosMain/...`. The `:shared` module is
for business logic that mobile UI consumes via Koin DI — never for
Swift-callable surface.

### 2. Filename dots become underscores in Swift export names

`PushTokenProvider.ios.kt` is exported to Swift as
`PushTokenProvider_iosKt`, not `PushTokenProviderKt`. Travolp's first
crash was `PushTokenProviderKt` not found in Swift scope — the dot in the
filename had become an underscore in the K/N-generated header.
`DeepLinkSupport.ios.kt` had hit the same gotcha earlier in the project
and was renamed to `DeepLinkSupport.kt` (no infix) in commonMain.

**The rule for Triplane:** when a file contains top-level Kotlin
functions that Swift will call by `<FileName>Kt.method(...)`, the file
must NOT have a `.ios` / `.android` infix in its name. Use a dot-free
filename in iosMain (e.g. `PushTokenBridge.kt`). If you also need an
expect/actual surface, keep that in a separate file with the standard
`.ios.kt` infix — Swift never needs to see those.

### 3. R8 / proguard rules are mandatory for Ktor-on-Android release builds

Travolp's first signed release build crashed R8 with:

```
Missing class okhttp3.internal.Util (referenced from:
void okhttp3.internal.sse.RealEventSource.processResponse(okhttp3.Response))
```

Root cause: Ktor's OkHttp engine references optional code paths (SSE
internals, BouncyCastle, Conscrypt, OpenJSSE) that R8 sees but can't
resolve, so it errors on missing classes by default. The other obligatory
keeps for KMP releases: kotlinx-serialization's `$$serializer` companion
classes (reflective access, stripped without keep rules → every
`@Serializable` class blows up at decode time).

**The rule for Triplane:** `mobile/composeApp/proguard-rules.pro` must
ship from day 1 with the standard KMP keeps even before the first release
build. The minimum set that worked: `-dontwarn okhttp3.internal.**`,
`-dontwarn org.bouncycastle.**`, `-dontwarn org.conscrypt.**`, `-dontwarn
io.ktor.**`, `-keep class io.ktor.** { *; }`, `-keep class
kotlinx.coroutines.** { *; }`, plus per-module `$$serializer` keeps and
`-keep class <pkg>.data.remote.dto.** { *; }`. Wire it via
`proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"),
"proguard-rules.pro")` in the release buildType. Catching this at
"shipping the first APK" is days of debugging; catching it at scaffold
time is one file.

### 4. `google-services.json` lives per-flavor, not in androidMain

Travolp put the JSON at `composeApp/src/androidMain/google-services.json`
because that's where the Kotlin source set lives. The
`com.google.gms.google-services` Gradle plugin doesn't search there — it
expects per-flavor paths like `composeApp/src/<flavorName>/google-services.json`.
For multi-tenant apps with productFlavors, this means **one JSON per
tenant flavor**, each registered against the flavor's `applicationId`. A
single shared JSON for two flavors fails plugin validation: "No matching
client found for package name '<other-package>'".

For tenants without an active Firebase app yet (Travolp's example-agency
flavor), a stub JSON with the right `package_name` keeps the build
green; runtime FCM init fails silently (now that PushTokenProvider
swallows exceptions — see #8) and push doesn't deliver. Documented stub
in the file's `_comment` field so the next person knows to swap it.

**The rule for Triplane:** scaffold `composeApp/src/<defaultFlavor>/.gitkeep`
plus a setup-step in CLAUDE.md saying "drop google-services.json here per
flavor". When tenancy is plausible day-1, a stub for non-active flavors
keeps CI green.

### 5. Firebase BOM doesn't work with the platform() Gradle helper in current Kotlin

Travolp tried the standard `implementation(platform(libs.firebase.bom))`
pattern and got:

```
Using 'platform(Any): Dependency' is an error.
Scheduled for removal in Kotlin 2.3. Check KT-58759
```

The Kotlin DSL `platform()` function clashes with something in the
KMP/AGP plugin combo at this Kotlin version. Workaround: skip the BOM,
pin Firebase Messaging directly with an explicit version (`24.1.0` at the
time of writing).

**The rule for Triplane:** when adding any Maven BOM-coordinated library
(Firebase, OkHttp, AndroidX), pin direct artifact versions in
`libs.versions.toml` rather than relying on a BOM. Less elegant; immune
to the `platform()` regression.

### 6. iOS APNs entitlement is an xcconfig variable, not a literal

`aps-environment` must be `development` for dev/TestFlight Debug and
`production` for App Store / TestFlight Release. Hardcoding either in
`iosApp.entitlements` works for one config and breaks the other.

**The pattern that worked:** declare `APS_ENVIRONMENT = development` in
`Config.Debug.xcconfig` and `APS_ENVIRONMENT = production` in
`Config.Release.xcconfig`, then reference it in entitlements as:

```xml
<key>aps-environment</key>
<string>$(APS_ENVIRONMENT)</string>
```

Same xcconfig template works for any other build-config-dependent
entitlement (associated domains, app-group identifiers, etc.). Plus
`UIBackgroundModes` += `remote-notification` in Info.plist so APNs can
deliver while backgrounded.

### 7. Android 13+ runtime notification permission is mandatory

Declaring `<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />`
in the manifest gives the app the *ability* to show notifications, but
Android 13+ silently drops every system tray notification until you call
`ActivityCompat.requestPermissions(...)` (or the modern
`ActivityResultContracts.RequestPermission` launcher). Pre-Android-13
doesn't need this. The permission dialog only appears on first ask;
subsequent calls return the cached answer without re-prompting.

**The pattern that worked:** `MainActivity.onCreate` calls a one-liner
`maybeRequestNotificationPermission()` that gates on
`Build.VERSION.SDK_INT >= TIRAMISU` and
`ContextCompat.checkSelfPermission(...) != GRANTED`. The result handler
just logs — re-prompting is the user's job (Settings → Apps →
Notifications) and Android suppresses repeated programmatic prompts
anyway.

iOS handles the equivalent via
`UNUserNotificationCenter.current().requestAuthorization(options: [...])`
in AppDelegate's `didFinishLaunchingWithOptions`.

### 8. PushTokenProvider must NEVER throw — `FIS_AUTH_ERROR` otherwise crashes the app

Travolp's first wiring of `PushTokenProvider.current()` on Android did:

```kotlin
.addOnFailureListener { err -> cont.resumeWithException(err) }
```

When Firebase Installations Service auth failed (misconfigured
`google-services.json`, missing API enablement, SHA-1 mismatch — any of
the half-dozen FIS_AUTH_ERROR causes), the exception propagated through
the launched coroutine in NavGraph's `LaunchedEffect`, which had no
exception handler, and crashed the app. Push is best-effort; a Firebase
misconfig must NEVER take the app down.

**The rule:** every `PushTokenProvider.current()` failure path must
resume with `null` instead of throwing. Plus belt-and-suspenders:
`PushRegistration.start()` wraps every provider/use-case call in
`runCatching` so even unexpected exceptions in the SDK can't escape.

```kotlin
.addOnFailureListener { err ->
    Log.w("PushTokenProvider", "FCM token fetch failed; push disabled", err)
    if (cont.isActive) cont.resume(null)
}
```

**General principle for Triplane:** background-fetch APIs that depend on
external configuration (Firebase, location, Mapbox) must be plumbed with
"fail silent, log loud" semantics from the start. The crash-on-misconfig
pattern is what you get from naive `suspendCancellableCoroutine`
wrappers around Play Services Tasks.

### 9. Token registration is tied to sign-in lifecycle via LaunchedEffect + awaitCancellation

The naive approach: `MainActivity.onCreate` fires
`PushRegistration.start()` once. Wrong because:
- Pre-sign-in, `POST /me/devices` 401s.
- On sign-out, the server-side row stays bound to the previous user.
- On re-sign-in (different account, same device), the row still maps to
  the wrong user until next FCM token rotation.

**The pattern that worked** (in `NavGraph.kt`):

```kotlin
LaunchedEffect(isSignedIn) {
    if (isSignedIn) {
        pushRegistration.start(scope = this, locale, appBuild)
        awaitCancellation()  // hold the scope alive
    } else {
        pushRegistration.stop()
    }
}
```

When `isSignedIn` flips:
- True → `start()` launches the token fetch + observer in this coroutine
  scope, then `awaitCancellation()` keeps the scope alive so the observer
  flow stays subscribed.
- False → previous coroutine cancels (kills the observer), this branch
  fires `stop()` which DELETEs the device-token row.

Plus: the `POST /me/devices` route handler does
`prisma.deviceToken.deleteMany({ where: { token, NOT: { userId } } })`
before upserting — so even if `stop()` 401s mid-logout (Clerk session
already cleared), the next user's sign-in re-binds the token cleanly.

### 10. `cfg()` helper for `local.properties` + env var fallback needs `.ifBlank { null }` chained correctly

Travolp's first signing-config attempt:

```kotlin
val v = localProperties.getProperty(key) ?: System.getenv(key)
```

Looks fine. Bug: `local.properties` with `KEY=` (empty value) makes
`getProperty(key)` return `""` (non-null). The Elvis short-circuits; env
var fallback never runs. Result: empty string in props silently shadows
the CI-provided env var.

**The fix that worked:**

```kotlin
fun cfg(key: String): String? =
    localProperties.getProperty(key)?.ifBlank { null }
        ?: System.getenv(key)?.ifBlank { null }
```

Empty strings on either side fall through. Used uniformly for keystore
password, alias, key path. Same pattern applies to ANY config that has
both a local-dev and CI source — Mapbox tokens, Clerk keys, etc. Worth
making it a project-wide convention.

### 11. Release signingConfigs: fail loudly when missing, never silently fall back to debug

Travolp's signing wireup originally had a fallback path: if release creds
weren't set, sign with the debug keystore. **Wrong.** Play Console
rejects debug-signed APKs with "package not signed correctly", but the
gradle build itself succeeds and produces an artifact — so the failure
surfaces at upload time, hours later, with no useful local diagnostic.

**The pattern:** make `signingConfigs.release` conditional on
`hasReleaseSigning` (all four creds present). When false, the release
buildType skips `signingConfig =` assignment entirely. AGP then produces
an `*-unsigned.apk` which can't be uploaded — but the build itself fails
with a clear "no signing config" message. Louder failure earlier.

### 12. App Links + assetlinks.json: serve per-host, document the Play App Signing caveat

Travolp shipped AASA (iOS Universal Links) before assetlinks.json
(Android App Links). Result: `autoVerify="true"` in the manifest failed
silently — Android's verifier requires `/.well-known/assetlinks.json`
served at every host listed in an autoVerify intent-filter. Without it,
verification fails and `https://` links open in Chrome instead of the
app.

**The pattern that worked:** mirror the AASA route. New
`web/src/app/.well-known/assetlinks.json/route.ts` returns
`[{ relation: ["delegate_permission/common.handle_all_urls"], target: { namespace: "android_app", package_name, sha256_cert_fingerprints: [...] } }]`,
branched on `Host` header. One row per tenant.

**Critical caveat baked into the route's docstring:** if the app is
published via Google Play with App Signing enabled (default for new apps
since 2021), Google re-signs the APK with their key during distribution.
The SHA-256 in assetlinks.json must then be Google Play's signing
certificate, NOT your local upload key. Fetch from Play Console → Setup
→ App integrity → App signing → SHA-256. Until first Play release, the
local upload key works; after, it must be swapped or every Play install
fails App Link verification.

### 13. FCM unified push: APNs proxied through Firebase = one credential, not two

iOS push could be wired direct-to-APNs (server holds an APNs JWT signing
key, calls Apple's HTTP/2 push API directly). Or Firebase proxies the
APNs send: server uploads the APNs `.p8` once to Firebase Console,
firebase-admin's `getMessaging().send({ token, apns: {...} })` handles
the rest.

Travolp went with the proxy. Reasons:
- One service-account JSON (`FCM_SERVICE_ACCOUNT_JSON`) covers Android
  AND iOS sends.
- Firebase rotates the APNs JWT for us — no 1-hour-token-refresh code.
- Same `getMessaging().send(...)` call, just `apns: {...}` vs `android: {...}`
  in the payload.

The `apns.payload.aps.interruption-level` field controls iOS Focus
breakthrough (`time-sensitive` for mentions, `active` for normal
messages); the matching Android side is `android.priority: "high" |
"normal"`. Both come from a single `priority: "normal" | "high"` flag in
the server's `SendPushInput` type.

### 14. Notification fan-out coalescing for high-frequency events

Itinerary edits happen in bursts: user adds a stop, drags it, edits the
note, adds another. Naively notifying every collaborator on every edit
floods the inbox + spams push. Travolp's fan-out lib does:

```typescript
// 5-minute window per (user, trip)
const recent = await prisma.notification.findFirst({
  where: { userId, type: "itinerary_change", tripId, readAt: null,
           createdAt: { gt: new Date(Date.now() - 5 * 60_000) } },
});
if (recent) {
  // Update payload.summaries[], bump createdAt, no new push
} else {
  // Insert + push
}
```

Plus per-recipient email suppression for 1h after first send. Push
notifications themselves still fire (FCM dedupes by `messageId` on the
client) but the durable Notification rows coalesce, so the inbox stays
readable during a planning session.

**General pattern for Triplane:** when a notification type can fire
faster than 1/min in normal use, bake coalescing into the fan-out
function (not per-call). Categories that *don't* benefit:
chat-message-per-message (each message is intentional and expected),
membership events (rare, individually meaningful).

### 15. Inbox unification: invites + notifications in one endpoint

Pre-notifications, `/api/v1/me/inbox` returned only pending invites
(trip + tenant). Adding notifications as a separate endpoint and a
separate UI fetch would have meant: two list components, two unread
badges, two refresh strategies. Travolp extended the existing endpoint
to return `{ tripInvites[], tenantInvites[], notifications[],
unreadCount }` in one shot. Mobile + web inboxes render a unified feed.

**General pattern:** when adding a new "inbox-like" surface, extend the
existing inbox endpoint instead of forking. The cardinality stays at one
fetch per inbox open, the unread-count badge remains a single source of
truth, and renaming is a one-line migration if categories diverge later.

---

## Push part 2 — iOS FCM, foreground UX, debug tooling (Travolp 2026-05-10)

Section 12 got the pipeline wired end-to-end on Android. A second push session
exposed a new layer of bugs that only show up once a real iOS device tries to
register, and once you're staring at "no notification arrived" without enough
diagnostic surface to know why. Lessons that map back to Triplane:

### 1. Raw APNs hex is NOT an FCM token — never ship it to FCM

Travolp's iOS `AppDelegate.didRegisterForRemoteNotificationsWithDeviceToken`
took the 32-byte APNs token, hex-encoded it (64 chars), and shipped that to
the Kotlin bridge as the "device token." The server stored it. Every
`messaging.send({ token })` call then 400'd with `INVALID_ARGUMENT` —
Firebase's Admin SDK only accepts FCM **registration tokens** (long
base64-style strings issued by Firebase iOS SDK), not raw APNs hex. The
symptom: registration looks healthy server-side ("Registered" in the
diagnostic UI), every push silently fails, no log line obviously says
"wrong token format."

The fix is structural: link `FirebaseMessaging` SPM, set
`Messaging.messaging().apnsToken = deviceToken` in
`didRegisterForRemoteNotificationsWithDeviceToken`, and wait for
`messaging(_:didReceiveRegistrationToken:)` to deliver the FCM token —
*that's* what gets shipped to Kotlin / the server.

**The rule for Triplane:** iOS push uses `FirebaseMessaging`, not the raw
APNs path, even when it feels like "just one more dependency." Bake the
SPM dependency + bridge code into the template from day 1. Add a
**server-side validation that rejects 64-char lowercase hex from
`platform=ios`** — it's a clear "FirebaseMessaging not linked" tripwire
and produces a diagnostic 400 instead of a token row that quietly
poisons every push.

### 2. APNs priority 5 silently drops foreground alerts

Travolp's `web/src/lib/push.ts` mapped its internal `priority: "normal"`
input to APNs `apns-priority: 5`. Background delivery worked perfectly
— the system tray showed the banner. Foreground delivery silently failed
— `userNotificationCenter(_:willPresent:)` never fired. Took a long
debug loop to figure out: priority 5 is the "deliver opportunistically
for power saving" knob, intended for **silent content-available**
pushes. Apple drops priority-5 *visible alerts* aimed at foregrounded
apps because foreground delivery requires a wake-up that priority 5
doesn't authorize.

The "is this urgent" knob is not `apns-priority`. It's
`interruption-level`: `time-sensitive` (breaks through Focus modes) vs
`active` (default banner). `apns-priority` should always be `10` for
notifications carrying a `notification` block.

**The rule for Triplane:** for any push with a visible alert payload,
hard-code `apns-priority: 10` and Android `priority: "high"`. Reserve
priority 5 / Android `"normal"` for actually-silent content-available
pushes (and document them as such). Never let "priority" in the public
API of your push helper map onto APNs priority — wire it to
`interruption-level` instead.

### 3. iOS foreground UX wants an in-app dialog, not the system banner

Even with priority 10, the iOS system banner that appears during
`willPresent` is jarring when the user is *actively in the app* — it
overlays the screen they're looking at and adds two layers of UI for
the same event. Travolp's solution: a Kotlin
`MutableSharedFlow<ForegroundNotification>` event bus in `commonMain`
plus a `ForegroundNotificationHost` composable mounted at NavGraph
root. iOS `willPresent` and Android `onMessageReceived` both emit to
the bus instead of rendering platform notifications when the app is
foregrounded; the host renders an `AlertDialog` with title/body +
"Open" (deep-link) and "Dismiss" buttons.

Mark-as-read happens on dialog *display*, not on dismissal — the
dialog itself is the "user has seen this" signal. Tying mark-read to
button presses meant a user who swipes the dialog away kept the
notification unread in the inbox forever.

**The rule for Triplane:** ship a `ForegroundNotificationHost`-style
component as a default. Platform handlers detect foreground state
(iOS: `willPresent` only fires when foreground; Android: check
`ProcessLifecycleOwner.get().lifecycle.currentState`) and route to
the bus instead of the system tray. The system tray stays the
exclusive renderer for backgrounded delivery.

### 4. iOS detects foreground via `willPresent`; Android needs `ProcessLifecycleOwner`

iOS makes the foreground/background split easy: `willPresent` fires
*only* when foregrounded — its existence is the foreground signal. On
Android, `FirebaseMessagingService.onMessageReceived` fires in both
states for messages with combined `notification` + `data` blocks, so
you have to check the lifecycle yourself. `ProcessLifecycleOwner`
(from `androidx.lifecycle:lifecycle-process`) gives this without
plumbing per-Activity callbacks. The constraint already lands in
the dependency tree but isn't an actual dependency — explicit
`implementation(libs.lifecycle.process)` is required.

**The rule for Triplane:** add `lifecycle-process` to the Android
push module from day 1. Don't roll a per-Activity foreground tracker
— `ProcessLifecycleOwner` is already correct, already battle-tested,
and one line.

### 5. `runCatching` in registration code makes failures invisible

Travolp's `PushRegistration.start()` originally wrapped *every* step
in `runCatching`: provider fetch, `register(...)` API call,
`observeRefresh().collect`. The intent was good — push is
best-effort, must never crash the app. The cost: when registration
silently failed, *nothing* surfaced. No log, no UI, no breadcrumb.
Debugging "why has my user no DeviceToken row" required a debugger
attached to a real device.

Fix: same `runCatching` policy (no exceptions bubble) but capture
each step's outcome into a `StateFlow<Status>` (`Idle`,
`FetchingToken`, `NoTokenAvailable(reason)`, `Registering(preview)`,
`Registered(preview, atMs)`, `Failed(preview, message, atMs)`) and
emit a `[push-reg]` log line at every transition. Surface the status
in a Settings → Notifications debug card with the platform, current
status, token preview, and a "Retry register" button.

**The rule for Triplane:** any background pipeline that's deliberately
swallowing errors MUST expose its current state via an observable.
"Best effort" is not the same as "invisible." A debug card you can
ship to QA cuts triage time from hours to seconds.

### 6. Admin diagnostic endpoint > grepping Fly logs

Once iOS + Android both registered tokens, "is the push pipeline
healthy" still required checking three things separately: Fly logs
for `[push]` errors, Postgres for DeviceToken rows, FCM dashboard
for delivery counts. Travolp built a small admin tool —
`/admin/notifications` page backed by `GET /api/v1/admin/test-push`
(self diagnostic) and `POST` (synthetic push to self or a target
userId) — that returns:

```ts
{
  fcmConfigured: boolean,
  devices: [{ platform, tokenPreview, lastSeenAt, appBuild, locale }],
  results?: [{ tokenId, ok, errorCode?, error?, pruned? }]
}
```

The per-token `errorCode` field made every previously-mysterious
failure trivially diagnosable: `messaging/registration-token-not-registered`
→ stale token (auto-pruned), `messaging/invalid-argument` → wrong
token format (the APNs-hex bug from #1), `messaging/mismatched-credential`
→ FCM project ID doesn't match the GoogleService-Info.plist's project ID.

**The rule for Triplane:** ship `/admin/test-push` as a baked-in
endpoint of the admin module. It's <200 lines of code, gated on
`admin:manage_config`, and pays for itself the first time someone
asks "why isn't my notification arriving."

### 7. `FCM_SERVICE_ACCOUNT_JSON` escape pitfalls — base64 is the safe answer

The Firebase service-account JSON contains a `private_key` field with
literal `\n` newlines inside a quoted JSON string. Setting that as a
shell env var is a minefield: bash `"..."` expands `$` and `\` chars,
killing the key; `'...'` works on macOS/Linux but PowerShell rules are
different; pasting into Fly's web UI vs `fly secrets set` vs CI vars
each have their own escape semantics. Travolp shipped four parsing
bugs in two months — three of them resolved to the *same* escape
mistake re-introduced from a different shell.

The fix that ended the cycle: parse the env var with auto-detection.
If `raw.trim().startsWith("{")` → treat as JSON. Otherwise → treat
as base64, decode, then parse JSON. Plus a `private_key` fix-up:
if the field contains literal `\\n` and no real newlines, run
`replace(/\\n/g, "\n")`. Plus required-field validation
(`project_id`, `client_email`, `private_key` w/ PEM header) so a
mangled value yields `[push] FCM_SERVICE_ACCOUNT_JSON: private_key
has no PEM header` instead of a downstream FCM stack trace.

The recommended secret-set incantation is base64:

```bash
fly secrets set FCM_SERVICE_ACCOUNT_JSON="$(base64 < firebase-key.json | tr -d '\n')"
```

— no shell escape can break this.

**The rule for Triplane:** parsers for service-account-style env
secrets accept either raw JSON or base64. Document the base64 path
as the recommended one. Validate field shape on parse and log a
specific error per failure mode.

### 8. `senderId` in chat APIs leaks Clerk user IDs to thread members

Travolp's chat list / SSE / POST responses returned
`senderId: m.senderId` to every thread member. `User.id` in the
schema is the Clerk user ID — exposing it to other users in the
same thread leaks a stable cross-system identifier that can be
used to look users up in Clerk dashboards, correlate across
external systems, etc. The mobile client only used `senderId` to
compute `mine = senderId === currentUserId` for "is this my
message" highlighting.

Fix: replace the wire field with server-computed `mine: boolean`
(`mine: m.senderId === userId`). Drop `senderId` from the message
list, POST response, and SSE stream. Mobile DTO/domain model
follows; the `currentUserId` parameter that needed to be
threaded through Compose disappears.

**The rule for Triplane:** if the only client use of an internal
identifier is "is this me?", compute the boolean server-side.
Never expose stable user IDs (Clerk, auth0, anything similar) in
multi-user response payloads. The same logic applies to anything
with a "from" field — emails, chat, comments, reactions.

### 9. `notifyChatMessage(...).catch(...)` races the response close

Fan-out for chat notifications was structured as fire-and-forget:
`notifyChatMessage({...}).catch((err) => console.warn(...))` right
before `return ok(...)`. On Fly's runtime the worker can
return-and-move-on before the chained Prisma + FCM calls complete;
errors disappear into the void. Symptoms: "sometimes notifications
work, sometimes they don't, no logs."

Fix: wrap with `after()` from `next/server` (Next 15+):

```ts
import { after } from "next/server";
// ...
after(async () => {
  try { await notifyChatMessage({...}); }
  catch (err) { console.warn("[chat] fan-out failed", err); }
});
return ok({...});
```

`after()` registers a callback Next will await before tearing
down the worker — survives response commit, preserves error
visibility.

**The rule for Triplane:** every fire-and-forget call in a
serverless / long-running-but-killable runtime uses `after()`.
Bare `.catch()` on an unawaited promise is an anti-pattern in
Next.js App Router, regardless of how the host is provisioned.

### 10. `project.pbxproj` is hand-editable for SPM products when Xcode UI fights you

When Travolp's Firebase iOS SDK SPM remote ref was already in
`project.pbxproj` but no products were linked (an artifact of an
incomplete prior session), the user couldn't add `FirebaseMessaging`
via Xcode UI without the full "File → Add Package Dependencies"
dance. Direct `project.pbxproj` editing turned out to be safer
than expected for this specific case:

- Add an `XCSwiftPackageProductDependency` block with a fresh 24-char
  ID, pointing `package =` at the existing remote-ref ID and setting
  `productName = FirebaseMessaging`.
- Add a matching `PBXBuildFile` entry: `{isa = PBXBuildFile;
  productRef = <product-dep-id>; }`.
- Reference that build file in the `Frameworks` build phase's `files
  = (...)` list.

Three edits, no UUID regeneration risks, `xcodebuild
-resolvePackageDependencies` resolves cleanly, and BUILD SUCCEEDED on
the first try.

**The rule for Triplane:** when an SPM dependency is "almost wired"
(remote ref exists, product not linked) and Xcode UI is fighting you,
edit `project.pbxproj` directly with the three additions above.
Generate IDs by incrementing the last hex of an existing ID in the
same family (e.g. `F6F1F37B...` → `F6F1F37C...`). Build to verify.

### 11. iOS Clerk JWT cache freshness vs runBlocking

Travolp's iOS `ClerkAuthTokenProvider` reads the JWT synchronously
from `NSUserDefaults` (the architecture comment explicitly avoids
`runBlocking { Clerk.shared.auth.getToken() }` because main-thread
deadlock against `Task { @MainActor }` is real). The Swift bridge
warms the cache via a 30s background loop + Clerk's `tokenRefreshed`
event. Symptom in the wild: API calls 401 with
`session-token-expired-refresh-non-eligible-no-refresh-cookie`
when the cache lapses past the JWT's 60s lifetime — typical when
the user has been idle in the app for a minute and then triggers a
mutation.

Mitigations (none silver-bullet; pick the trade-off):

- Tighten the refresh loop (10s instead of 30s) — bandwidth cost,
  reduces the staleness window.
- Use Ktor's `Auth(Bearer)` plugin with `loadTokens` /
  `refreshTokens` callbacks (suspend, no `runBlocking` needed) —
  401 → automatic refresh + retry. Right architecture, larger
  refactor.
- Parse the JWT `exp` claim before each request and force a
  refresh when within ~10s of expiry — small, surgical, no plugin
  swap.

Travolp shipped #1 short-term and tracked #2 as a follow-up.

**The rule for Triplane:** for any platform that ships short-lived
JWTs through a sync token cache, build in Ktor's `Auth(Bearer)`
plugin from day 1. The "we'll just refresh in the background" model
*always* races foreground requests once the token TTL drops below
the loop interval, and refactoring later is more work than getting
it right at scaffolding time.

---

## CI/CD pipeline lessons (Travolp 2026-05-11)

Travolp ran for months on hand-typed `fly deploy` and a manual `bun run
build-tenant.ts <slug> --release` to ship mobile builds. The day we wired up
GitHub Actions for the full pipeline (web auto-deploy + PR previews + Play
Internal + TestFlight) surfaced a stack of gotchas you don't see until you
try to take the human out of the loop. Each one cost time once. Triplane
should arrive with them already absorbed.

### 1. `fly deploy` without build-args silently produces a broken image

Next.js inlines `NEXT_PUBLIC_*` env vars into the client bundle at *build*
time. Travolp's `deploy.sh` parses `--env-file`, sources the file, then
forwards the six `NEXT_PUBLIC_*` vars as `fly deploy --build-arg
NAME=VALUE`. Bare `fly deploy` from a clean shell skips that step — the
image still builds and starts, but the bundle ships with undefined values
for the Mapbox token, Google Maps key, Clerk publishable key, and so on.
The maps appear blank, Clerk fails to mount, and nothing in the Fly logs
points at the cause because the server-side code reads those same vars
from `process.env` and *does* see them at runtime — it's only the
client-side bundle that's broken.

The trap is that `[env]` in `fly.toml` looks like the obvious place to
put `NEXT_PUBLIC_*` — but those values would be committed to git, which
is wrong for tokens. So `fly.toml` correctly omits them, and the deploy
script has to make up the gap.

**The rule for Triplane:** any Fly deploy must go through a script that
materializes build-args from an env file, with both local devs and CI
calling the same script. The CI workflow should not reinvent the
build-arg plumbing in YAML — drift between local and CI is how this
class of bug ships. The script should validate that every required
`NEXT_PUBLIC_*` is non-empty and fail loud if not — silent missing
values is the worst failure mode.

### 2. Don't sync runtime secrets to GitHub Actions

Fly already holds runtime secrets (`DATABASE_URL`, `CLERK_SECRET_KEY`,
`ANTHROPIC_API_KEY`, `AWS_*`, etc.) and injects them at container start.
GitHub Actions only needs `FLY_API_TOKEN` and the build-time
`NEXT_PUBLIC_*` vars. Putting the runtime ones in GH too creates a
two-place sync problem: rotate `CLERK_SECRET_KEY` once, you have to
remember to rotate it on both sides, and one will drift. It also
widens the secret surface — GitHub Actions logs, fork PRs (if not
configured carefully), and the deploy job's environment all become
exposure vectors for secrets that didn't need to be there.

**The rule for Triplane:** the GH→Fly secret boundary is "GH owns build
args, Fly owns runtime secrets." Codify this in CLAUDE.md and the
deploy workflow's header comment so the next person setting up CI
doesn't blanket-mirror `.env.prod` into GitHub secrets out of habit.

### 3. PR previews: one shared app, not app-per-PR — but it needs its own DB

Per-PR Fly apps (`travolp-pr-123`) sound clean in theory but cost more,
churn more, and need cleanup hooks. A single shared `travolp-preview`
app that PRs overwrite in last-write-wins is simpler and fine for a
single-reviewer flow. The hidden trap: if you don't think about it,
`fly secrets import` ends up copying the prod `DATABASE_URL` into the
preview app. Now a PR that runs a destructive migration, or even just
mutates rows during testing, is hitting prod. This is the kind of
incident that's catastrophic and silent — the preview app feels
isolated, but it isn't.

**The rule for Triplane:** when downstreams set up PR previews,
provision a separate Neon branch (or equivalent staging DB) on day one
and document it as a hard prereq in the workflow's header comment.
Better yet: pre-populate the preview workflow with a `DATABASE_URL`
check that fails the job if it matches prod.

### 4. CI must bump `versionCode` / `CFBundleVersion`, or the second upload to Play/TestFlight gets rejected

Default Gradle `versionCode = 1` works for one local build, gets you
through the first hand-uploaded AAB, and then breaks on the second CI
run with `Version code 1 has already been used`. Fastlane's default
build number behavior fails the same way on TestFlight. Fix on Android:
have `composeApp/build.gradle.kts` read an `ANDROID_VERSION_CODE` env
var (fall back to 1 locally), and have CI set it to
`$GITHUB_RUN_NUMBER + offset`. An offset matters — pick something like
`+1000` so the CI numbering never collides with whatever hand-uploaded
builds Ops pushed before CI took over. On iOS, fastlane handles it:
`increment_build_number(build_number: latest_testflight_build_number + 1)`
in the Fastfile.

**The rule for Triplane:** pre-wire the `ANDROID_VERSION_CODE` env-var
hook into `composeApp/build.gradle.kts` from day one. Downstreams just
have to set the env in CI — they don't have to remember to add the
gradle hook, which is the kind of bootstrapping step that gets
forgotten until the second deploy fails.

### 5. fastlane match beats manual cert/profile import in GH secrets

The temptation is to base64-encode the iOS signing `.p12` + provisioning
profile, store them in GitHub secrets, decode at job start, and call
xcodebuild. It works for one project, one bundle id, one year. Then
the cert expires, Apple rotates a profile, you add a new tenant bundle
id, or a new dev needs to build locally — and rotation requires editing
five secrets in lockstep, every time. fastlane match maintains an
encrypted git repo of WWDR + signing cert + provisioning profiles.
Adding a new bundle id is one command (`match appstore --app_identifier
com.priorli.<bundle>`); seeding a new dev's keychain is one command;
yearly rotation is one command. The bootstrap (private repo, deploy
key, `MATCH_PASSWORD` secret) feels like extra friction once, but pays
back the first time you need to rotate anything.

**The rule for Triplane:** when downstreams reach the "we need
TestFlight in CI" point, the docs should point straight at match —
not at `.p12` import. Include a `mobile/iosApp/fastlane/` skeleton
(Gemfile pinning fastlane, Matchfile placeholder, Fastfile with a stub
`tenant_release` lane) in the Triplane template so the path is paved.

### 6. macOS runners cost ~20× Linux. Plan the escape hatch from day one

GitHub Actions Linux runners are ~$0.008/min; macOS runners are
~$0.16/min. A 20-minute iOS archive is ~$3.20 per build; multiply by
tenants × push-to-main cadence and a small team hits $50–200/month
without much volume. The web (Linux), Android (Linux), and worker
builds are all basically free; iOS is the entire cost.

Three escape hatches that all reuse the *same Fastfile*: (a)
`runs-on: self-hosted` on a Mac mini you keep on 24/7; (b) trigger iOS
only on `workflow_dispatch` instead of every push-to-main; (c) move
iOS fully local — ops runs `bundle exec fastlane tenant_release
tenant:<slug>` from their Mac after match SSH + ASC API key are set up.
What makes this manageable is that the Fastfile is the load-bearing
artifact — the `runs-on:` line in the workflow is one edit away from
being any of the three modes.

**The rule for Triplane:** the iOS release lane should be Fastfile-first,
not workflow-first. Don't bake iOS-specific build steps (asset staging,
build-number increment, archive, IPA export, TestFlight upload) into
YAML — bake them into the lane. The workflow becomes a thin "checkout,
install ruby, run lane" wrapper, and downstreams can swap GitHub-hosted
macOS for self-hosted, dispatch-only, or fully-local without touching
the lane.

### 7. GitHub Actions expression operators don't include arithmetic

`${{ github.run_number + 1000 }}` looks valid, YAML parses it, the
workflow runs — and the result evaluates to a string like
`"1751000"`-ish or `0` depending on coercion, *not* the integer add
you wanted. GitHub Actions' expression engine supports comparison,
logical, and ternary operators; arithmetic is not in the supported set.
Compute in shell instead:

```yaml
env:
  RUN_NUMBER: ${{ github.run_number }}
run: |
  export ANDROID_VERSION_CODE=$((RUN_NUMBER + 1000))
```

**The rule for Triplane:** any arithmetic on workflow inputs/contexts
must happen in shell with `$(( ))`, never inline in `${{ }}`. Easy
thing to miss because the YAML looks correct and the workflow doesn't
fail — it just silently produces wrong numbers. Travolp shipped this
bug into the first version of `release-android.yml` and only caught it
on review.

### 8. Reuse the local tenant build orchestrator from CI, don't fork its logic into YAML

Travolp's `branding/build-tenant.ts` drives asset generation + the
right gradle task (`assemble<Slug>Release` or `bundle<Slug>Release`)
per tenant. The CI workflow wraps that script rather than
re-implementing flavor-name derivation in YAML. Same principle as
lesson #1: one source of truth, no drift. The moment CI starts
computing the gradle task name from a workflow input, two slightly
different code paths (local devs running `bun run build-tenant.ts` vs.
CI running `./gradlew :composeApp:assemble<Pascal>Release` derived in
YAML) will eventually diverge — a tenant builds locally but breaks in
CI, or vice versa.

**The rule for Triplane:** if there's a script local devs use, CI
should call the *same script*, not parallel logic. Workflows are thin
wrappers around scripts, scripts are the load-bearing artifacts.

---

## Local release orchestrator & ops gotchas (Travolp 2026-05-11)

After landing the GitHub Actions pipeline (section above), we built `release.sh` — a single Mac-side bash orchestrator that does web→Fly + Android→Play+Firebase + iOS→TestFlight+Firebase in one invocation. Two motivations: macOS Actions minutes are expensive, and "production was deployed by Claude in CI on a branch I didn't realise was main" is a class of mistake we wanted off the table. The pipeline came together fast; the eight gotchas below cost most of the time. See **[CICD.md](./CICD.md)** in the Triplane root for the step-by-step setup walkthrough that bakes these lessons in.

### 1. App Store Connect API key JSON must escape its own newlines

`fastlane match --api_key_path <file>` reads a JSON file whose `"key"` field is the *string contents* of your `.p8`. The `.p8` file is multi-line PEM. JSON doesn't allow raw newlines inside a string value — they have to be `\n` escapes. A natural-looking heredoc:

```bash
cat > asc-api-key.json <<EOF
{
  "key_id": "$KID",
  "issuer_id": "$ISS",
  "key": "$(awk '{printf "%s\\n", $0}' AuthKey_$KID.p8)",
  "in_house": false
}
EOF
```

…produces a file that *looks* right when you `cat` it but contains real `0x0A` bytes inside the key string. `fastlane match` fails with a cryptic JSON parser error. The escape gymnastics through bash → awk → JSON have too many layers to get right by hand. The bulletproof builder is one line of `jq` with `--rawfile`:

```bash
jq -n --arg key_id "$KID" --arg issuer_id "$ISS" --rawfile key "AuthKey_$KID.p8" \
  '{key_id: $key_id, issuer_id: $issuer_id, key: $key, in_house: false}' > asc-api-key.json
```

`--rawfile` reads the file content verbatim; `jq` emits it as a JSON-safe string with `\n` escapes. No shell escaping, no awk, no failure modes.

**The rule for Triplane:** any setup doc that has the reader build a JSON file from another file's contents must use `jq --rawfile` (or `--slurpfile`). Never hand-roll escape sequences across bash + tool layers. Save a one-liner snippet in CICD.md so nobody re-discovers this.

### 2. App-specific passwords don't authenticate to Apple Developer Portal

When `fastlane match appstore` prompts for Apple Developer credentials, the natural reflex is to grab an app-specific password from `appleid.apple.com`. It gets rejected with "your password is wrong" and there's no hint why. Apple's two-tier auth model:

- **App Store Connect** (TestFlight, Pilot, Deliver) accepts app-specific passwords.
- **Apple Developer Portal** (certs, profiles, app IDs — match's territory) does **not**. It only accepts:
  - Real Apple ID + the 2FA code sent to a trusted device, or
  - A `FASTLANE_SESSION` cookie produced by `fastlane spaceauth` (30-day TTL), or
  - The App Store Connect API key (the one true path for automation).

Once you understand which APIs accept which auth, the error is obvious. While debugging, it just looks like "my password is wrong, why."

**The rule for Triplane:** the CICD walkthrough should point at the ASC API key path *first* and only mention Apple ID auth as a fallback. Don't let a reader spend 20 minutes generating an app-specific password that fastlane will reject.

### 3. Google Play Console's "API access" page is gone

Every fastlane tutorial older than ~2025 says: *"Play Console → Setup → API access → grant your service account permissions."* That page no longer exists. Google moved the flow into the regular **Users and permissions** UI: invite the service account's `client_email` like any other user, then on the "App permissions" tab tick "Manage testing tracks" + "Release apps to testing tracks" for the apps it should publish to. The legacy URL redirects to the apps list with no breadcrumb explaining the move.

The symptom when you skip the invite: `upload_to_play_store` returns `Google Api Error: Invalid request - The caller does not have permission`. The error doesn't name the missing permission, the SA, or the page.

**The rule for Triplane:** any Play Console setup doc must say "Users and permissions" (not "API access") and link to <https://developers.google.com/android-publisher/getting_started> as the authoritative source. The move is recent enough that LLMs trained before May 2026 will still suggest the old path.

### 4. First-time Play API uploads still require one manual UI upload

The Play API refuses uploads for a package name that has never had a release published in the console — even a draft. The "caller does not have permission" error is generic enough to hide this: you'll keep verifying the SA permissions when the real problem is "Play has never seen this app."

**The rule for Triplane:** CICD.md has a checkbox "manually upload the first AAB through the Play Console UI" *before* the "wire up CI" step. It's a one-time five-minute ceremony per tenant bundle id. Skipping it costs an hour of "is the SA actually allowed."

### 5. Signing-path drift silently produces unsigned artifacts

Travolp reads keystore credentials from two places: `mobile/local.properties` (for IDE/Android Studio) and the env (for CI / `release.sh`). The gradle helper short-circuits on the first non-blank value:

```kotlin
fun cfg(key: String): String? =
    localProperties.getProperty(key)?.ifBlank { null }
        ?: System.getenv(key)?.ifBlank { null }
```

If `local.properties` has a stale `RELEASE_KEYSTORE_PATH=/old/path/that/doesnt/exist.jks` and `.env.release` has the correct path, `local.properties` wins, `file(releaseStorePath).exists()` returns false, `hasReleaseSigning = false`, and the release build proceeds **unsigned**. The output file is helpfully named `composeApp-travolp-release-unsigned.apk` — that suffix is your only clue. Play rejects it with `All uploaded bundles must be signed. Please sign the bundle using jarsigner.`, but only after the gradle build, the gradle artifact discovery, and the Play API upload have all succeeded — which makes the "where did this go wrong" pretty long.

Two complementary fixes: (a) `build.gradle.kts` should `error()` (not silently downgrade) when a release task is requested without complete signing config — louder failure earlier; (b) `.env.release` and `local.properties` should both point at the same canonical keystore path, ideally something the `branding/` tooling can resolve so they can't drift.

**The rule for Triplane:** the keystore should live at a single canonical path (Travolp picked `mobile/keys/key.jks`) referenced consistently from `local.properties`, `.env.release`, and the gradle fallback in `build.gradle.kts`. A pre-release check in `release.sh` should `test -s "$RELEASE_KEYSTORE_PATH"` before invoking gradle and abort with a clear message if the file is missing. The build script should also fail fast when a `Release` task runs with `hasReleaseSigning=false` — not produce a `-unsigned` artifact and call it success.

### 6. fastlane platform routing matters

The natural place to add `lane :android_release` is wherever `lane :tenant_release` lives. If that's inside `platform :ios do ... end`, fastlane prints a warning at parse time (`Action 'upload_to_play_store' isn't known to support operating system 'ios'`) but runs the lane anyway. The first sign of trouble comes from `release.sh` calling `bundle exec fastlane android_release`: with `default_platform(:ios)` set, fastlane resolves the bare lane name as `ios android_release` — and once you fix the lane's location to `platform :android do ... end`, fastlane can't find `ios android_release` and dies with `Could not find lane 'ios android_release'. Available lanes: ios tenant_release, android android_release`.

The fix is to invoke with the platform: `bundle exec fastlane android android_release tenant:travolp track:internal`. But the failure mode walks the reader through both the platform-mismatch warning *and* the lane-not-found error, neither of which spells out the rule.

**The rule for Triplane:** the Fastfile skeleton in Triplane should have two `platform` blocks (`platform :ios do` and `platform :android do`) from day one, even if they're empty. Every invocation in `release.sh` (and in docs) must spell out the platform: `fastlane <platform> <lane>`. Treat `default_platform(:ios)` as a footgun and just always be explicit.

### 7. fastlane plugins need Pluginfile + eval_gemfile, not just Gemfile

Adding a fastlane plugin gem to `mobile/iosApp/Gemfile` doesn't make it loadable. Fastlane discovers plugins through `mobile/iosApp/fastlane/Pluginfile`, which the `Gemfile` must `eval_gemfile` for the bundler resolver to see them. The canonical way to add a plugin is `bundle exec fastlane add_plugin <name>`, which sets all three up correctly. If you hand-edit the `Gemfile` (because you're scripting first-run bootstrap and want it idempotent), you must:

1. Append the gem to `Gemfile`.
2. Append the gem to `fastlane/Pluginfile`.
3. Have `Gemfile` `eval_gemfile("fastlane/Pluginfile")`.

Skip any of these and fastlane fails to find the plugin's actions at lane time.

**The rule for Triplane:** the `mobile/iosApp/` skeleton should already include `Gemfile` + `fastlane/Pluginfile` with the `eval_gemfile` line in place, even if Pluginfile is empty. Then downstream additions are one-liners that don't have to remember the three-file ceremony.

### 8. Firebase App Distribution: upload can succeed while the lane fails — distribute-step is separate

`firebase_app_distribution` does three things in sequence: upload binary → set release notes → distribute to groups. Each step talks to the API separately, and the *distribute* step is the one that's load-bearing on Firebase Console state that doesn't exist yet on a fresh project. The classic symptom is: the build *does* show up in the App Distribution dashboard, but fastlane crashes 90 seconds in with `Invalid request` — because the upload worked, then the distribute call referenced a group alias that doesn't exist on that platform's app, and the API returns a generic `Invalid request` for the whole call. Two corollaries:

- The `groups` parameter must be optional, not hardcoded. Hardcoding a group name in the lane couples the lane to dashboard state. Read it from `FIREBASE_TESTER_GROUPS` env, skip the param if empty — upload still happens, group distribution becomes opt-in.
- Each *platform* app needs to be onboarded to App Distribution independently. Clicking "Get started" on the Android tile in App Distribution doesn't onboard the iOS tile, and vice versa. The first iOS distribution on a project that's been doing Android for months will fail until someone goes to App Distribution → iOS app → Get started.

The lesson generalizes beyond Firebase: any time a CI step talks to a SaaS API on behalf of a dashboard-managed resource (testers, signing groups, deploy targets, release channels), the lane must degrade gracefully when the dashboard-side resource is missing. Hardcoded references to dashboard names are CI-fragility waiting to happen.

### 9. Mobile-side `.env.release` (not repo-root) is the right home

The first instinct is `/.env.release` at the repo root. That gives parity with `deploy.sh` reading `web/.env.prod`, but mixes a *platform-specific* secrets bag with the top-level repo namespace, and the security tradeoff is invisible: a casual `cat .env.release` from the wrong directory reveals it. The mobile-side equivalent `mobile/keys/.env.release` (next to the keystore and `.p8` files) wins on three axes: parallel structure (`web/.env.prod` ↔ `mobile/keys/.env.release`); colocation with the keys it references (one directory to back up, one directory to chmod 700); and clear platform/web split (`release.sh --web` doesn't need this file at all).

The same principle applies to the keystore (`mobile/keys/key.jks`) and the ASC `.p8` (`mobile/keys/AuthKey_*.p8`): one canonical `mobile/keys/` directory holding everything that ships an app.

**The rule for Triplane:** the template should ship with `mobile/keys/.gitignore` (ignoring everything in that directory) and a `mobile/keys/.env.release.example` checked in. Downstream devs copy the example to `.env.release` and fill it in — the location is decided once and never debated.

---

## Live location & cross-platform notification surface (Travolp 2026-05-11)

Adding "live-location sharing with a rich, persistent, cross-platform notification" to Travolp surfaced a long list of patterns that generalize. Triplane doesn't ship a live-location feature (no Trip/Day/Stop entities), but **any** future feature that combines (a) a long-running mobile background task and (b) a notification surface that has to look the same on Android and iOS will run into the same problems we did. This section is the playbook.

The Travolp source-of-truth for the implementation details is `specs/features/live-location.md` in that repo; this section is the *why* and the *patterns*, distilled.

### 1. Foreground service is the right primitive for live location — `WorkManager` is not

Live-location sharing means a 30-second-cadence GPS stream while the app is backgrounded. The instinct (especially from Claude in fresh sessions) is to reach for `WorkManager`. **It's the wrong tool.** Minimum periodic interval is 15 minutes; expedited workers are best-effort 10s windows; Doze mode delays everything. WorkManager is for *deferred* work the OS can defer to charging/Wi-Fi windows.

The right tool is a `Service` with `startForeground(notification, FOREGROUND_SERVICE_TYPE_LOCATION)` + `FusedLocationProviderClient.requestLocationUpdates`. Google Maps, Strava, Find My Friends use exactly this. The persistent notification is non-negotiable on Android 10+ (it's the user-visible affordance that justifies the FGS), and that turns out to be a *feature*, not a tax — the notification becomes the live-context surface.

iOS equivalent: `CLLocationManager` with `allowsBackgroundLocationUpdates = true` + `pausesLocationUpdatesAutomatically = false` + Info.plist `UIBackgroundModes = location`. iOS has no FGS notion; the OS keeps the app alive instead of killing it. There's a corresponding affordance: the blue status-bar pill that the OS shows automatically.

**Triplane rule:** When you see "do thing X every N seconds while the user is away", reach for FGS (Android) + background-location-modes (iOS), not WorkManager / BGAppRefreshTask. WorkManager is for *deferred* idempotent work, not streams.

### 2. The persistent notification has to survive process kill — three layers

`onStartCommand` returning `START_STICKY` looks correct but isn't, because the OS restarts the service with a **null** intent on kill. Whatever you put in `intent.getStringExtra(...)` is gone, and your service's `null`-intent branch hits `stopSelf()` and dies again immediately. Three things have to combine:

1. Return `START_REDELIVER_INTENT` instead — the OS re-fires the original Intent with extras intact on memory-pressure kills.
2. **Belt-and-suspenders:** persist the active "thing-id" in `SharedPreferences` on `onStartCommand`. When `intent` is null on restart (some kill paths skip redelivery despite `START_REDELIVER_INTENT` — ANR-killed services, Android 12+ FGS background-launch restrictions), recover from disk.
3. **Cold-start re-arm in MainActivity:** when the *whole process* gets killed (user swipes from recents, force-stop), the service is gone too. `MainActivity.onCreate` reads the persisted active-id and calls `Service.startForX(...)` again if location permission is still granted. If permission was revoked while the app was dead, clear the persisted id so we don't re-attempt every cold start.

This three-layer recovery is required for "the user expects sharing to keep going". One layer alone is insufficient — the kill paths combine in surprising ways.

### 3. Per-vendor `BatterySaverGuide` — code can't fix OEM kills, only user education can

Xiaomi, Huawei, Honor, Oppo, OnePlus, Vivo, Realme, Samsung, Asus, and Meizu aggressively kill foreground services regardless of correct code. There is **no Android API** that prevents this. The only mitigation is teaching the user to add the app to the vendor's "auto-start" or "battery whitelist" list.

Pattern: a `BatterySaverGuide` class with `Build.MANUFACTURER`-based detection and per-vendor `ComponentName` intents that try to launch the auto-start activity directly (e.g. `com.miui.securitycenter/com.miui.permcenter.autostart.AutoStartManagementActivity` for Xiaomi). Fallback to the generic `Settings.ACTION_APPLICATION_DETAILS_SETTINGS` so the user always lands somewhere actionable. `dontkillmyapp.com/<slug>` URLs are good help-page references.

Trigger the dialog *once* on the first successful "do the long-running thing" toggle, gated by a `Settings.getBoolean("oem_hint_shown")` flag. Do not nag; the dialog is a one-shot.

iOS equivalent: empty stub. Apple has nothing comparable.

### 4. The `LiveNotificationContent` builder pattern — pure render + injected strings

When the persistent notification carries dynamic content (current state, ETAs, member positions), the natural temptation is to build the `NotificationCompat.Builder` directly inside the `Service`. Don't. Two problems:
1. The builder logic is impossible to unit-test if it's tangled with platform notification APIs.
2. iOS needs the same content but uses `UNUserNotificationCenter` — duplication is awful.

Pattern: split into three pieces.

```
LiveNotificationContent (data class)        ← what to render
  ↑
LiveNotificationContentBuilder (pure)       ← how to render it
  ↑ takes
LiveNotificationStrings (data class)        ← localized template strings
  ↑ produced by
LiveNotificationStringsProvider (interface) ← injected via Koin; impl in composeApp
```

The builder lives in `commonMain`. It takes domain inputs plus a `LiveNotificationStrings` and returns a `LiveNotificationContent` (title, body, "big text", side-effects-to-fire). Both Android FGS and iOS `LocationSharingService.ios.kt` call the *same* builder.

The strings are templates with `{name}` placeholders, substituted by a tiny KMP-friendly `String.fmt(vararg pairs)` helper:

```kotlin
internal fun String.fmt(vararg args: Pair<String, Any>): String {
    var out = this
    for ((k, v) in args) out = out.replace("{$k}", v.toString())
    return out
}
```

Why `{name}` and not Java's `%1$s`? Because Kotlin Multiplatform doesn't have `String.format` on every target. `{name}`-style templates work everywhere.

### 5. Compose Resources lookup from non-Composable code: the provider lives in `composeApp`

Compose Resources (`getString(Res.string.x)`) is configured per-module. In Travolp the strings.xml files live in `composeApp/src/commonMain/composeResources/values{,-de,-ja,-sv,-vi}/`. The shared module *cannot* see those resources directly — composeApp depends on shared, not the other way around.

Solution: declare the provider as an `interface` in `shared/commonMain`:

```kotlin
fun interface LiveNotificationStringsProvider {
    suspend fun get(): LiveNotificationStrings
}
```

Implement it in `composeApp/commonMain` (where `getString(Res.string.x)` is reachable), and bind in both Android and iOS `PlatformModule`s. The shared-module FGS injects the interface and calls it once at start (cached) or per-tick (fresh — picks up locale changes).

`getString(...)` is `suspend`. The FGS's `onStartCommand` is not. Use `runBlocking` *exactly once* on first start to load strings; then refreshes are off the cached value. Don't `runBlocking` per-tick.

### 6. expect/actual `LocationPermissionRequester` needs an Activity bridge

Android's runtime permission flow requires an `Activity` (`registerForActivityResult` / `ActivityCompat.requestPermissions`). The shared module has no Activity. Naïve approaches:

- **Wrong:** put the requester in `composeApp` with the rest of the UI. Then the shared service can't call it.
- **Wrong:** use `ContextCompat.checkSelfPermission` only and *never* request. (This is what Travolp's first cut did. The button silently did nothing.)

Right pattern: a process-global singleton `AndroidLocationPermissionBridge` with two suspending lambdas (`requestForeground`, `requestBackground`) and a sync `shouldShowRationale` callback. `MainActivity.onCreate` populates these by registering `ActivityResultLauncher`s and parking a `CompletableDeferred<Boolean>` for each request:

```kotlin
private val foregroundLocationLauncher = registerForActivityResult(
    ActivityResultContracts.RequestMultiplePermissions(),
) { grants ->
    val granted = grants[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
                  grants[Manifest.permission.ACCESS_COARSE_LOCATION] == true
    foregroundLocationDeferred?.complete(granted)
    foregroundLocationDeferred = null
}

AndroidLocationPermissionBridge.install(
    requestForeground = {
        val d = CompletableDeferred<Boolean>()
        foregroundLocationDeferred = d
        foregroundLocationLauncher.launch(arrayOf(/* ... */))
        d.await()
    },
    /* ... */
)
```

The shared `LocationPermissionRequester.android.kt` calls into the bridge. iOS uses a `CLLocationManagerDelegate` that resumes a `CancellableContinuation` — different mechanism, same idea (bridge between callback API and `suspend`).

### 7. Two-step Android 11+ permission flow + permanent-deny detection

`ACCESS_BACKGROUND_LOCATION` is its own runtime permission on Android 11 (Q+). Google requires it to be requested in a **separate prompt** *after* `ACCESS_FINE_LOCATION` is granted. Bundling both in a single `RequestMultiplePermissions` call shows only the foreground prompt; background is silently denied.

Permanent-deny detection: `ActivityCompat.shouldShowRequestPermissionRationale` returns `false` on **both** the very first ask AND after the user picks "Don't ask again". To distinguish, persist an `askedBefore` boolean in SharedPreferences. After a denied request:

- granted → return `Granted`
- !granted && shouldShowRationale → `Denied` (transient, can ask again)
- !granted && !shouldShowRationale && askedBefore → `DeniedPermanently` (route to settings)
- !granted && !shouldShowRationale && !askedBefore → first launch + denied → `Denied`

Then mark `askedBefore = true`.

### 8. `AppSettingsOpener` expect/actual is a one-line tool every project needs

Any feature with a `DeniedPermanently` branch needs to deep-link to the system app-settings page. expect/actual is straightforward — Android: `Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", packageName, null)).addFlags(FLAG_ACTIVITY_NEW_TASK)`; iOS: `UIApplication.sharedApplication.openURL(NSURL(string: UIApplicationOpenSettingsURLString))`. Add it to the platform module on day one — multiple features will need it.

### 9. iOS persistent notification mirrors Android FGS via re-posted local notifications

iOS has no foreground-service-style "ongoing notification" concept. The closest equivalents are Live Activities (iOS 16.1+, requires WidgetKit + ActivityKit setup, separate Xcode target — a heavy lift) and re-posted local notifications via `UNUserNotificationCenter`.

For v1 parity, re-posted local notifications are sufficient: a single `UNNotificationRequest` with a fixed identifier (`live_<feature>_persistent`) re-added on each tick. iOS replaces the existing notification of the same identifier silently (no extra sound) when you set `setSound(nil)` or `interruptionLevel = .passive`. Tap routes to your existing deep-link handler in `AppDelegate.userNotificationCenter(_:didReceive:)`.

User CAN swipe-dismiss the notification. The next tick re-posts it. That's the trade-off for not implementing Live Activities. For a v2, layer in Live Activities for the moving-distance UI; the local-notification fallback is still the right backstop.

### 10. KMP `String.fmt` instead of `String.format`

KMP doesn't have `String.format` on every target (especially iOS native). Don't reach for it. The 5-line `String.fmt(vararg Pair<String, Any>)` extension above avoids the whole class of "this works on Android but crashes the iOS framework" surprises.

Pair this with `{name}`-style placeholders in `strings.xml`. Avoid Android's `%1$s` because it requires `String.format`-style substitution which we just established doesn't exist cross-platform. The Compose Resources `getString(Res.string.x, args...)` *does* support `%1$s`, but if you do your own substitution you don't need that path, and your strings stay platform-agnostic.

### 11. Server-side "event-X-happened" feed: unique constraint on the dedupe key

When the mobile client detects a state change (in our case "user arrived at stop within 50m") and POSTs it, the server has to dedupe — the same event can fire multiple times across ticks. Don't try to dedupe in application code with a "did this exist already?" check (race condition). Use a Postgres unique constraint as the source of truth:

```prisma
model TripArrivalEvent {
  // ...
  @@unique([tripId, userId, stopId, dayDate])
}
```

Cross-day re-arrival fires a fresh row (dayDate differs); same-day re-fire is a unique-violation that the route catches and returns `{ alreadyArrived: true }`. The fan-out (insert Notification rows + send pushes) only runs on first insert.

### 12. Notification fan-out: per-recipient row + push, never a join

Don't try to model "a notification" as one row visible to N users via a join table. Insert N Notification rows, one per recipient. Two reasons:
1. Per-recipient `readAt` timestamps are first-class.
2. Each recipient has independent notification-prefs (push on/off, email on/off, coalesce window). Per-row rendering of preferences is trivial; per-join-table is a nightmare.

Storage cost is tiny (notification rows are small + soft-deleted). Query patterns are simpler. This is what Travolp's `notifyChatMessage`, `notifyMembershipChange`, `notifyArrivalAtStop` all do.

### 13. Network-failure retry queue inside the FGS

Push failures (server 5xx, network down) inside a 30-second tick stream silently drop fixes. For a *live* feature that's mostly fine — the next tick is fresher anyway — but for a "breadcrumb trail" use case it loses data. Pattern: a bounded `ArrayDeque<QueuedFix>` (cap 50, ≈25 minutes at 30s cadence), drain ≤5 per success, hook a `ConnectivityObserver.isOnline` `StateFlow` so the drain also fires on network-back without waiting for the next tick. Cap retries per fix to 3 attempts.

The queue is in-memory only — process death loses it. That's acceptable; cross-process-death replay isn't worth the SQLite migration.

### 14. Per-day persisted "already happened" set, wiped on user-stop

For arrival pings (and similar one-shot-per-stop notifications), the FGS needs to remember which stops it's already pinged so they don't re-fire on the next tick. Persist in SharedPreferences keyed by `<tripId>:<dayId>`, comma-joined stop IDs. On user-initiated `stop()`, wipe every key with the `<tripId>:` prefix so a fresh toggle-on the next day starts clean.

Don't wipe on `onDestroy()` — that fires for both user-stop and OS-kill, and we want the latter to keep the set so re-arm doesn't re-fire pings. Only the explicit user-stop path should wipe.

### 15. Mobile l10n for non-English locales: write real translations or wait for AI loc

The temptation when adding new strings is to copy the English text into the de/ja/sv/vi `strings.xml` files as placeholders. **Don't** if the existing files have actual translations — the mixed result looks broken. Write reasonable translations (or use the AI-localization feature if your project has one) so the locale stays consistent.

Travolp's AI-localization spec explicitly defers mobile UI string AI translation; new mobile strings for the live-location feature were translated by hand with a "translations pending native review" comment. That's the right precedent: ship translations even when imperfect, mark them for review, don't ship English-in-other-locales.

### 16. AppDelegate notification taps: route through the same deep-link mechanism as Universal Links

iOS push notification taps and Universal Link taps should both flow through the same deep-link handler. Travolp's `DeepLinkSupportKt.pushPendingDeepLink(url:)` is the single entry point — Universal Links call it from `.onContinueUserActivity`, custom-scheme URLs call it from `.onOpenURL`, and notification taps call it from `userNotificationCenter(_:didReceive:)`. NavGraph parses and routes whichever URL arrives.

This avoids the "tapping a notification opens the wrong screen because you forgot to update the routing in two places" class of bug. One `routeDeepLink` function, three callers.

### 17. New deep-link routes: register on both custom scheme AND Universal Link branches

When you add a new route (e.g. `app://entity/<id>`), remember to add the parsing arm to *both* the `customScheme://` branch AND the `https://<host>/<locale>/...` branch in `routeDeepLink`. Travolp's NavGraph hits this every time someone adds a route — easy to add the custom scheme and forget the Universal Link, then notifications-tap-routing silently breaks.

### 18. What we explicitly didn't build (and why)

- **Live Activities (iOS 16.1+).** Right answer for v2 if you want a moving "distance" UI on the lock screen / Dynamic Island. v1 doesn't need it; re-posted local notifications cover the same surface for less Xcode complexity.
- **Custom `RemoteViews` notification layouts on Android.** `NotificationCompat.BigTextStyle` covers what's needed for content-rich notifications without dragging in cross-version layout headaches.
- **`BOOT_COMPLETED` receiver to auto-restart sharing after device reboot.** Privacy-surprise UX: users don't expect a tracker to silently re-arm after a reboot. Document the choice; revisit if a customer asks.
- **WorkManager fallback for arrival POSTs that fail offline.** The in-FGS retry queue covers this. WorkManager would just relay the same retry intent.
- **Server-side "Bob arrived at the Louvre" event for users who aren't sharing their own location.** We restrict the recipient set to the location-access role list (owner + collaborators + tenant staff), not just any trip viewer. Avoids leaking location-presence to passive viewers.

---

## Closing

Triplane is the answer to a question we kept asking ourselves: *"if we were starting Travolp today, what would we do differently?"*

Every section above has a one-line answer. Every answer is baked into Triplane.

If you're starting a new Priorli project from this template, the most valuable thing you can do is **read this document once before you start writing code**. You'll save yourself the same lessons.
