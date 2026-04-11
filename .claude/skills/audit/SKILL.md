---
name: audit
description: Use this skill when the user asks for a repo-wide drift check — to verify that the feature matrix, per-feature spec checkboxes, and the actual codebase all agree. Triggers on phrases like "audit the repo", "check for drift", "what's out of date", "full status report", "what's shipped", "run audit", "verify the feature matrix", "is the matrix accurate". Reports only — never fixes. Follow `/feature check` for per-feature deep dives and `/feature continue` to close the gaps.
invocable: true
---

# Drift audit — cross-check specs, matrix, and code

Triplane is Priorli's full-stack monorepo template. The project's **cardinal failure mode** is drift: PLAN.md's feature matrix and `specs/features/*.md` checkboxes getting out of sync with the actual code after work lands. Travolp hit this hard — see `LESSONS.md` § "The drift problem". This skill is the repo-wide antidote.

Run it at the start or end of a session to answer "what's the real state of the repo?" in under a minute.

> Read `LESSONS.md` once if you've never used this skill before — the rationale behind the three-way check (spec vs matrix vs code) is documented there.

## Invariants

1. **Read-only.** This skill never writes files. It reports. The user follows up with `/feature continue <name>` to fix what's broken.
2. **Code wins ties.** If the spec checkbox says ✅ but the code doesn't exist, the spec is wrong. If the code exists but the checkbox is 🔲, the checkbox is wrong. Either way, report the discrepancy; don't assume either side is right.
3. **iOS is gated on Phase 7.** Until Phase 7 ships, every `Mobile (iOS)` cell other than 🔲 is automatic drift. Flag it even if the phase numbers match.

## Step 1 — Enumerate features

1. Glob `specs/features/*.md` (excluding `_template.md`).
2. For each spec file, parse:
   - The feature slug (from the filename)
   - The Status block (the `- [ ]` / `- [x]` lines at the bottom)
3. Read `PLAN.md`'s feature matrix section (search for "Feature matrix"). Parse the row for each feature.

## Step 2 — Verify each platform against the code

For each feature, check:

### API
- `web/src/app/api/v1/<resource>/**/route.ts` — at least one route file must exist
- `web/src/lib/openapi/routes/<resource>.ts` — OpenAPI registration must exist and be imported in `web/src/lib/openapi/index.ts`
- If the spec's API table lists a route but there's no matching `route.ts`, that's drift (spec promises something that doesn't exist)

### Web
- `web/src/app/[locale]/(app)/<name>/page.tsx` — at least the list page must exist
- Spec says ✅ Web with no page.tsx → drift

### Mobile (Android)
- `mobile/composeApp/src/commonMain/kotlin/com/priorli/triplane/feature/<name>/` — at least one `*Screen.kt` must exist
- `mobile/composeApp/src/commonMain/kotlin/com/priorli/triplane/navigation/NavGraph.kt` — must contain a `composable<<Name>sList>` or equivalent entry
- `mobile/composeApp/src/commonMain/kotlin/com/priorli/triplane/di/AppModule.kt` — must contain a `viewModelOf(::<Name>sViewModel)` or parameterized `viewModel` binding
- `mobile/shared/src/commonMain/kotlin/com/priorli/triplane/shared/domain/model/<Name>.kt` — shared domain model must exist
- Any of these missing + spec says ✅ Mobile (Android) → drift

### Mobile (iOS)
- **Until Phase 7 ships:** spec checkbox must be 🔲. If it's ✅ or [x], that's automatic drift — the iOS auth wall makes every feature uniformly unrunnable regardless of commonMain state.
- Phase 7 status is tracked in `PLAN.md`'s "Phased build plan" table. Read it to determine whether Phase 7 has shipped.

### Spec
- `specs/features/<name>.md` existing is necessary but not sufficient for ✅ Spec
- The spec must have all sections filled in (Description, API, Web Implementation, Mobile Implementation, Status). A file that only has headings is effectively 🔲.
- The spec must have an entry in `PLAN.md`'s matrix. If the spec exists but the matrix doesn't list it, the matrix is drifting.

## Step 3 — Report

Emit a compact report. Prefer a table that the user can scan in five seconds:

```
Feature           | API          | Web          | Mobile Android | Mobile iOS  | Spec
------------------|--------------|--------------|----------------|-------------|-------------
items             | ✅ (code ✅) | ✅ (code ✅) | ✅ (code ✅)   | 🔲 (Phase 7)| ✅
notifications     | ✅ (code ❌) | 🔲            | 🔲             | 🔲          | ✅ ⚠️ drift
```

For every drift row, add a single line below:
- `⚠️  notifications: spec says API ✅ but web/src/app/api/v1/notifications/route.ts is missing`

Group drift by severity:
1. **Hard drift** — spec/matrix says ✅ but code doesn't exist. Caller is actively misled.
2. **Soft drift** — code exists but spec/matrix says 🔲. Hidden value.
3. **iOS drift** — any iOS box other than 🔲 while Phase 7 is 🔲.

## Step 4 — Offer follow-ups, do not act

End the report with:
- **Hard drift:** "Run `/feature continue <name>` to implement the missing piece, or edit `specs/features/<name>.md` to mark it 🔲."
- **Soft drift:** "Run `/feature check <name>` to verify the existing code matches the spec, then tick the checkboxes and update `PLAN.md`."
- **iOS drift:** "Edit the spec to flip Mobile (iOS) to 🔲 until Phase 7 ships."

**Do not offer to run those commands yourself.** The user decides what to act on.

## Files this skill touches

- Read-only: `specs/features/*.md`, `PLAN.md`, any file under `web/src/app/api/v1/`, `web/src/app/[locale]/(app)/`, `web/src/lib/openapi/routes/`, `mobile/composeApp/src/commonMain/kotlin/com/priorli/triplane/feature/`, `mobile/shared/src/commonMain/kotlin/com/priorli/triplane/shared/domain/model/`
- **Never written to by this skill.** Any file. Ever.

## Related skills

- `/feature check <name>` — per-feature deep dive (this skill delegates down to it mentally)
- `/feature continue <name>` — implement the missing pieces
- `/release-check` — runs `/audit` alongside the three build verifications
