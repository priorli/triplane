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
10. Phase numbers are stable and never reused.
11. commonMain by default, expect/actual at platform seams only.
12. OpenAPI updated on every API change.

The full numbered list (with rationale) is in `PLAN.md` § Architecture principles.

## Web app (`web/`)

- Run dev: `cd web && bun run dev`
- Run build (verification): `cd web && bun run build`
- Deploy: `fly deploy` from repo root (fly.toml is at root, Dockerfile refs `web/` paths)
- Docker build context is the repo root; `.dockerignore` excludes `mobile/` and `specs/`
- See `web/AGENTS.md` for additional Next.js-specific rules (when present)

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
cd mobile && ./gradlew :composeApp:compileKotlinIosSimulatorArm64             # iOS
```

The `/release-check` skill (when shipped — Phase 5) runs all three at once.

## Common gotchas (from LESSONS.md)

- **`String.format` is JVM-only** — don't use it in commonMain. Use manual rounding: `(km * 10).toInt() / 10.0`.
- **Stale Gradle cache** after dependency changes — fix with `./gradlew :composeApp:compileDebugKotlinAndroid --rerun-tasks`.
- **iOS doesn't run end-to-end until Phase 7** ships (Clerk iOS SDK). All commonMain code compiles for iOS, but auth is stubbed.
- **Library docs lie. Read the source on GitHub** when integrating a new dependency — especially Dokka-generated docs which often 404.
- **Cascading version bumps** — adopting one library can force Kotlin/CMP/AGP/compileSdk upgrades. Use the `/upgrade-deps` skill (when shipped — Phase 5) to handle the cascade.

## Working with Claude Code on this project

- **Be specific.** "Implement Phase 4 of `specs/features/items.md`" beats "add items support."
- **Use plan mode for non-trivial work.** Get alignment before code.
- **Trust the skills.** `/feature` is more reliable than reciting the workflow.
- **Verify, don't trust.** Always grep the actual code rather than trusting checkboxes.
- **Long sessions:** save the plan, end the session, start fresh. Phase numbering survives compaction.
