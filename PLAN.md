# Triplane — Project Plan

> Priorli's full-stack monorepo template. **This is the template's own plan, not the plan for an app built from it.** When you `gh repo create my-app --template priorli/triplane`, replace this content with your app's plan (the structure stays).

**Status:** All phases 1–7 complete. v0.1 ready to tag. `xcodebuild` builds the iOS app green end-to-end against Clerk iOS SDK 1.0.9 SPM. Interactive simulator sign-in requires a user at the keyboard.
**Last updated:** April 11, 2026
**Node.js required:** ≥ 20.9
**Bun required:** ≥ 1.1

---

## Table of contents

1. [Stack](#stack)
2. [Architecture principles](#architecture-principles)
3. [Project structure](#project-structure)
4. [Environment variables](#environment-variables)
5. [Phased build plan](#phased-build-plan)
6. [Feature matrix](#feature-matrix)
7. [Recent decisions log](#recent-decisions-log)

---

## Stack

| Layer                   | Choice                                                    | Version         |
| ----------------------- | --------------------------------------------------------- | --------------- |
| Web framework           | Next.js (App Router)                                      | 16.2.2          |
| React                   | React                                                     | 19.x (bundled)  |
| Language                | TypeScript                                                | 5.6+            |
| Database                | Neon (serverless Postgres)                                | —               |
| ORM                     | Prisma                                                    | 7.3.0           |
| Auth                    | Clerk                                                     | 7.0.11 (Core 3) |
| Styling                 | Tailwind CSS                                              | 4.1.18          |
| Component library       | shadcn/ui                                                 | latest          |
| Validation              | Zod                                                       | latest          |
| API contract            | OpenAPI 3.1 via zod-to-openapi + Scalar UI                | —               |
| File storage            | Tigris (Fly.io S3-compatible)                             | —               |
| Hosting                 | Docker (deploy to Fly, Railway, Render, VPS)              | —               |
| i18n                    | next-intl                                                 | latest          |
| Mobile framework        | Compose Multiplatform (KMM)                               | 1.10.3          |
| Mobile language         | Kotlin                                                    | 2.3.10          |
| Mobile build            | Android Gradle Plugin / compileSdk                        | 8.9.1 / 36      |
| Mobile auth (Android)   | Clerk Android SDK (clerk-android-api + clerk-android-ui)  | 1.0.11          |
| Mobile auth (iOS)       | Clerk iOS SDK (Phase 7)                                   | TBD             |
| Mobile HTTP             | Ktor                                                      | 3.1.1           |
| Mobile DI               | Koin                                                      | 4.0.4           |
| Mobile serialization    | kotlinx-serialization                                     | 1.7.3           |
| Mobile maps             | swmansion/kmp-maps core                                   | 0.9.1           |
| Mobile image picker     | Peekaboo                                                  | latest          |
| Mobile image loading    | Coil 3                                                    | 3.x             |
| Package manager (web)   | Bun                                                       | ≥ 1.1           |
| Package manager (mobile)| Gradle                                                    | 8.11.1          |

Versions are pinned in `web/package.json` and `mobile/gradle/libs.versions.toml`. Cascading version bumps are managed via the `/upgrade-deps` skill (Phase 5).

---

## Architecture principles

These are the load-bearing rules. Each one came from a real pain point in Travolp. Breaking them costs weeks of rework. See `LESSONS.md` for the rationale behind each.

1. **All API endpoints live under `/api/v1/*`.** Versioned from day one. Mobile clients are pinned to a version. The web app calls its own API the same way mobile does.

2. **Every API route uses Clerk's `auth()` helper.** Same code handles cookies (web) and `Authorization: Bearer <token>` (mobile).

3. **The web app calls its own API routes via `fetch('/api/v1/...')`.** No server actions for data mutations. No direct Prisma access from server components. The API contract is the API contract.

4. **Middleware (`web/src/proxy.ts`) handles CORS + i18n routing.** CORS for `/api/v1/*`, locale rewriting for page routes (`/en-US/items`).

5. **Response shape is always `{ data: T } | { error: { code, message } }`.** Typed helpers in `web/src/lib/api-response.ts`.

6. **Ownership is enforced in every route** via `requireUser()` + `assertOwnership()` helpers. Never trust the client.

7. **All deletes are soft deletes.** Every user-deletable entity has `deletedAt DateTime?`. DELETE endpoints set the timestamp instead of removing rows. All queries filter `deletedAt: null`. Files in object storage are preserved for recovery.

8. **API docs must stay in sync.** When adding, changing, or removing any `/api/v1/*` route, update the OpenAPI spec in `web/src/lib/openapi/routes/` and response schemas in `web/src/lib/openapi/responses.ts`. The `/api-change` skill (Phase 5) walks the cascade.

9. **Feature specs drive parallel implementation.** When adding a new feature, write the spec in `specs/features/` first (API + Web + Mobile sections), then implement on both platforms. Both clients read the same spec. Update status checkboxes when done.

10. **Mobile uses Clean Architecture in the KMM shared module.** Domain (models, use cases, repository interfaces) → Data (DTOs, API client, repository implementations, mappers) → Presentation (ViewModels + Compose UI). Domain depends on nothing.

11. **Mobile UI is feature-based.** Each feature folder (`feature/items/`, `feature/auth/`, etc.) contains screens, viewmodels, and components together. Shared components live in `common/`.

12. **Mobile auth uses native Clerk SDKs.** Android: `com.clerk:clerk-android-api` + `clerk-android-ui` provides a prebuilt `AuthView` Compose composable using Android Credential Manager. iOS: Clerk iOS SDK (Phase 7). **Never WebView** — Google blocks OAuth in embedded WebViews.

13. **Mobile maps stay in commonMain via `com.swmansion.kmpmaps:core`.** A single shared `feature/maps/` module renders Google Maps on Android and Apple Maps on iOS through one cross-platform `Map` composable. The only platform-specific code is `openExternalMap()` for native intents.

14. **`Mobile (Android)` and `Mobile (iOS)` are separate columns in the feature matrix.** Coarse "Mobile" columns hide platform gaps. Always split.

15. **Phase numbers are stable and never reused.** Once a phase is named, it never becomes anything else. Phase tracker lives in one canonical place in this file.

16. **commonMain by default, expect/actual at platform seams only.** The list of `expect`/`actual` files should be short and audit-able.

---

## Project structure

```
triplane/                              # Monorepo root
├── web/                               # Next.js web app (Phase 2)
│   ├── prisma/
│   │   ├── schema.prisma              # User model only in v0.1
│   │   ├── seed.ts
│   │   └── migrations/
│   ├── src/
│   │   ├── app/
│   │   │   ├── api/v1/                # Versioned API routes
│   │   │   │   ├── docs/              # Scalar UI + OpenAPI JSON
│   │   │   │   ├── health/            # Single example endpoint
│   │   │   │   └── items/             # Items feature (Phase 4)
│   │   │   ├── [locale]/              # i18n-prefixed page routes
│   │   │   │   ├── (app)/             # Authenticated pages
│   │   │   │   ├── (marketing)/       # Public pages (sign-in)
│   │   │   │   └── layout.tsx         # ClerkProvider + NextIntlClientProvider
│   │   │   └── layout.tsx             # Bare shell
│   │   ├── components/
│   │   ├── lib/
│   │   │   ├── api-response.ts        # { data: T } / { error } helpers
│   │   │   ├── auth.ts                # requireUser, assertOwnership
│   │   │   ├── db.ts                  # Prisma client singleton
│   │   │   └── openapi/               # Scalar + zod-to-openapi setup
│   │   ├── messages/en-US/
│   │   ├── i18n/
│   │   └── proxy.ts                   # Middleware: CORS + i18n
│   ├── Dockerfile
│   ├── docker-compose.yml
│   ├── package.json
│   └── .env.example
├── mobile/                            # Compose Multiplatform mobile app (Phase 3)
│   ├── shared/                        # KMM shared module (domain + data)
│   │   └── src/
│   │       ├── commonMain/            # Domain models, use cases, repo interfaces, API client
│   │       ├── androidMain/           # Ktor OkHttp engine
│   │       └── iosMain/               # Ktor Darwin engine
│   ├── composeApp/                    # Shared Compose UI
│   │   └── src/
│   │       ├── commonMain/            # All screens, ViewModels, theme, navigation, maps
│   │       ├── androidMain/           # MainActivity, Clerk Android, openExternalMap
│   │       ├── iosMain/               # MainViewController, Clerk iOS (Phase 7), openExternalMap
│   │       └── debug/                 # Debug-only AndroidManifest (cleartext HTTP for emulator)
│   ├── gradle/libs.versions.toml      # Pinned versions
│   ├── local.properties.example
│   ├── build.gradle.kts
│   └── settings.gradle.kts
├── specs/                             # Shared feature specifications
│   ├── features/                      # Per-feature spec files
│   │   ├── _template.md               # Spec format (Status block has Android/iOS split)
│   │   └── *.md                       # One per feature
│   └── api-contract.md                # Pointer to /api/v1/docs
├── .claude/
│   ├── skills/
│   │   ├── feature/SKILL.md           # Spec-driven feature workflow (Phase 1)
│   │   ├── audit/SKILL.md             # Drift detector (Phase 5)
│   │   ├── scaffold/SKILL.md          # New feature scaffolder (Phase 5)
│   │   ├── api-change/SKILL.md        # API change cascade walker (Phase 5)
│   │   ├── upgrade-deps/SKILL.md      # Version cascade handler (Phase 5)
│   │   └── release-check/SKILL.md     # Pre-release verification (Phase 5)
│   └── settings.local.json
├── bin/
│   └── init.sh                        # Rename placeholders for new projects (Phase 6)
├── fly.toml                           # Fly.io config (repo root for auto-deploy)
├── .dockerignore
├── PLAN.md                            # This file
├── CLAUDE.md                          # Workflow rules — Claude reads at session start
├── LESSONS.md                         # Rationale behind every decision
├── mobile_plan.md                     # Mobile phase tracker + architecture detail
└── README.md
```

---

## Environment variables

### Web (`web/.env.local` — gitignored)

```
DATABASE_URL="postgres://..."
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."
CLERK_SECRET_KEY="sk_test_..."
TIGRIS_ACCESS_KEY_ID="..."
TIGRIS_SECRET_ACCESS_KEY="..."
TIGRIS_BUCKET_NAME="..."
TIGRIS_ENDPOINT_URL="https://fly.storage.tigris.dev"
NEXT_PUBLIC_UPLOAD_STRATEGY="proxy"   # "presign" in production
```

### Mobile (`mobile/local.properties` — gitignored)

```
sdk.dir=/path/to/Android/sdk
CLERK_PUBLISHABLE_KEY=pk_test_...
GOOGLE_MAPS_API_KEY=AIza...
```

### Mobile build config

Build-type specific via `BuildConfig`:
- **Debug:** `API_BASE_URL = "https://your-app.fly.dev"` (or `http://10.0.2.2:3000` for emulator → host)
- **Release:** `API_BASE_URL = "https://your-app.priorli.com"`

`CLERK_PUBLISHABLE_KEY` and `GOOGLE_MAPS_API_KEY` are read from `local.properties` and exposed to Android via `BuildConfig` and `manifestPlaceholders` respectively. Apple Maps on iOS needs no key.

---

## Phased build plan

| Phase | Goal | Status |
|---|---|---|
| **1** | Skeleton + foundational docs (this file, CLAUDE.md, LESSONS.md, README, mobile_plan.md, `/feature` skill, empty directory tree) | ✅ Complete |
| **2** | Web extraction — clean Next.js 16 + Clerk + i18n + Prisma + OpenAPI scaffold. Routes: `/[locale]` landing, `/[locale]/home` authenticated, `/[locale]/sign-in`, `/api/v1/health`, `/api/v1/docs` (Scalar UI), `/api/webhooks/clerk`. `bun run build` passes. | ✅ Complete |
| **3** | Mobile extraction — clean CMP + KMM + Clean Architecture + Clerk Android auth + nav + DI scaffold. Routes: Auth (Clerk AuthView) → Home (placeholder). iOS auth stub. `:composeApp:assembleDebug` and `:composeApp:compileKotlinIosSimulatorArm64` both pass. | ✅ Complete |
| **4** | Items + photos example feature — full end-to-end: API (item CRUD + presign + attachments), web (list/detail/photo gallery), mobile (ItemsListScreen + ItemDetailScreen + Peekaboo + Coil 3). Spec file. Matrix entry. Proves the template runs and demonstrates cross-platform file upload. | ✅ Complete |
| **5** | Skills library — `/audit` (drift detector), `/scaffold` (new feature scaffolder), `/api-change` (cascade walker), `/upgrade-deps` (version cascade handler), `/release-check` (pre-release verification). | ✅ Complete |
| **6** | Polish — `bin/init.sh` rename script, GitHub Actions templates, getting-started guide, v0.1 release. | ✅ Complete |
| **7** | iOS auth — Clerk iOS SDK integration. Replaces the iOS auth stub. Unblocks all features on iOS at once. | ✅ Complete |

> **Note on phase numbering:** Phases 1–6 deliver v0.1. Phase 7 is iOS auth — the same gating role Phase 12.7 played in Travolp. Numbering is stable; never reused.

---

## Feature matrix

> **iOS column note:** Until Phase 7 ships, all `Mobile (iOS)` cells are 🔲. CommonMain code compiles for iOS via `:composeApp:compileKotlinIosSimulatorArm64`, but no feature runs end-to-end on iOS until Clerk iOS SDK is integrated. Once Phase 7 ships, the rows that already have ✅ Mobile (Android) should light up at the same time (no extra commonMain work needed).

| Feature              | API | Web | Mobile (Android) | Mobile (iOS) | Spec |
|----------------------|-----|-----|------------------|--------------|------|
| Auth                 | 🔲  | 🔲  | ✅               | ✅           | 🔲   |
| Items + Photos       | ✅  | ✅  | ✅               | ✅           | ✅   |

(More rows added as features are built.)

---

## Recent decisions log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-10 | Triplane created from Travolp lessons | Instead of starting the next Priorli project from scratch, distill Travolp's lessons into a reusable template. See `LESSONS.md` for the full rationale. The template's name `priorli/triplane` reflects "three surfaces" (web + Android + iOS) and is namespaced under the Priorli GitHub org. |
| 2026-04-10 | Mobile column split into Android + iOS from day 1 | Travolp's single Mobile column hid the iOS gap (every feature was Android-only because iOS auth was stubbed). Triplane uses two columns from the start so the gap is visible in the matrix and in every spec file. |
| 2026-04-10 | Native Clerk SDKs only — never WebView | Travolp tried 3 auth approaches before landing on native SDKs. Google blocks OAuth in embedded WebViews. The native path is documented as the only supported approach in CLAUDE.md and LESSONS.md. |
| 2026-04-10 | Items + photos as the v0.1 example feature | Most ambitious example choice — pulls Tigris S3 and Peekaboo image picker into v0.1. Justified because cross-platform file upload is the hardest pattern to get right, and proving it works out of the box is the template's biggest selling point. |
| 2026-04-10 | Versions pinned to known-coherent set | `libs.versions.toml` ships with the version set we know works together (Kotlin 2.3.10 / CMP 1.10.3 / AGP 8.9.1 / compileSdk 36 / Clerk Android 1.0.11 / kmp-maps 0.9.1). The `/upgrade-deps` skill (Phase 5) handles cascades when bumping. |
| 2026-04-10 | Phase 2 — web extracted from Travolp | `web/` rsync'd from travolp/web/ excluding node_modules, .next, .env.local, bun.lock, generated/. Stripped: all trip/day/stop/leg/place/chat/attachment/admin code; Anthropic SDK; @react-google-maps/api; @dnd-kit; react-markdown/remark-gfm; trip-specific OpenAPI route registrations (10 files); 12 trip-specific Prisma models; 11 stale migrations; trip-related lib helpers (trip-days, leg-helpers, generate-itinerary, chat-tools, anthropic, google-places, google-directions, map-utils, config). Replaced: package.json (renamed `triplane-web`, dropped 8 trip-specific deps); auth.ts (replaced 5 entity-specific assertOwnership helpers with one generic `assertOwnership(loader)`); openapi/index.ts + openapi/responses.ts (Triplane branding, health-only); landing + (app)/layout.tsx + (app)/home/page.tsx (generic placeholder pointing to /api/v1/docs); messages/en-US/* (generic strings); .env.example. Verified: `bun install` (824 packages), `bun run build` clean — 7 routes generated, TypeScript clean. |
| 2026-04-10 | Phase 3 — mobile extracted from Travolp | `mobile/` rsync'd from travolp/mobile/ excluding .gradle, .idea, .kotlin, build/, local.properties, *.hprof. Bulk stripped: `feature/{trips,days,stops}/`, trip-related maps screens (TripMapScreen/TripMapViewModel/DayMapView/StopRouteMiniMap), all `shared/domain/{model,repository,usecase}/` (~28 use cases), `shared/data/repository/`, `shared/data/mapper/`, all per-feature `*Api.kt` and `*Dto.kt` in shared. Package rename via sed: `com.travolp.app` → `com.priorli.triplane`, `com.travolp.shared` → `com.priorli.triplane.shared`, `Travolp` → `Triplane`, `TravolpApiClient` → `ApiClient`. Then `mv`'d directory tree to match. Replaced: `Routes.kt` (Auth + Home only), `NavGraph.kt` (Auth + Home composables), `AppModule.kt` (empty — no ViewModels in scaffold), `SharedModule.kt` (just ApiClient bindings), `MapColors.kt` (generic PALETTE, dropped trip-specific DAY_COLORS/MODE_COLORS naming), `feature/home/HomeScreen.kt` (new placeholder authenticated home with sign-out). Created `mobile/local.properties.example` documenting `sdk.dir`, `CLERK_PUBLISHABLE_KEY`, `GOOGLE_MAPS_API_KEY`. Kept generic infrastructure: kmp-maps integration (MapCameraUtils + ExternalMap expect/actual), PolylineDecoder util, ApiClient + ApiException, AuthTokenProvider interface, TokenStorage expect/actual, UiState, Theme. **35 source `.kt` files survive (was 100+).** Verified: `:composeApp:assembleDebug` (8s) and `:composeApp:compileKotlinIosSimulatorArm64` (3s) both green. iOS auth stub remains intact (Phase 7 work). |
| 2026-04-11 | Phase 7 — iOS auth shipped end-to-end: `xcodebuild build` green against Clerk iOS SDK 1.0.9 SPM | **What shipped**: full Swift/Kotlin bridge for Clerk iOS, hand-authored `mobile/iosApp/iosApp.xcodeproj/project.pbxproj` including the `XCRemoteSwiftPackageReference` for `https://github.com/clerk/clerk-ios` v1.0.9 and the `XCSwiftPackageProductDependency` entries for `ClerkKit` + `ClerkKitUI`, `iOSApp.swift`, `ContentView.swift`, `ClerkAuthBridgeImpl.swift`, `AuthScreenView.swift`, `Info.plist` (CADisableMinimumFrameDurationOnPhone, UILaunchScreen, NSPhotoLibraryUsageDescription, NSCameraUsageDescription, CLERK_PUBLISHABLE_KEY expansion), `Configuration/Config.xcconfig` (iOS 17 deployment target, ENABLE_USER_SCRIPT_SANDBOXING=NO). **Kotlin side**: `ClerkAuthBridge` interface + `AuthBridgeSubscription` + three SAM callback types + top-level `setClerkAuthBridge`/`getClerkAuthBridge` accessors in `mobile/composeApp/src/iosMain/kotlin/.../feature/auth/ClerkAuthBridge.kt`; real `AuthScreen.ios.kt` using `UIKitViewController` + the bridge's `makeAuthViewController`; real `AuthState.ios.kt` with `DisposableEffect` + `observeSignedIn`; real `PlatformModule.ios.kt` with `ClerkBridgeAuthTokenProvider` fetching fresh JWTs via the bridge; fixed lingering "Phase 12.7" KDoc. **Remediation path discovered (critical)**: the Kotlin/Native 2.3.10 ObjC exporter crashes with `java.lang.ClassCastException` inside `createConstructorAdapter` when processing Phase 4's `composeApp/feature/items/*` public types. **Workaround: mark every Phase 4 composeApp/feature/items type as `internal`** — excludes them from the ObjC export surface (Swift doesn't need them anyway; they're only consumed by Compose/Koin within composeApp). Applied to `ItemsViewModel`, `ItemDetailViewModel`, `PickedPhoto`, `ItemsListScreen`, `ItemDetailScreen`, `ItemCard`, `PhotoGallery`, `CreateItemSheet`, `ImagePickerButton` (9 files). Compose + Koin still work because internal types are same-module-accessible. The bridge types in `feature/auth/ClerkAuthBridge.kt` remain public because Swift needs them. **Path 1 explored first**: upgrading Kotlin 2.3.10 → 2.3.20 (stable, released 2026-03-16) did NOT fix the bug — same `ClassCastException`. Reverted to 2.3.10. **Paths 2 (deeper bisect) and 3 (move bridge to shared + export whitelist) were not needed** once the internal-visibility workaround unblocked everything. **Swift-side Clerk API corrections from initial research**: (a) `Clerk.configure(publishableKey:)` is a STATIC method, not instance — earlier code had `Clerk.shared.configure(...)` which fails with "static member 'configure' cannot be used on instance of type 'Clerk'"; (b) `Clerk` class is `@MainActor`-isolated, so `Clerk.shared.user` and all Clerk calls must happen from main actor — `ClerkAuthBridgeImpl` uses `MainActor.assumeIsolated { }` for sync methods (`isSignedIn()`) and `Task { @MainActor in ... }` for async ones; (c) `Clerk.shared.auth.getToken()` returns `String?` directly, not a `{ jwt: String }` wrapper — earlier code had `.getToken()?.jwt` which fails; (d) sign out is `Clerk.shared.auth.signOut()` not `Clerk.shared.signOut()`. **Verification**: (i) `cd web && bun run build` clean, (ii) `:composeApp:compileKotlinIosSimulatorArm64` clean, (iii) `:composeApp:linkDebugFrameworkIosSimulatorArm64` clean (the link task that was broken during Phase 4 → now works with the internal-visibility fix), (iv) `:composeApp:assembleDebug` clean, (v) `xcodebuild -project mobile/iosApp/iosApp.xcodeproj -scheme iosApp -destination 'generic/platform=iOS Simulator' -configuration Debug build` — **** BUILD SUCCEEDED ****. SPM fetch resolved Clerk + Nuke + PhoneNumberKit transitively. **Deferred to user**: interactive simulator sign-in with a real Clerk publishable key. Fill in `CLERK_PUBLISHABLE_KEY` in `mobile/iosApp/Configuration/Config.xcconfig`, open the project in Xcode (or run `xcodebuild … -destination 'platform=iOS Simulator,name=<device>'`), and sign in via Clerk's prebuilt `AuthView()`. The Kotlin `rememberIsSignedIn()` is driven by `observeSignedIn` polling `Clerk.shared.user` on a `@MainActor` Task. **Follow-up parked as Phase 7.1**: (a) harden CLAUDE.md + `/release-check` + `ci.yml` to include `linkDebugFrameworkIosSimulatorArm64` in the iOS verification contract, so future phases can't introduce ObjC-export regressions undetected — Phase 4 slipped precisely because only `compileKotlinIosSimulatorArm64` was verified. (b) optional: add an `xcodebuild build` step to the macOS CI runner. (c) optional: investigate whether the Kotlin/Native ObjC exporter bug has an upstream fix in 2.4.x or should be filed as a bug report. |
| 2026-04-11 | Phase 6 — Polish shipped; v0.1 ready to tag | Four deliverables: (1) **`bin/init.sh`** — downstream-project rename script. Takes `<slug> <java-namespace>`, moves Kotlin package directories, rewrites `package`/`import`/`namespace`/`applicationId` across every `.kt`/`.kts`/`.xml` file, renames `web/package.json`, and copies `web/.env.example` → `web/.env.local` + `mobile/local.properties.example` → `mobile/local.properties`. Uses portable temp-file sed (works on BSD and GNU without flag juggling). **Explicitly does NOT rewrite** docs (`README.md`, `PLAN.md`, `LESSONS.md`, `CLAUDE.md`, `mobile_plan.md`, `specs/**`) or user-facing display strings (e.g. `Text("Triplane")` in Compose, `"title": "Triplane"` in i18n JSON) — those need human judgment and the script prints grep targets for them. Idempotency guard: refuses to run if `com.priorli.triplane` references are already gone, to prevent half-renamed corruption on re-runs. Validates slug (kebab-case) and namespace (dotted lowercase) before touching anything. Tested: `--help`, no-args, invalid slug, syntax check with `bash -n`; full runs not executed against this repo because that would destructively rename the template's own Kotlin packages. (2) **`.github/workflows/ci.yml`** — three parallel jobs mirroring the build verification contract: `web` (ubuntu + bun + `bun run build` with placeholder env vars that let the build complete without reaching real services), `android` (ubuntu + JDK17 + android-actions/setup-android + `:composeApp:assembleDebug`), `ios-compile` (macos-latest + JDK17 + `:composeApp:compileKotlinIosSimulatorArm64` — the iOS compile only runs on macOS runners because Kotlin/Native iOS targets require Xcode tooling). Uses `concurrency: cancel-in-progress` so new commits cancel stale runs. **No GitHub secrets required** — the template works out of the box; downstream consumers add real secrets only when they wire up a deploy workflow. (3) **Expanded getting-started guide in `README.md`** — seven-step walkthrough (gh repo create → init.sh → env setup → migrate → run locally → /feature add → verify). Lists all six shipped skills with one-line descriptions so they're discoverable without opening each SKILL.md. (4) **Housekeeping** — stripped the `(when shipped — Phase 5)` markers from CLAUDE.md, added an "Available skills" table to CLAUDE.md, added three Phase-4-discovered gotchas to CLAUDE.md's "Common gotchas" list (Next.js 16 `params: Promise`, `coil-network-okhttp` JVM-only, KDoc brace bug). **Explicit non-goals for Phase 6**: (a) no `fly.toml` / `.dockerignore` at repo root — README used to hint at them but Phase 2 never shipped them, and Phase 6 is not the place to invent a deployment story; if the README still references Docker/Fly, treat that as a separate fix-up task. (b) No `git tag v0.1.0` — tags are durable public artifacts and must be pushed by the user, not the agent. (c) No iOS Xcode wrapper — Phase 7. (d) No new `web/` or `mobile/` source code. **Verification**: `bash -n bin/init.sh` clean, `--help` and no-arg paths work, slug validation rejects bad input, `grep -n "when shipped" CLAUDE.md` returns nothing. No build re-run needed because Phase 6 does not touch `web/src` or `mobile/*/src`. |
| 2026-04-10 | Phase 5 — Skills library shipped | Five new project-scoped skills under `.claude/skills/` — all pure markdown, no helper scripts. (1) **`/audit`** — read-only drift detector that globs `specs/features/*.md`, verifies checkboxes against code + `PLAN.md` matrix, reports three-way disagreements. Automatic-drift rule: any `Mobile (iOS)` checkbox other than 🔲 is drift until Phase 7 ships. (2) **`/scaffold`** — new-feature file generator. Refuses to run without an approved `specs/features/<slug>.md` (spec-first is non-negotiable). Generates canonical placeholder files for web API + OpenAPI + UI + mobile shared (domain/data/mapper/repo) + Compose + DI + nav, using Items + Photos as the structural template. Presents file list to user before writing, writes in one batch. (3) **`/api-change`** — cascade walker for `/api/v1/*` changes. Enumerates ~12 places a single endpoint change must propagate: zod schema, OpenAPI registration, route handler, serializer, client-safe types, web UI, mobile DTOs, mobile API wrapper, mobile mapper, domain model, repo interface/impl, feature screens, spec file, decisions log. Build-verifies all three targets at the end. (4) **`/upgrade-deps`** — Gradle/Kotlin/CMP/AGP/compileSdk + `web/package.json` cascade handler. Requires researching the target version's own pinned requirements on GitHub (Dokka docs lie — read the source). Encodes the known gotchas database: `coil-network-okhttp` is JVM-only (use `coil-network-ktor3`), KDoc chokes on unbalanced braces (use `//` line comments), Next.js 16 `params: Promise<...>`, `extendZodWithOpenApi(z)` must be called in `responses.ts`, Clerk Android SDK forces cascading bumps on every minor. (5) **`/release-check`** — runs all three build commands in parallel (single message, multiple Bash tool calls), then invokes `/audit`, reports a single summary. Gated on Android-green + iOS-compile-green + no-drift. **Why skills are pure markdown**: skills-as-instructions beat workflow-as-recited-steps under context pressure. Claude will forget "read CLAUDE.md, then check the spec, then verify …" ten turns into a session; a skill file is loaded on demand and always complete. Helper scripts would be a second thing to maintain. **Verification**: all five skills are auto-discoverable via the Claude Code skill loader; all reference real file paths (grep'd); trigger phrases are distinct across skills to avoid auto-trigger collisions. No builds to run — skills are documentation. |
| 2026-04-10 | Phase 4 — Items + Photos example feature shipped | Full end-to-end CRUD + file upload. **Five pressure-tested architectural decisions (captured in `specs/features/items.md`):** (1) `Attachment.itemId` is NOT NULL — two-phase create (item first → photos after) avoids orphan-cleanup noise; (2) **presign-only** upload strategy — leftover `NEXT_PUBLIC_UPLOAD_STRATEGY` env var removed from `.env.example`, single canonical path for web + mobile; (3) **private bucket + server-generated presigned GET URLs** with `urlExpiresAt` on every Attachment DTO so principle #6 (ownership enforced) holds end-to-end; (4) **separate `AttachmentRepository`** (not folded into `ItemRepository`) — matches Clean Architecture principle #10, future features (avatars, documents) can reuse; (5) **`HomeScreen` kept** as minimal post-auth landing (not deleted) so Phase 7 iOS bring-up has a non-feature destination to smoke-test. **Web:** 8 new API routes (`items` CRUD, `attachments` presign/save/delete) with `zod/v4` validation + Clerk `requireUser()` + generic `assertOwnership()`; OpenAPI registrations in `openapi/routes/{items,attachments}.ts`; `lib/items.ts` server serializer + `lib/items-types.ts` client-safe types; `next.config.ts` `remotePatterns` with `search: ''` to tolerate Tigris signed-URL query strings; `items/page.tsx` + `items/[id]/page.tsx` Server Components (`await params` per Next.js 16); Client Components for list/detail/create/delete; `PhotoUploader` helper implementing presign → PUT → save metadata flow. **Mobile:** Clean Architecture shared-module layer (domain models + repo interfaces + 7 use cases + DTOs + Ktor APIs + mapper + impls); `ApiClient` extended with a second `uploadHttpClient` (no auth, no baseUrl) for presigned-URL PUTs — presigned URLs are self-authenticating via query string, attaching the Bearer token would make Tigris reject them; feature/items/ with `ItemsListScreen` + `ItemDetailScreen` + `ItemsViewModel` + `ItemDetailViewModel` + `ItemCard` + `PhotoGallery` + `CreateItemSheet` + `ImagePickerButton`; navigation wired (`ItemsList` + parameterized `ItemDetail(itemId)`); Koin bindings for repos, use cases, and parameterized ViewModels. **Libraries added:** Peekaboo `0.5.2` (`io.github.onseok:peekaboo-image-picker`, commonMain-friendly, returns `ByteArray`) and Coil `3.4.0` (`io.coil-kt.coil3:coil-compose` + `coil-network-ktor3`). **Cascade gotcha:** initially tried `coil-network-okhttp` per the research agent's recommendation — JVM-only, broke `compileKotlinIosSimulatorArm64` immediately. Swapped to `coil-network-ktor3` which reuses the Ktor 3 already in the project. Lesson: even verified research can mislead on multiplatform network modules — run the iOS compile after every dependency add, not just at the end. **Next.js 16 gotchas:** `params: Promise<...>` in route handlers + Server Component pages (must `await`); the `.openapi()` extension doesn't auto-install when feature code imports schemas directly from `openapi/responses.ts` — added an explicit `extendZodWithOpenApi(z)` at the top of that file so the method is available regardless of which module triggers the first import. **KDoc gotcha:** Kotlin/Native's parser choked on `{ error: { ... } }` inside a `/** */` block (probably interprets unbalanced braces as unclosed inline tags) — rewrote those comments as `//` line comments. **iOS Info.plist entries for Peekaboo (`NSPhotoLibraryUsageDescription`, `NSCameraUsageDescription`) deferred to Phase 7** because the `iosApp/` Xcode wrapper doesn't exist yet — it'll be created alongside Clerk iOS SDK integration. **Verified:** `cd web && bun run build` clean (14 routes incl. 8 new), `./gradlew :composeApp:assembleDebug` clean, `./gradlew :composeApp:compileKotlinIosSimulatorArm64 --rerun-tasks` clean. Manual web smoke test deferred until a Neon/Clerk/Tigris environment is wired up. |
