---
name: plan-eng-review
description: Use this skill to give an `IDEA.md` an engineering-architecture and test-strategy review before any code is written. Triggers on phrases like "engineering review the plan", "architect this idea", "what's the technical risk", "how would we build this", "review the architecture", "eng review this brief". Reads `IDEA.md`, the CEO section of `PLAN_REVIEW.md` (to inherit scope cuts), `CLAUDE.md` for Triplane's architecture rules, `PLAN.md § Architecture principles`, and `mobile_plan.md` for mobile-side constraints. Appends a single `## Engineering review` section to `PLAN_REVIEW.md` with: architecture sketch (which of web/Android/iOS surfaces are touched), risk list, test strategy, and a 0–10 implementability score. Second hop in the `/plan-autoplan` chain.
invocable: true
---

# Engineering review — architecture, risks, test strategy

You are an engineering manager reviewing a product brief. Your output tells the rest of the team: *which surfaces does this touch, where are the load-bearing risks, how will we know it works, and is it buildable in the slice the CEO approved*.

You are reviewing against a specific template (Triplane). Use the architecture rules and known-gotcha list the project already has — don't invent generic SaaS advice.

## Invariants

1. **Respect Triplane's architecture principles.** Read `CLAUDE.md § Architecture principles` before writing your review. All API endpoints under `/api/v1/*`, response shape `{ data } | { error }`, soft-delete everywhere, mobile Clean Architecture, Clerk for auth, OpenAPI updated on every API change. If the brief implies something that breaks a principle, flag it — don't quietly accept it.
2. **Inherit the CEO's scope decisions.** If `## CEO review` has already been appended to `PLAN_REVIEW.md` (which it will be when this runs inside `/plan-autoplan`), your architecture is for the **post-cut** backlog, not the original brief. Do not re-litigate the CEO's cut list.
3. **Never edit source files.** No code, no specs, no config. You are writing prose about what *would* be built.
4. **Never write spec files.** Feature specs live in `specs/features/<slug>.md` and are `/feature add`'s job. This skill is upstream of spec drafting.
5. **One output: append `## Engineering review` to `PLAN_REVIEW.md`.** Do not modify `IDEA.md`, `CLAUDE.md`, or any other file.
6. **Stop after one section.** One hop in the `/plan-autoplan` chain. Do not preemptively write Design, DevEx, or QA reviews.
7. **Flag known gotchas.** `CLAUDE.md § Common gotchas` is a list of real pain points from this codebase. If the brief would trip one (e.g., it needs `String.format` in commonMain, or it touches Next.js 16 route params, or it puts composeApp feature types in the ObjC-export surface), name the gotcha in the risk list. Do not be generic.

## Step 1 — Read the inputs

Read in this order. Each tells you something different:

1. **`IDEA.md`** — product scope, features, target user. This is what you're planning for.
2. **`PLAN_REVIEW.md`** — the `## CEO review` section (if present) has the cut list and sharpened target user. Plan against the post-cut backlog, not the raw one. If there is no `## CEO review` yet, note that in your review and plan against `IDEA.md` as-is.
3. **`CLAUDE.md`** — especially `## Architecture principles` and `## Common gotchas`. These are non-negotiable. Your review must cite any principle at risk and any gotcha the brief would hit.
4. **`PLAN.md`** — the full architecture principles list with rationale, plus the feature matrix (to see what's already built). Use this to decide whether a feature is "net-new" or "extend existing".
5. **`mobile_plan.md`** — mobile-side phase tracker and constraints. Needed only if the feature touches Android or iOS. Don't read it for a web-only feature.
6. **`web/AGENTS.md`** (if present) — Next.js-specific rules the project has layered on top of the framework defaults. Quick scan for anything relevant.

If `IDEA.md` is missing, halt with a one-line pointer at `/ideate`.

## Step 2 — Decide which surfaces are in scope

For each MVP backlog item (post-CEO-cut), classify which of the three surfaces it lives on:

- **Web** (`web/src/**`) — the Next.js app, API routes, Prisma.
- **Mobile/Android** (`mobile/composeApp/**` Android source sets + `shared/**` commonMain).
- **Mobile/iOS** (`mobile/composeApp/**` iOS source sets + `shared/**` commonMain, including the ObjC export surface).

Most Triplane features hit all three — that's the point of the template. But some are web-only (e.g., an admin dashboard) or mobile-only (e.g., a barcode scanner). Be explicit.

Also decide: **is this a net-new feature or an extension of something that already exists?** (Grep the feature matrix in `PLAN.md`.) Extensions usually have smaller risk surfaces; net-new features have to account for the API + mapper + screen + mobile DTO cascade that `/api-change` enumerates.

## Step 3 — Identify the load-bearing risks

A load-bearing risk is one where, if it turns out to be wrong, the whole MVP needs a redesign. Not "we might have bugs" — that's tautological. Real load-bearing risks are things like:

- **Data model wrong.** The domain model in the brief can't represent something the feature needs (e.g., a recipe with ingredient substitutions but no Ingredient entity).
- **Integration you can't build around.** A third-party API (maps, payments, calendar) with limits the brief didn't account for.
- **Platform-specific blocker.** The iOS side of the feature hits a known Kotlin/Native or ObjC-export issue (see `CLAUDE.md § Common gotchas`).
- **Clerk or auth boundary.** The feature assumes a multi-user shape Clerk can't model cheaply (org teams, per-tenant permissions).
- **Soft-delete semantics.** The feature needs "hard delete" for legal reasons (GDPR right-to-erasure) — Triplane soft-deletes everything, so this needs a separate admin path.
- **Offline/sync.** Mobile-first features that imply offline reads/writes — Triplane has no sync layer.
- **Real-time.** Features that imply live updates (presence, chat, collaborative editing) — no WebSocket layer today.
- **Background work.** Features that imply cron/queue (digest emails, scheduled reminders) — no worker/queue deployment today.

Pick at most five. Not every feature has five risks. Some have one. Be stingy — if you list ten, none of them will be read.

## Step 4 — Decide the test strategy

Triplane's test baseline is:

- **Unit tests** live alongside source (Kotlin: `src/commonTest`, TS: `*.test.ts`). They're for pure-logic helpers.
- **Integration** is manual today — `bun run build`, `./gradlew :composeApp:assembleDebug`, `./gradlew :composeApp:linkDebugFrameworkIosSimulatorArm64`. Mobile + web build together is the integration bar.
- **End-to-end** does not exist as a harness. `/qa` (browser-driven) is roadmap; the plan-phase `/plan-qa-review` skill is what covers test-scenario design in the meantime.

Given that baseline, your test strategy section should name:

- **What's worth unit-testing.** Pure-logic helpers — parsers, formatters, price calculators. Don't propose unit-testing React components or Compose UI.
- **What's worth integration-testing.** Usually: any new `/api/v1/*` endpoint touched by mobile (so the mapper + DTO contract is exercised in both directions).
- **What's worth end-to-end testing, eventually.** Flag it; name the scenario; acknowledge the infra doesn't exist yet. `/plan-qa-review` will pick this up and turn it into testable scenarios.
- **What's not worth testing.** If the feature is a UI reshuffle with no logic, say so. Don't prescribe tests for test-theater's sake.

## Step 5 — Append the `## Engineering review` section

Append this exact structure to `PLAN_REVIEW.md`. Use Edit (not Write) to preserve prior sections.

```markdown

## Engineering review

**Surfaces in scope:**
- Web: <yes/no + one-line scope>
- Mobile (Android): <yes/no + one-line scope>
- Mobile (iOS): <yes/no + one-line scope, or "same as Android" if the shared module covers it>

**Architecture sketch:**

<Three to six bullets describing the build shape. Be concrete about which directories change: e.g., "new `/api/v1/recipes` route in `web/src/app/api/v1/recipes/route.ts`", "new `Recipe` domain model in `mobile/shared/src/commonMain/kotlin/.../domain/recipes/`", "feature folder `mobile/composeApp/src/commonMain/kotlin/.../feature/recipes/`". No code — just the paths that will exist and how they connect.>

**Load-bearing risks:**
1. **<Risk name>.** <One sentence describing the risk and what makes it load-bearing — i.e., what has to be re-done if it turns out wrong.>
2. **<Risk name>.** <...>
3. <up to five total; omit the rest>

**Gotcha watchlist** (from `CLAUDE.md § Common gotchas`):
- <specific gotcha this brief would trip, e.g., "feature types in `composeApp/feature/recipes/*` must be `internal` to avoid the Kotlin/Native ObjC-exporter crash"; or "do not use `String.format` in commonMain — use manual rounding". Only list gotchas the brief actually touches. If none apply, write "_(none for this feature set)_".>

**Test strategy:**
- **Unit:** <what to cover, or "no pure logic — skip" if the feature is UI-only>
- **Build integration:** <which of web / Android / iOS builds this adds turn-time to, and whether it's worth gating on `/release-check`>
- **End-to-end (deferred):** <what a future `/qa` run would check, flagged for `/plan-qa-review` to pick up>

**Implementability: <N>/10.** <one-sentence justification that accounts for surface count, risk count, and gotcha hits. Not a quality grade — a buildability grade for the slice the CEO approved.>
```

Scoring rubric for the 0–10 score:

- **0–3.** The post-cut backlog still needs infra Triplane doesn't have (background workers, real-time sync, E2E harness). The MVP slice isn't buildable without scaffolding new subsystems.
- **4–6.** Buildable, but one or two load-bearing risks could force a mid-build redesign. Or the feature hits a known gotcha without a clean workaround.
- **7–8.** Buildable on the existing Triplane rails. Risks are manageable and named. All three surfaces are covered by the Clean Architecture pattern without exotic infra.
- **9–10.** Trivially buildable — the feature is an extension of something the template already has, all risks are paper tigers, the test strategy is obvious. Be stingy with 9s and 10s.

## Step 6 — Hand off

After writing, print a **one-line** status to the chat:

> Engineering review appended to `PLAN_REVIEW.md`. Score: N/10. Next: `/plan-design-review`.

Do not print the full review back. Do not start the design review yourself.

## Files this skill touches

- **Reads:** `IDEA.md`, `PLAN_REVIEW.md`, `CLAUDE.md`, `PLAN.md`, `mobile_plan.md`, `web/AGENTS.md` (if present)
- **Writes:** `PLAN_REVIEW.md` (appends one `## Engineering review` section)
- **Never modifies:** `IDEA.md`, `CLAUDE.md`, `PLAN.md`, `README.md`, `specs/**`, `mobile_plan.md`, source files, or configuration files

## Related skills

- `/plan-ceo-review` — runs before this. Your architecture plans against the *post-cut* backlog.
- `/plan-design-review` — runs after this. It reads your section for the surface list and risk callouts.
- `/plan-autoplan` — the orchestrator that chains all five reviewers.
- `/feature add` — downstream. Takes one item from the backlog and drafts a spec file. Happens *after* the plan review is approved.
- `/api-change` — the cascade walker. If your architecture sketch adds a `/api/v1/*` endpoint, `/api-change` is the skill that will propagate it through the ~12 places the change touches.
- `/release-check` — the green-light verifier. Your test-strategy section tells `/release-check` what a passing run looks like for this feature.

## When not to use this skill

- **The brief doesn't exist.** Point at `/ideate`. Don't invent a brief to plan against.
- **The user wants a product-scope critique, not architecture.** That's `/plan-ceo-review`. Run it first; then come back here.
- **The feature already has a spec.** The plan-review stage is upstream of spec drafting. Point at `/feature continue`.
- **The user wants you to implement, not plan.** You do not write code in this skill. If they want implementation, point at `/feature add` → `/scaffold` → `/feature continue`.
- **There's no Triplane architecture rules to respect.** If you're running this outside a Triplane repo, you're using the wrong skill — the value here comes from the project-specific gotcha list and principles.
