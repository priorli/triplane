---
name: init-app
description: Use this skill to bootstrap a downstream app from the Triplane template after `gh repo create --template`. Triggers on phrases like "init app from idea", "initialize project from template", "bootstrap a new app from the template", "set up downstream project from brief", "run init-app", "finish the template bootstrap". One-shot — wraps `bin/init.sh` (Kotlin package rename), then runs `.claude/skills/init-app/rewrite-docs.sh` (strips PLAN.md template-meta, resets feature matrix, replaces README.md, rewrites display strings across Compose + web + Prisma), then build-verifies web + Android + iOS in parallel, then loops `/feature add` for each MVP backlog item in `IDEA.md`. Refuses if the template is already initialized (idempotency guard: `com.priorli.triplane` must still be present).
invocable: true
---

# Downstream app bootstrapper

Triplane is a template: `gh repo create my-app --template priorli/triplane` clones it, but the clone still has "Triplane" everywhere — Kotlin package paths, display strings, PLAN.md's phase tracker, README's Triplane-specific intro, the feature matrix. Hand-finishing that is tedious and easy to half-do. This skill does it in one shot: run `bin/init.sh` → rewrite docs → build-verify → loop `/feature add` for each backlog item → hand off.

Run this ONCE per downstream project, immediately after `/ideate` has produced `IDEA.md` at the repo root (or after you've hand-written a brief there). It's strictly one-shot — re-runs are blocked by design.

> **Read `LESSONS.md` § "The drift problem"** if you want to understand why the matrix + spec loop matters. This skill's job is to prevent day-one drift.

## Invariants

1. **One-shot only.** Refuses if `com.priorli.triplane` is already absent from `mobile/` and `web/` (same guard `bin/init.sh` uses). Re-bootstrapping is not supported — if the user wants to start over, they `git reset --hard` to the pre-init commit and re-invoke.
2. **Refuses if `git status` shows uncommitted changes.** Protects user work. The user should commit or stash before invoking.
3. **Consumes `IDEA.md` if present.** Falls back to an inline brief if the user provides one in the invocation. Never fabricates feature backlogs — an empty backlog means an empty matrix, not invented rows.
4. **Preserves `CLAUDE.md` and `LESSONS.md` verbatim.** They're universal workflow knowledge, useful in every downstream project as-is. Do not touch them.
5. **Previews before writing.** Step 3 lists everything the skill will do and waits for explicit approval. No silent rewrites.
6. **Approval-gated spec loop.** Step 8 loops `/feature add` for each MVP backlog item, presenting each draft and waiting for approval before writing the spec file. Skipping approval is not allowed.
7. **Never commits.** Mirrors `bin/init.sh`'s policy. The user reviews `git status` at the end and decides when to commit. The skill only prints the suggested commit message.

## Step 1 — Pre-flight checks

Run these in order and abort with a clear message if any fails:

1. **Template pristine check.** Run `grep -l "com.priorli.triplane" mobile/composeApp/build.gradle.kts 2>/dev/null` — must find a match. If not:
   > Error: this repo looks already initialized. `com.priorli.triplane` is gone from `mobile/`. If you want to re-bootstrap, run `git reset --hard <pre-init-commit>` and invoke `/init-app` again.
2. **Git clean check.** Run `git status --short` — must be empty. If uncommitted changes exist:
   > Error: uncommitted changes detected. Commit or stash before running `/init-app`. I won't bootstrap on top of in-progress work.
3. **Brief available check.** Check if `IDEA.md` exists at the repo root. If not, ask the user: "No `IDEA.md` found. Run `/ideate` first, or paste a brief inline here (product name, tagline, MVP feature backlog — I'll extract what I need)."

## Step 2 — Read the brief and collect inputs

1. Read `IDEA.md` and extract:
   - Product name (H1)
   - Tagline (first `> ` blockquote under the title)
   - Description (first paragraph under `## Description`)
   - MVP feature backlog (numbered list under `## MVP feature backlog`) — each entry is `N. <Feature name> — <description>`. Extract the `<Feature name>` parts, convert to kebab-case slugs (e.g., "Photos — attach multiple photos per recipe" → `photos`).
2. Ask the user for:
   - **Project slug** (kebab-case) — used by `bin/init.sh`. Suggest one derived from the product name if you can (e.g., "Recipe Share" → `recipe-share`).
   - **Java namespace** (dotted lowercase, e.g. `com.myorg.recipeshare`) — used by `bin/init.sh`.
   - **Display name** — defaults to the product name from `IDEA.md` if present. The user can override (e.g., they might want "My App" instead of the formal "My Awesome App Inc.").
3. Echo the collected values back and wait for confirmation:
   > About to bootstrap with:
   >   Product:     Recipe Share
   >   Slug:        recipe-share
   >   Namespace:   com.myorg.recipeshare
   >   Display:     Recipe Share
   >   Tagline:     Share recipes with your cooking circle.
   >   MVP features: recipes, photos, follows, tags (4 specs will be drafted)
   >
   > Proceed?

## Step 3 — Present the full execution plan

List everything the skill will do, in order:

```
/init-app execution plan — Recipe Share

 1. Run `bin/init.sh recipe-share com.myorg.recipeshare --yes`
      → renames Kotlin packages, updates Android namespace/applicationId,
        copies .env.example templates to .env.local and local.properties

 2. Run `.claude/skills/init-app/rewrite-docs.sh \
           --display-name "Recipe Share" --slug recipe-share \
           --features "recipes,photos,follows,tags" --yes`
      → strips Phased build plan + Recent decisions log from PLAN.md
      → resets feature matrix with 4 TODO rows (one per backlog item)
      → replaces README.md with downstream template
      → resets mobile_plan.md phase tracker
      → rewrites display strings (Compose + web + Prisma):
          • TriplaneTheme → RecipeShareTheme
          • Theme.Triplane → Theme.RecipeShare (AndroidManifest + themes.xml)
          • triplane_auth → recipe_share_auth (SharedPreferences key)
          • triplane.priorli.com → recipe-share.example.com (iOS base URL)
          • "Triplane" literals in ~12 source files → "Recipe Share"

 3. Preview diff: `git status && git diff --stat`

 4. Regenerate Prisma client: `cd web && bunx prisma generate`
      (refreshes the cached comment in web/src/generated/prisma/)

 5. Build-verify in parallel:
      • cd web && bun run build
      • cd mobile && ./gradlew :composeApp:assembleDebug
      • cd mobile && ./gradlew :composeApp:compileKotlinIosSimulatorArm64

 6. Draft feature specs (one at a time, approval-gated):
      /feature add recipes   → specs/features/recipes.md
      /feature add photos    → specs/features/photos.md
      /feature add follows   → specs/features/follows.md
      /feature add tags      → specs/features/tags.md

 7. Final report + suggested commit message.

Proceed? (type 'approved' to continue)
```

Wait for the user to approve. "Approved" / "go" / "yes" / "proceed" all count. "Looks good" alone does not.

## Step 4 — Run `bin/init.sh`

Invoke:

```bash
./bin/init.sh <slug> <namespace> --yes
```

Capture stdout + stderr. If the exit code is non-zero, surface the raw `bin/init.sh` error message to the user and stop — do not continue to step 5. Common failure modes:

- Slug or namespace failed validation → ask user to pick valid values and re-invoke.
- `com.priorli.triplane` not found → this should have been caught by Step 1's pre-flight, but if it sneaks through, stop.
- Permission or disk issues → surface as-is; this is outside the skill's responsibility.

## Step 5 — Run `rewrite-docs.sh`

Invoke:

```bash
./.claude/skills/init-app/rewrite-docs.sh \
    --display-name "<DisplayName>" \
    --slug <slug> \
    --features "<comma-separated-slugs>" \
    --yes
```

If `IDEA.md` is present at the repo root, the script auto-pulls tagline + description from it. You can also pass `--tagline` and `--description` explicitly if the user wants something different from what's in the brief.

Capture output. If the script exits non-zero:
- Exit 3: "already rewritten" — means `rewrite-docs.sh` ran successfully in a previous invocation but `bin/init.sh` didn't, or the user is re-running on partially-rewritten state. Surface the error and suggest `git reset --hard` to restore.
- Exit 2: arg validation failure — re-collect inputs.
- Other: surface the raw error, stop.

**Do not proceed to build-verify if `rewrite-docs.sh` fails.** A half-rewritten repo is broken state; build-verification will just add noise. Ask the user to `git checkout .` (or `git reset --hard`) to restore, then re-run.

## Step 6 — Preview the diff

Run in parallel (single message, multiple Bash calls):
- `git status --short`
- `git diff --stat`

Present a summary. Highlight the three highest-risk files:
- `PLAN.md` — the template-meta strip is irreversible without `git reset`
- `README.md` — full replacement
- The Theme.kt symbol rename — it ripples to `App.kt` (import + call site)

Ask: "Continue to build verification and spec drafting, or abort and `git checkout .` to restore?"

Wait for explicit approval.

## Step 7 — Build verification (parallel)

Single assistant turn, three parallel Bash calls:

```
Bash: cd /Users/.../<repo-root>/web && bun run build
Bash: cd /Users/.../<repo-root>/mobile && ./gradlew :composeApp:assembleDebug
Bash: cd /Users/.../<repo-root>/mobile && ./gradlew :composeApp:compileKotlinIosSimulatorArm64
```

Collect all three results before reporting. If **any one** fails, stop the skill — do not proceed to the spec loop on a broken build. Report:

```
Build verification — FAILED
✅ Web build
❌ Android build (:composeApp:assembleDebug)
<error excerpt>
⏸️  iOS compile (skipped)

The rewrite succeeded but a build broke. Most likely the TriplaneTheme →
<DisplayName>Theme rename missed a call site. Run:

  grep -rn "TriplaneTheme\|Theme.Triplane" mobile/composeApp/src/

and fix any remaining references, then re-run:
  cd mobile && ./gradlew :composeApp:assembleDebug
```

If **all three pass**, proceed to Step 8.

**Note on iOS verification:** for extra safety you may also run `./gradlew :composeApp:linkDebugFrameworkIosSimulatorArm64` (the link task catches ObjC exporter regressions that the compile task misses — see `LESSONS.md` and `/release-check`'s notes on why). Compile alone is the minimum; link is the gold standard.

## Step 8 — Loop `/feature add` for each MVP backlog item

For each feature slug parsed from `IDEA.md`'s backlog (in the order they appear):

1. Invoke `/feature add <slug>`'s flow from `.claude/skills/feature/SKILL.md` — specifically the Mode: add workflow (read `_template.md`, draft a spec, register in `PLAN.md`'s matrix).
2. Draft the spec by reading `specs/features/_template.md` and filling in what you can infer from the `IDEA.md` entry for this feature. Feature description goes in the Description section; API section gets a plausible `/api/v1/<slug>` stub; Web + Mobile sections get placeholder screens; Status block has all 🔲.
3. **Present the draft to the user and wait for approval.** The user may:
   - Approve as-is → write `specs/features/<slug>.md`
   - Edit the draft inline → apply edits, re-present, wait for approval
   - Skip this feature → do not write, move to the next
   - Abort the entire loop → stop immediately, report what's been drafted so far
4. After writing, verify the matrix row already exists (it was pre-seeded by `rewrite-docs.sh` with all 🔲). If the matrix is missing a row, append one. Do NOT flip the Spec box to ✅ unless the spec was actually written.
5. Move to the next backlog item.

**Critical:** Approval-gated means the user must explicitly OK each spec. Do not batch-write all N specs without intervening approval. This is where spec quality comes from — the user has to read each one and push back on anything shallow.

## Step 9 — Final report

Produce a terse summary:

```
/init-app — Recipe Share bootstrapped ✅

  Slug:           recipe-share
  Namespace:      com.myorg.recipeshare
  Display name:   Recipe Share

  bin/init.sh:              ✅ (12 Kotlin files rewritten)
  rewrite-docs.sh:          ✅ (PLAN.md + README.md + 12 display-string sites)
  Prisma generate:          ✅
  Web build:                ✅
  Android build:            ✅
  iOS compile:              ✅
  Feature specs drafted:    4 / 4  (recipes, photos, follows, tags)

Files changed: 31
Next:
  1. Review the diff one more time: git status && git diff
  2. Commit: git add -A && git commit -m 'Bootstrap Recipe Share from Triplane template'
  3. Start implementing: /feature continue recipes
     (or /scaffold recipes to generate file stubs first)
  4. Fill in credentials:
       - web/.env.local (Clerk, Neon, optional Tigris)
       - mobile/local.properties (Clerk publishable key, Google Maps API key)
  5. Delete IDEA.md if you don't want it tracked (it's the audit trail for
     "why does this app exist" — keeping it is usually worth it).
```

## Critical reminders

- **Do not commit.** Leave `git status` for the user to review.
- **Do not run `/feature continue`** as part of this skill. Specs → implementation is a separate phase with its own plan-mode review.
- **Do not touch `CLAUDE.md`, `LESSONS.md`, `bin/init.sh`, or `.claude/skills/**/SKILL.md`.** Those are universal — they stay verbatim through init.
- **Do not re-run `/init-app` on a partially-initialized repo.** If any step failed midway, tell the user to `git reset --hard <pre-init-commit>` and start over. Partial state is always worse than full rollback.
- **Do not fabricate backlog items.** If `IDEA.md`'s backlog is empty, the matrix stays empty. It's better to ship an empty matrix than wrong rows.
- **Run builds in parallel.** Step 7 must be three parallel Bash calls in a single message, not sequential. Sequential wastes minutes.
- **The `TriplaneTheme` symbol rename is the most fragile piece.** If step 7's Android build fails with "unresolved reference: TriplaneTheme", the rewrite script missed a call site. Grep for it and fix before retrying.

## Files this skill touches

### Via `bin/init.sh`:
- Kotlin package directories: `mobile/composeApp/src/**/kotlin/com/priorli/triplane/` → `<new-namespace-path>/`
- Kotlin `package` + `import` declarations in every `.kt` file under `mobile/`
- `mobile/composeApp/build.gradle.kts` + `mobile/shared/build.gradle.kts` (`namespace`, `applicationId`)
- `mobile/composeApp/src/androidMain/AndroidManifest.xml` (package attribute)
- `web/package.json` (`name` field)
- `web/.env.local` + `mobile/local.properties` (copied from `.example` templates)

### Via `rewrite-docs.sh`:
- `PLAN.md` — structural strip (Phased build plan, Recent decisions log) + TOC renumber + matrix reset + feature row seed + title + `Triplane` → display name
- `README.md` — full replacement with downstream template
- `mobile_plan.md` — strip phase tracker + Mobile parity section + `Triplane` → display name
- `web/prisma/schema.prisma` — header comment
- `web/prisma/seed.ts` — header comment + log line
- `web/src/messages/en-US/common.json` + `landing.json` — i18n strings
- `web/src/lib/openapi/index.ts` — OpenAPI spec title + description
- `web/src/lib/openapi/responses.ts` — header comment
- `web/src/app/[locale]/layout.tsx` — `<title>` + description metadata
- `web/src/app/api/v1/docs/route.ts` — HTML `<title>`
- `web/src/types/api.ts` — header comment
- `mobile/composeApp/src/commonMain/kotlin/.../common/theme/Theme.kt` — `TriplaneTheme` fn rename
- `mobile/composeApp/src/commonMain/kotlin/.../App.kt` — `TriplaneTheme` import + call
- `mobile/composeApp/src/commonMain/kotlin/.../feature/home/HomeScreen.kt` — `Text("Triplane")` literals
- `mobile/composeApp/src/androidMain/AndroidManifest.xml` — `android:label` + `android:theme` style ref
- `mobile/composeApp/src/androidMain/res/values/themes.xml` — `<style name="Theme.Triplane">`
- `mobile/composeApp/src/androidMain/kotlin/.../common/TokenStorage.android.kt` — SharedPreferences key
- `mobile/composeApp/src/iosMain/kotlin/.../di/PlatformModule.ios.kt` — production base URL placeholder

### Via the `/feature add` loop (step 8):
- `specs/features/<slug>.md` — one file per approved backlog item
- `PLAN.md` — feature matrix rows (already seeded by `rewrite-docs.sh`, updated as specs are written)

### Never touched:
- `CLAUDE.md`, `LESSONS.md`
- `.claude/skills/**/SKILL.md`, `.claude/skills/**/*.sh`
- `bin/init.sh`, `.github/workflows/**`
- Anything under `.git/`, `.gradle/`, `.kotlin/`, `.next/`, `node_modules/`, `build/`, `generated/`

## Related skills

- `/ideate` — the natural prerequisite. Produces `IDEA.md` that `/init-app` consumes.
- `/feature add` — invoked in a loop at step 8. Does the actual spec drafting.
- `/feature continue` — the natural next step after `/init-app` finishes. Implements the first feature.
- `/scaffold` — alternative to `/feature continue` for the first feature: generates file stubs from an approved spec.
- `/release-check` — the template for the parallel build-verification pattern this skill reuses in step 7.
- `/audit` — run after the first round of `/feature continue` to catch any drift that may have slipped in.

## When not to use this skill

- **The template is already initialized** (`com.priorli.triplane` is gone). Use `/feature add` for new features and `/feature continue` to implement them.
- **You're adding a new feature to an already-bootstrapped app.** Use `/feature add <slug>` directly.
- **You're testing a template modification against Triplane itself.** This skill would strip PLAN.md's meta sections, which is the wrong thing on the template repo. Make a scratch branch and reset after.
- **`IDEA.md` doesn't exist and the user hasn't written a brief.** Run `/ideate` first to produce one.
