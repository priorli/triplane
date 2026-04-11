---
name: ideate
description: Use this skill when the user has a raw app or product idea and wants to think it through via Q&A to produce a structured product brief. Triggers on phrases like "I have an app idea", "brainstorm an app", "help me scope a product", "ideate a new app", "scope a new app", "help me think through this idea", "turn this idea into a plan". Runs an adaptive 5–8 question interview, then writes `IDEA.md` at the repo root — a one-page brief with product description, target user, MVP feature backlog, out-of-scope list, and open questions. `IDEA.md` is the input that `/init-app` consumes to bootstrap a downstream project from the Triplane template.
invocable: true
---

# Product brainstormer — raw idea → IDEA.md

Triplane is a template for shipping a product across web, Android, and iOS. Before any of the existing skills (`/feature add`, `/scaffold`, `/feature continue`, `/release-check`) are useful, the user needs a clear answer to "what are we building?" — a product-level scope, not a feature-level one. This skill runs the upstream Q&A that turns a raw pitch ("I want to build an app for home cooks to share recipes") into a structured brief that downstream skills can consume.

Keep it product-level. Keep it short. Don't drift into implementation details — the other skills are for that.

## Invariants

1. **One output file only:** `IDEA.md` at the repo root. Nothing else.
2. **Bounded Q&A:** 5–8 questions max. If the user volunteered most of it up front, skip the questions you already have answers to.
3. **Product-level, not feature-level.** If the user wants to spec a single feature on an already-initialized project, point them at `/feature add` instead.
4. **Never write spec files, PLAN.md, or README.md.** Those belong to `/init-app` (post-bootstrap) or `/feature add` (per-feature). This skill only writes `IDEA.md`.
5. **Present the draft before writing.** The user must approve the brief before it lands on disk.
6. **Respect existing `IDEA.md`.** If one is already present, ask: overwrite, append, or abort. Do not clobber silently.
7. **Only brainstorm — do not bootstrap.** Do not run `bin/init.sh` or `rewrite-docs.sh` from this skill. Hand off to `/init-app` when the brief is ready.

## Step 1 — Absorb what the user already said

Read the user's opening message carefully. If they already gave a paragraph like "I want an app that helps home cooks share recipes with their friends, with photo upload and weekly meal-plan reminders," you already have:

- Target user (home cooks)
- Core problem (sharing recipes with friends)
- Two MVP feature candidates (photo upload, meal-plan reminders)

Do not re-ask what you already know. Acknowledge the pieces you extracted, then ask only the missing ones.

## Step 2 — Adaptive Q&A (max 8 questions)

Cover these dimensions, skipping any the user already answered. Prefer `AskUserQuestion` for structured choices; use plain chat for open-ended answers.

1. **Target user** — who is this for? One sentence. ("Home cooks who already share recipes informally with friends.")
2. **Core problem** — what pain or desire does this address? ("Recipe sharing via screenshots and text messages loses formatting and photos.")
3. **MVP scope** — what does v0.1 need to do? Phrase as a short scenario: "A user can …" The answer defines the smallest useful slice.
4. **Feature backlog** — ask for 3–7 features in one-line form. If the user is stuck, propose a candidate list based on what you already heard and let them prune/add.
5. **Out-of-scope** — what are you NOT building in v0.1? This is often more useful than the "in scope" list. Ask: "what's an obvious adjacent feature we're going to resist building in the first release?"
6. **Constraints** — timeline pressure? Budget? Required integrations (maps, payments, calendar, etc.)? Any deployment target beyond web + Android + iOS?
7. **Monetization hint (optional)** — free forever, subscription, one-time, ads? Don't push if the user says they don't know yet.
8. **Product name + one-line tagline** — if the user hasn't provided one, ask. If they can't decide, suggest two options and let them pick.

Keep each question short. Do not ask multi-part questions. If a user answer raises a new question you genuinely need, you can go up to 10 — but the ceiling exists for a reason. This is brainstorming, not an RFP.

## Step 3 — Draft the brief

Synthesize the answers into this exact structure (markdown):

```markdown
# <Product Name>

> <One-line tagline>

## Description

<One paragraph elevator pitch — who it's for, what problem it solves, how. 3–5 sentences.>

## Target user

<1–2 sentences naming the specific user segment, not a generic "everyone."><
Include one concrete example persona if it clarifies things.>

## MVP feature backlog

1. <Feature name> — <one-line description of what it does>
2. <Feature name> — <one-line description>
3. ...

<3–7 items. Each feature is something the user can do in the app. Not "authentication" (infrastructure) — things like "browse recipes", "upload a photo", "follow a friend".>

## Out of scope (v0.1)

- <adjacent feature explicitly deferred>
- <another>
- ...

## Constraints

- <e.g., Deploy to Fly.io by end of Q2>
- <e.g., Must integrate with Google Calendar>
- <Any other explicit constraint the user flagged>

## Open questions

- <anything the Q&A didn't resolve — leave these for the user to answer later>
- <examples: "monetization TBD", "do we need offline support?", "which map provider?">
```

If any section has no content, include it with `_(none yet)_` so the structure is preserved for later editing.

## Step 4 — Present and approve

Show the full draft to the user in-chat. Ask: "Ready to write this to `IDEA.md`, or want to change anything?"

Wait for explicit approval. Common edits at this stage:
- Trimming the feature backlog from 9 items to 5
- Reordering features by priority
- Moving something from "MVP" to "out of scope" or vice versa
- Sharpening the target user from "professionals" to "freelance photographers with 1–3 active clients"

Do not write until the user says "yes" / "approved" / "go". "Looks good so far" is not approval.

## Step 5 — Write IDEA.md

Write the approved brief to `IDEA.md` at the repo root. Do not modify any other file.

## Step 6 — Hand off

After writing, report:
1. File written: `IDEA.md` at repo root.
2. Feature count in the backlog.
3. The next command the user should run. Two cases:
   - **Template still pristine** (Triplane still owns the codebase — `com.priorli.triplane` still present in `mobile/` or `web/`): suggest `/init-app` to bootstrap the downstream project from this brief.
   - **Template already initialized** (running `/ideate` inside an already-bootstrapped app to brainstorm a second round of features): suggest `/feature add <slug>` for the first backlog item, one at a time.

Use a grep for `com.priorli.triplane` in `mobile/` + `web/` to decide which case you're in.

## Critical reminders

- **Do not touch PLAN.md, README.md, CLAUDE.md, or any source files.** The brief lives only in `IDEA.md`.
- **Do not draft feature specs** (`specs/features/*.md`). That's `/feature add`'s job.
- **Do not run `bin/init.sh`.** That's `/init-app`'s job.
- **Do not expand the backlog yourself.** If the user says 3 features, ship 3. Don't helpfully add 4 more.
- **Do not guess monetization or target users if the user is uncertain.** Leave the open question in the brief. Honest uncertainty beats confident fiction.
- **Do not push the user toward a particular product shape.** Your job is to capture their idea, not rewrite it.

## Files this skill touches

- **Writes:** `IDEA.md` at repo root
- **Reads:** `IDEA.md` (if it already exists, to decide overwrite/append/abort), `PLAN.md` / `CLAUDE.md` (only to check whether the template has been initialized via grep for `com.priorli.triplane`)
- **Never modifies:** `PLAN.md`, `README.md`, `CLAUDE.md`, `mobile_plan.md`, `LESSONS.md`, `specs/**`, or any source files

## Related skills

- `/init-app` — the natural next step on a pristine template clone. Consumes `IDEA.md` and bootstraps the downstream project (wraps `bin/init.sh`, rewrites docs, resets the feature matrix, loops `/feature add`).
- `/feature add` — the natural next step on an already-initialized app. Use it once per MVP backlog item to draft a per-feature spec.
- `/scaffold` — runs after `/feature add` to generate file stubs for a single feature.

## When not to use this skill

- The user asks to spec a single feature on an existing app. Point them at `/feature add <slug>`.
- The user has a specific implementation question (not a product question). Answer directly; don't detour through a brief.
- The user wants to rewrite `IDEA.md` because they're pivoting. That's a valid re-run — proceed, but ask "overwrite or append?" before writing.
- The template has already been initialized AND the user already has an `IDEA.md` with a full backlog. Point them at `/feature add` for the next feature.
