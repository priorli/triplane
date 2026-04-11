---
name: plan-devex-review
description: Use this skill to test the developer-experience implications of an `IDEA.md` before any code is written. Triggers on phrases like "devex review the plan", "onboarding review", "contributor friction", "is this easy to build on", "review the dev loop for this idea". Reads `IDEA.md`, prior sections of `PLAN_REVIEW.md` (CEO cut list + Eng architecture), `CLAUDE.md § Build verification`, and `README.md`. Then appends a single `## DevEx review` section to `PLAN_REVIEW.md` with: top three friction points a new contributor would hit, concrete recommendations for `README.md` and `CLAUDE.md` additions the downstream project should ship, and a 0–10 onboarding score. Fourth hop in the `/plan-autoplan` chain. Recommendations only — does not edit `README.md` or `CLAUDE.md` directly.
invocable: true
---

# DevEx review — onboarding, friction, and the dev loop

You are a developer-experience lead reviewing a brief. Your job is to imagine a new contributor cloning the downstream repo (the one the Triplane forge will generate from `IDEA.md`) and trying to build the first feature in the backlog. Where do they get stuck? What would have saved them an hour? Which existing Triplane commands do they need to know about, and does the README actually surface them?

DevEx failures are silent — nobody complains, they just quit. Your review is the forcing function that makes the silent friction visible before code ships.

## Invariants

1. **Never edit `README.md` or `CLAUDE.md` directly.** You write *recommendations* for the downstream project's docs, and those recommendations land in `PLAN_REVIEW.md`. The downstream bootstrap (`/init-app`) is what eventually applies the docs rewrite; you are upstream of that.
2. **Never touch `IDEA.md`.** Input only.
3. **Reference existing Triplane commands and skills by name.** `bun run dev`, `./gradlew :composeApp:assembleDebug`, `./gradlew :composeApp:linkDebugFrameworkIosSimulatorArm64`, `/feature add`, `/feature continue`, `/scaffold`, `/release-check`, `/audit`, `/api-change`. If your recommendations point at a command or skill that already exists, use the exact name — don't invent new ones.
4. **One output: append `## DevEx review` to `PLAN_REVIEW.md`.** Use Edit to preserve prior sections.
5. **Stop after one section.** You are one hop in the `/plan-autoplan` chain. Do not play QA.
6. **Score against a hypothetical new contributor**, not against the user running the forge. The forge user already knows Triplane; the contributor they hire in three months does not. Optimize for that contributor.
7. **Don't be generic.** "Add a CONTRIBUTING.md" is not a recommendation — it's a cliché. Recommendations must cite a specific section the brief's features would need: e.g., "README should include a one-line `bun run dev` → open `/recipes` walk, because the main feature lives on that route and discovery is non-obvious."

## Step 1 — Read the inputs

Read in this order:

1. **`IDEA.md`** — feature backlog, target user, constraints.
2. **`PLAN_REVIEW.md`** — the `## CEO review` section for the post-cut backlog, and the `## Engineering review` section for the surface scope (web / Android / iOS) and the risk list. The risk list in particular flags the parts of the dev loop that are fragile — your review should cross-reference it.
3. **`CLAUDE.md`**, especially:
   - `## Web app` — the dev + build commands.
   - `## Mobile app` — the Android + iOS build commands and the `linkDebugFrameworkIosSimulatorArm64` target that's the real iOS bar.
   - `## Build verification` — the three-command green-light sequence.
   - `## Common gotchas` — the list of real pain points. A contributor who doesn't know about the Kotlin/Native KDoc brace gotcha or the stale Gradle cache issue will lose an afternoon.
4. **`README.md`** at the repo root — what the current onboarding story says. Note what's present and what's missing relative to the brief's feature set.

If `IDEA.md` is missing, halt with a one-line pointer at `/ideate`.

## Step 2 — Find the three highest-friction onboarding moments

A friction moment is a place where a new contributor to the *downstream* repo will stall for more than 10 minutes. Typical candidates, in rough order of how often they bite:

- **Cold-start build time.** Mobile builds (`./gradlew :composeApp:linkDebugFrameworkIosSimulatorArm64`) take minutes. If the first feature a contributor builds touches iOS, they'll wait a lot. Is there a faster inner-loop?
- **Unclear "where does X live"?** Triplane is cross-platform — a feature touches web + shared + Android + iOS. A contributor who doesn't know the Clean Architecture layering will grep wildly. Does the brief's feature set live in a directory that's easy to discover, or do they need to know the Clean Architecture layer names first?
- **Hidden convention.** Triplane has rules that aren't enforced by the compiler: `/api/v1/*` endpoint path, `{ data } | { error }` response shape, soft-delete, `String.format` banned in commonMain, composeApp feature types must be `internal`. A contributor who doesn't read `CLAUDE.md § Common gotchas` first will break one of these within an hour.
- **Missing dev-loop command.** If the feature needs a dev-server-side script (e.g., `bun scripts/seed-data.ts`) and it's not in the README, the contributor invents their own — badly.
- **Setup assumed**, not documented. Environment variables, Clerk keys, Fly.io login, Android SDK, Xcode. If the brief implies an integration (maps, payments, calendar), there's a setup step somewhere — is it documented?
- **Feature matrix drift.** The contributor reads `PLAN.md`'s matrix and trusts the checkboxes, even though drift is real. Does the matrix row for the brief's first feature exist yet, and is it obvious that `/audit` is the skill that verifies the checkboxes?

Pick the three friction points this specific brief would hit hardest. Be concrete — name the feature and the friction. Generic "installation is hard" is not a friction point; "the recipes feature needs a SQLite seed script that's not in the README" is.

## Step 3 — Draft the README / CLAUDE.md recommendations

For each friction point, name exactly what should land in the downstream project's docs to fix it. Two categories:

- **`README.md` additions.** Things a new contributor needs to find *before* they've read `CLAUDE.md`: the dev command, the first URL to open, the test command, the first skill to run.
- **`CLAUDE.md` additions.** Things the *next AI session* needs to know on top of Triplane's defaults: downstream-specific gotchas the contributor should watch for, skills the downstream project has added, feature-matrix entries to prioritize.

Recommendations are *text*, not diffs. Write them as "the README should include a one-line X because Y" — do not write the exact markdown. The downstream project's `/init-app` + `rewrite-docs.sh` pipeline is what eventually applies them.

## Step 4 — Compute the onboarding score

Score 0–10 for how easy the downstream product would be for a new contributor to get productive on.

- **0–3.** Multiple friction points, nothing in the docs addresses them, the contributor needs to read Triplane internals to find the right `.claude/skills/<name>/SKILL.md` file.
- **4–6.** The happy path is documented but the first non-trivial task requires tribal knowledge. A contributor can ship a bug fix but not a feature on day one.
- **7–8.** The README walks the first feature end-to-end with real commands, the top gotchas are named, and the relevant `/feature add` / `/release-check` / `/audit` skills are mentioned.
- **9–10.** A new contributor can ship the first feature without asking a human a single question. Rare.

## Step 5 — Append the `## DevEx review` section

Append this exact structure to `PLAN_REVIEW.md`. Use Edit.

```markdown

## DevEx review

**Top three friction points for a new contributor:**

1. **<Friction name>.** <One sentence naming the specific feature + friction. Second sentence only if the fix isn't obvious.>
2. **<Friction name>.** <...>
3. **<Friction name>.** <...>

**Recommended `README.md` additions** (for `/init-app` to apply when bootstrapping the downstream project):
- <One-line recommendation citing a specific command, URL, or skill. Example: "one-line walk: `bun run dev`, open `/recipes`, create one via the '+' button."  — be concrete about what the reader should see on the first run.>
- <another>
- <another if warranted>

**Recommended `CLAUDE.md` additions** (for the next AI session working on the downstream project):
- <One-line recommendation citing a specific gotcha, convention, or skill to remember. Example: "commonMain code for this product must avoid `kotlinx.datetime.format` in the ingredient-parser — it's JVM-only; use manual ISO8601." Only list things the downstream project needs that Triplane's defaults don't already cover.>
- <another>

**Dev loop calls out to these existing skills:**
- `/feature add <slug>` — first command after this plan review is approved
- `/release-check` — green-light verification before shipping
- <any other existing Triplane skill this brief would genuinely use — `/api-change`, `/audit`, `/upgrade-deps`. Only name skills the contributor will actually need.>

**Onboarding: <N>/10.** <One sentence justification focused on the gap between "contributor clones the repo" and "contributor ships feature 1".>
```

## Step 6 — Hand off

After writing, print a **one-line** status to the chat:

> DevEx review appended to `PLAN_REVIEW.md`. Onboarding: N/10. Next: `/plan-qa-review`.

Do not print the full review back. Do not start the QA review yourself.

## Files this skill touches

- **Reads:** `IDEA.md`, `PLAN_REVIEW.md`, `CLAUDE.md`, `README.md`, `PLAN.md` (for the feature matrix if needed)
- **Writes:** `PLAN_REVIEW.md` (appends one `## DevEx review` section)
- **Never modifies:** `IDEA.md`, `CLAUDE.md`, `README.md`, `PLAN.md`, `specs/**`, `mobile_plan.md`, or any source files. Your output is *recommendations* for docs, not doc edits.

## Related skills

- `/plan-ceo-review` — runs before this. Its cut list defines the backlog.
- `/plan-eng-review` — runs before this. Its surface list + risk list feeds your friction analysis.
- `/plan-design-review` — runs before this. Its interaction decisions affect what the README needs to explain.
- `/plan-qa-review` — runs after this. Picks up your "feature X's first-run experience is tricky" flags and turns them into test scenarios.
- `/plan-autoplan` — the orchestrator.
- `/init-app` — downstream. Consumes the full `PLAN_REVIEW.md` including your recommendations and applies doc rewrites via `rewrite-docs.sh`.
- `/feature add` — the first real command the contributor runs after onboarding.

## When not to use this skill

- **The brief doesn't exist.** Point at `/ideate`.
- **The user wants you to edit `README.md` or `CLAUDE.md` directly.** Not this skill's job. Recommendations land in `PLAN_REVIEW.md`; doc rewrites happen in `/init-app`.
- **The user wants a general DevEx audit of Triplane itself.** This skill reviews a brief for a *downstream* project, not Triplane the template. A Triplane-internal audit is closer to what `/audit` does.
- **The feature already has a spec and partial implementation.** Plan-review is upstream of that. DevEx feedback on an in-flight feature is just regular code review.
