---
name: feature
description: Use this skill when the user wants to add a new feature, check the cross-platform status of an existing feature, or continue implementing a feature in the Triplane monorepo. Triggers on phrases like "add a feature", "implement X", "is X done on mobile/web", "what's left for X", "finish X feature", "check status of X". Walks through the spec-driven workflow that keeps `web/`, `mobile/`, and `specs/features/` in sync — never let the three drift. Verifies spec checkboxes against actual code on every check, because drift is inevitable without verification.
invocable: true
---

# Feature workflow — Triplane monorepo

Triplane is Priorli's full-stack monorepo template with three coupled surfaces: `web/` (Next.js), `mobile/` (Compose Multiplatform — Android + iOS), and `specs/features/` (the source of truth that ties them together). Every feature must be tracked in a spec file AND in the `PLAN.md` feature matrix. The cardinal rule from `CLAUDE.md` is **"API docs, feature specs, and implementations must stay in sync."**

This skill enforces that rule. Use it whenever the conversation is about adding, checking, or finishing a feature.

> **Read `LESSONS.md` first** if you've never worked on this project. The "Drift problem" and "Patterns that worked" sections explain why this skill exists.

## Three modes

Detect the mode from the user's intent:

| Mode | When | Goal |
|---|---|---|
| **add** | New feature, no spec file exists yet | Draft a spec → register in matrix → plan implementations |
| **check** | "Is X done?", "what's the state of X?" | Read spec → **verify checkboxes against actual code** → report drift |
| **continue** | Spec exists, one or more platforms incomplete | Plan + execute the missing platform implementation |

If the mode is ambiguous, ask the user before proceeding. Don't guess.

## Step 1 — Resolve the feature

1. Get the feature name (slug form: lowercase, kebab-case — e.g., `items`, `auth`, `notifications`).
2. Check if `specs/features/<name>.md` exists. **Always check this first.** Use Glob or Read.
3. Check the feature matrix in `PLAN.md` (search for "Feature matrix" or "feature-matrix"). Note the recorded status per column: API / Web / Mobile (Android) / Mobile (iOS) / Spec.

## Step 2 — Verify spec vs reality (do this before trusting any checkbox)

Spec checkboxes drift. **Always verify against the actual code** before reporting status or planning work. Status from the code wins; if it disagrees with the spec, fix the spec.

For each platform claimed in the spec:

### API verification (`web/src/app/api/v1/`)

- Look for the route files matching the feature's endpoints (use Glob like `web/src/app/api/v1/<resource>/**/route.ts`)
- Confirm the OpenAPI spec is updated: `web/src/lib/openapi/routes/<resource>.ts` and response schemas in `web/src/lib/openapi/responses.ts`
- A feature with API marked ✅ but no entry in `web/src/lib/openapi/routes/` is **drift** — flag it

### Web verification (`web/src/app/[locale]/(app)/`)

- Page routes: `web/src/app/[locale]/(app)/<resource>/...`
- Components: `web/src/components/<feature-related>.tsx`
- Hooks/lib: `web/src/lib/<related>.ts`
- For data mutations, the page must call `fetch('/api/v1/...')` — server actions or direct Prisma access is forbidden by architecture principle #3 in `PLAN.md`

### Mobile (Android) verification

`mobile/composeApp/src/commonMain/kotlin/com/priorli/<app>/feature/<name>/`

- Feature folder containing `*Screen.kt`, `*ViewModel.kt`, `components/`
- Shared module: `mobile/shared/src/commonMain/kotlin/com/priorli/<app>/` for any new domain models, repositories, use cases, DTOs
- DI registration: `mobile/composeApp/src/commonMain/kotlin/com/priorli/<app>/di/AppModule.kt` (`viewModelOf(::<Name>ViewModel)`)
- Navigation: `mobile/composeApp/src/commonMain/kotlin/com/priorli/<app>/navigation/Routes.kt` + `NavGraph.kt`
- Verify that `:composeApp:assembleDebug` is the build of record. Note any iOS-incompat patterns (`String.format`, JVM-only stdlib) — see Common gotchas in CLAUDE.md.

### Mobile (iOS) verification

**Important:** Until Phase 7 ships (Clerk iOS SDK integration), iOS does NOT run end-to-end. All commonMain code compiles for iOS, but `AuthScreen.ios.kt` is a stub and `rememberIsSignedIn()` returns `false`. This means **every iOS feature is gated on Phase 7** — there's no per-feature iOS work to verify until then.

After Phase 7:

- Same commonMain code as Android (iOS gets it for free)
- `AuthScreen.ios.kt` should be the real Clerk iOS implementation, not a stub
- `:composeApp:compileKotlinIosSimulatorArm64` must compile cleanly
- iOS-specific actuals only for: TokenStorage, ExternalMap, MainViewController, PlatformModule

**During verification:** if the spec says `[x] Mobile (iOS)` and Phase 7 hasn't shipped, that's automatic drift — flag it and propose flipping to `[ ]`.

If a checkbox is ✅ but the code doesn't exist, the spec is wrong — note it in the report and offer to correct it. If the code exists but the checkbox is ⬜, the same applies in reverse.

## Step 3 — Mode-specific actions

### Mode: add

1. Read the template at `specs/features/_template.md`.
2. Draft a new `specs/features/<name>.md` with the standard sections (Description, API, Web Implementation, Mobile Implementation, Status). Fill in what you can infer from the user's request. The Status block must use `Mobile (Android)` and `Mobile (iOS)` as separate checkboxes from the start.
3. **Stop and present the draft to the user** before writing the file. The user must approve the spec before any code is written — that's the whole point of spec-driven development.
4. Once the spec is approved and written, register the feature in `PLAN.md`'s feature matrix. All platform boxes start as 🔲 except Spec which becomes ✅.
5. Then enter Mode: continue (below) to plan the actual implementations.

### Mode: check

1. Report the recorded status per platform from the spec file.
2. Report the verified status from the code.
3. **Highlight any drift** between the two — this is the most valuable thing this skill does. Drift is silent technical debt.
4. **Always remember:** until Phase 7, every `Mobile (iOS)` claim other than 🔲 is drift.
5. Do NOT propose fixes unless the user asks. Just report.

### Mode: continue

1. Identify which platform(s) are incomplete (verified, not just spec-claimed).
2. Read the spec's relevant section (Web Implementation or Mobile Implementation) to understand the requirements.
3. If the platform is **mobile**: read `mobile_plan.md` for any architecture notes that apply, especially the architecture principles in `PLAN.md` (Clean Architecture, feature-based folders, native Clerk SDK, kmp-maps).
4. If the platform is **web**: read `web/AGENTS.md` if present for Next.js-specific rules.
5. Use `EnterPlanMode` for non-trivial implementations — get user approval on the approach before writing code. (Skip plan mode only for tiny additions like a missing button or a one-line fix.)
6. Implement.
7. Build-verify on the target platform:
   - Web: `cd web && bun run build`
   - Mobile (Android): `cd mobile && ./gradlew :composeApp:assembleDebug`
   - Mobile (iOS, even for Android-only changes): `cd mobile && ./gradlew :composeApp:compileKotlinIosSimulatorArm64` — catches `String.format` and other JVM-only patterns
8. **Update both** `specs/features/<name>.md` checkboxes AND the `PLAN.md` matrix row. This is non-negotiable — drifting these is what this skill exists to prevent.

## Step 4 — API change reminder

If the implementation touches `/api/v1/*` (new endpoint, modified request/response, new field):

1. Update the OpenAPI registration in `web/src/lib/openapi/routes/<resource>.ts`
2. Update response schemas in `web/src/lib/openapi/responses.ts` if needed
3. Re-run the OpenAPI build / regenerate any client artifacts
4. Confirm the mobile DTOs in `mobile/shared/src/commonMain/kotlin/com/priorli/<app>/data/remote/dto/` match
5. Note this in the spec's "API" section so future readers see the change

The OpenAPI spec at `/api/v1/docs` is the contract for mobile development. Stale docs silently break the mobile client.

(Once `/api-change` skill ships in Phase 5, prefer it for the cascade.)

## Critical reminders

- **Never implement without a spec.** If the user asks to "just add X" and no spec exists, gently push back: "Let's draft `specs/features/<name>.md` first so web and mobile stay aligned."
- **Never trust the spec checkboxes without verifying the code.** Drift is common.
- **Never finish without updating both the spec and the matrix.** This is the #1 source of silent rot in the repo.
- **Don't expand scope.** If the user asks for the mobile side of a feature, don't refactor the web side unless explicitly asked.
- **Build verify before declaring done.** Especially mobile, where iOS Kotlin/Native catches things Android compilation misses.
- **iOS is gated on Phase 7.** Don't claim any feature works on iOS until Phase 7 ships — the auth wall makes everything else unrunnable.
- **Update `.env.example` when adding env vars.** If your implementation references a new `process.env.*` variable, add a commented entry to `web/.env.example` with the variable name and a note on where to get the value. Missing env vars cause silent 500s.

## Files this skill touches frequently

- `specs/features/_template.md` — read for the spec format
- `specs/features/*.md` — the per-feature specs (read or write)
- `PLAN.md` — feature matrix, recent decisions log, phase status
- `mobile_plan.md` — mobile architecture context
- `CLAUDE.md` — monorepo workflow rules
- `LESSONS.md` — rationale for decisions (when explaining "why does this work this way?")
- `web/AGENTS.md` — web-specific rules (when present)
- `web/src/lib/openapi/routes/*.ts` — OpenAPI registrations (when API changes)
- `web/src/lib/openapi/responses.ts` — shared response schemas
