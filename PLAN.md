# Triplane — Project Plan

> Priorli's full-stack monorepo template. **This is the template's own plan, not the plan for an app built from it.** When you `gh repo create my-app --template priorli/triplane`, replace this content with your app's plan (the structure stays).

**Status:** Phases 1–3 complete. Phase 4 (items + photos example feature) next.
**Last updated:** April 10, 2026
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
| **4** | Items + photos example feature — full end-to-end: API (item CRUD + presign + attachments), web (list/detail/photo gallery), mobile (ItemsListScreen + ItemDetailScreen + Peekaboo + Coil 3). Spec file. Matrix entry. Proves the template runs and demonstrates cross-platform file upload. | 🔲 Not started |
| **5** | Skills library — `/audit` (drift detector), `/scaffold` (new feature scaffolder), `/api-change` (cascade walker), `/upgrade-deps` (version cascade handler), `/release-check` (pre-release verification). | 🔲 Not started |
| **6** | Polish — `bin/init.sh` rename script, GitHub Actions templates, getting-started guide, v0.1 release. | 🔲 Not started |
| **7** | iOS auth — Clerk iOS SDK integration. Replaces the iOS auth stub. Unblocks all features on iOS at once. | 🔲 Not started |

> **Note on phase numbering:** Phases 1–6 deliver v0.1. Phase 7 is iOS auth — the same gating role Phase 12.7 played in Travolp. Numbering is stable; never reused.

---

## Feature matrix

> **iOS column note:** Until Phase 7 ships, all `Mobile (iOS)` cells are 🔲. CommonMain code compiles for iOS via `:composeApp:compileKotlinIosSimulatorArm64`, but no feature runs end-to-end on iOS until Clerk iOS SDK is integrated. Once Phase 7 ships, the rows that already have ✅ Mobile (Android) should light up at the same time (no extra commonMain work needed).

| Feature              | API | Web | Mobile (Android) | Mobile (iOS) | Spec |
|----------------------|-----|-----|------------------|--------------|------|
| Auth                 | 🔲  | 🔲  | 🔲               | 🔲           | 🔲   |
| Items + Photos       | 🔲  | 🔲  | 🔲               | 🔲           | 🔲   |

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
