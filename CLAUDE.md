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
cd mobile && ./gradlew :composeApp:linkDebugFrameworkIosSimulatorArm64        # iOS framework (includes ObjC export)
```

**Do not** use `:composeApp:compileKotlinIosSimulatorArm64` as the iOS verification target. That task only performs source-level compilation and does NOT run the ObjC header exporter — which means it can silently green while the framework link task fails. Phase 4 shipped an ObjC-export crash this way and it took until Phase 7 to find. The `linkDebugFrameworkIosSimulatorArm64` task runs the full framework build including ObjC export and is the correct bar.

The `/release-check` skill runs all three in parallel and then invokes `/audit` for drift detection — prefer it.

## Common gotchas (from LESSONS.md)

- **`String.format` is JVM-only** — don't use it in commonMain. Use manual rounding: `(km * 10).toInt() / 10.0`.
- **Stale Gradle cache** after dependency changes — fix with `./gradlew :composeApp:compileDebugKotlinAndroid --rerun-tasks`.
- **iOS doesn't run end-to-end until Phase 7** ships (Clerk iOS SDK). All commonMain code compiles for iOS, but auth is stubbed.
- **Library docs lie. Read the source on GitHub** when integrating a new dependency — especially Dokka-generated docs which often 404.
- **Cascading version bumps** — adopting one library can force Kotlin/CMP/AGP/compileSdk upgrades. Use the `/upgrade-deps` skill to handle the cascade.
- **Next.js 16 `params` is a `Promise<...>`** — always `await params` in route handlers and Server Components. In Client Components, use `use(params)` from React.
- **`coil-network-okhttp` is JVM-only** — use `coil-network-ktor3` instead for Compose Multiplatform.
- **KDoc and unbalanced braces** — Kotlin/Native's KDoc parser chokes on `{...}` text that looks like unclosed inline tags. Prefer `//` line comments when the text contains braces.
- **Kotlin/Native ObjC exporter crashes on some composeApp public types** — Kotlin/Native 2.3.10 and 2.3.20 have a `ClassCastException` inside `createConstructorAdapter` that trips on Phase 4-shaped composeApp types. **Workaround: mark `composeApp/feature/<name>/*` types as `internal`** so they're excluded from the ObjC export surface. Swift-facing bridge types (e.g. `feature/auth/ClerkAuthBridge.kt`) stay public. See the 2026-04-11 Phase 7 decisions log entry in PLAN.md for the full remediation story.
- **Next.js 16 requires `global-error.tsx`** — without `web/src/app/global-error.tsx`, `next build` crashes during prerender of `/_global-error` with `useContext` null. The file must be `"use client"` with its own `<html>/<body>` and no context-provider dependencies.
- **`NODE_ENV=development` during `next build`** breaks prerendering. The build script uses `NODE_ENV=production next build` to prevent shell inheritance from the dev session.
- **Clerk `<SignIn/>` needs `[[...rest]]` catch-all** — a static `sign-in/page.tsx` 404s on Clerk sub-routes (`/sign-in/factor-one`, `/sign-in/sso-callback`). Use `sign-in/[[...rest]]/page.tsx`.
- **`prisma db push` before first run** — a new downstream DB has no tables. Every API route 500s silently until you run `prisma db push` or `prisma migrate deploy`.
- **Missing env vars → silent 500s** — if `process.env.SOME_KEY` is undefined, routes crash before the error wrapper can produce `{ error: { code, message } }`. Every env var must be in `.env.example`.
- **Next.js 16 `proxy.ts` must use a function declaration** — `export const proxy = clerkMiddleware(...)` silently fails. Next.js 16 renamed `middleware.ts` to `proxy.ts` and requires `export function proxy(...)` or `export const proxy = function(...)`. If the proxy never runs, next-intl locale rewrites don't happen and `/` returns 404.

## Available skills

All seventeen skills live under `.claude/skills/<name>/SKILL.md` and auto-trigger from natural-language prompts. Prefer them over reciting the underlying workflow. Skills are grouped below: the first two bootstrap a downstream project from the template; the plan-review family (CEO/Eng/Design/DevEx/QA + orchestrator) critiques an `IDEA.md` before bootstrap; `/seed-demo` and `/stub-external-api` fake data at the DB layer and HTTP-boundary layer respectively so a downstream project can demo before real data / real API keys exist; the middle four drive day-to-day feature work; the last two handle cross-cutting maintenance.

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
| `/upgrade-deps` | Version cascade handler. Researches target version's own pins, updates `libs.versions.toml`, clean-rebuilds, logs the new set in PLAN.md. |
| `/release-check` | Runs web + Android + iOS build verifications in parallel, then `/audit`, reports a single summary. |

## Working with Claude Code on this project

- **Be specific.** "Implement Phase 4 of `specs/features/items.md`" beats "add items support."
- **Use plan mode for non-trivial work.** Get alignment before code.
- **Trust the skills.** `/feature` is more reliable than reciting the workflow.
- **Verify, don't trust.** Always grep the actual code rather than trusting checkboxes.
- **Long sessions:** save the plan, end the session, start fresh. Phase numbering survives compaction.
