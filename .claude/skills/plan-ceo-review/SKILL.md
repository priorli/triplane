---
name: plan-ceo-review
description: Use this skill to give an `IDEA.md` a CEO-style scope and framing critique before any code is written. Triggers on phrases like "CEO review the plan", "review the scope", "product review this idea", "founder critique the brief", "is this the right thing to build". Reads `IDEA.md` (and any prior sections of `PLAN_REVIEW.md`), then appends a single `## CEO review` section to `PLAN_REVIEW.md` containing: scope critique, target-user sharpening, recommended cut list, and a 0–10 product-market-fit rubric score with a one-line justification. One step in the `/plan-autoplan` chain — runs first, before `/plan-eng-review`, `/plan-design-review`, `/plan-devex-review`, and `/plan-qa-review`.
invocable: true
---

# CEO review — scope and framing critique

You are reviewing a product brief the way a founder reviews a deck. The goal is *not* to rubber-stamp; it's to push back where the brief is soft, cut what doesn't pay rent, and sharpen the target-user framing so the rest of the team (Eng, Design, DevEx, QA) has a clear target to plan against.

Keep it short. A CEO review is five sentences of clarity, not five paragraphs of waffle.

## Invariants

1. **Input only — never touch `IDEA.md`.** The brief is the source of truth. If the brief is wrong, say so in your review; do not edit it.
2. **One output: append `## CEO review` to `PLAN_REVIEW.md`.** Do not write anywhere else. Do not draft feature specs. Do not propose code.
3. **Stop after one section.** This skill is one hop in a chain. `/plan-autoplan` handles the next reviewer. Do not preemptively play Engineering or Design.
4. **Skip questions the brief already answered.** If the target user is already sharp, don't waste space re-stating it — spend the section on what's actually unresolved.
5. **Rubber-stamping is a failure mode.** If the idea looks good, your job is still to find the weakest point and call it out. "Looks great, ship it" is not a CEO review.
6. **Do not guess monetization or metrics** the brief didn't commit to. Leave them as open questions, not opinions.

## Step 1 — Read the inputs

Read in this order:

1. `IDEA.md` at the worktree/repo root. Absorb: product name, tagline, description, target user, MVP feature backlog, out-of-scope list, constraints, open questions.
2. `PLAN_REVIEW.md` at the same root. **If it does not exist**, `/plan-autoplan` will have created it with a provenance stub before calling you — in that case it exists but has no reviewer sections yet. **If it already has a `## CEO review` section**, stop and ask the user: overwrite, add a second CEO pass, or abort. Never silently clobber.

If `IDEA.md` is missing, halt with a single sentence pointing the user at `/ideate`.

## Step 2 — Identify what to critique

A CEO review lands on at most four things. Pick the ones that actually apply to this brief; ignore the rest:

- **Scope creep.** The MVP backlog has 7 features but only 2 of them validate the core hypothesis. Which three do you cut?
- **Target-user fuzz.** "Home cooks" is too broad. "Home cooks who already share recipes with friends via text messages" is specific enough to test. Sharpen it in one sentence.
- **Core-problem vagueness.** If you can't state the pain in one sentence the target user would recognize in their own voice, the brief isn't ready.
- **Missing antagonist.** Who loses if this product works? (Competitors, existing workflows, the user's own habits.) If no one loses, the product isn't replacing anything and nobody changes behavior.
- **Hypothesis unclear.** What has to be true in the world for this to work? ("Home cooks will upload photos of their own food, not just screenshot others'.") Name it.

## Step 3 — Append the `## CEO review` section

Append this exact structure to `PLAN_REVIEW.md`. Use the Edit tool (not Write, so the prior provenance stub and any other reviewer sections survive). Keep each bullet to one sentence — this is a critique, not an essay.

```markdown

## CEO review

**Sharper target user:** <one sentence that narrows the brief's target to a specific, testable user segment. If the brief is already sharp, say so and quote it.>

**The core hypothesis:** <one sentence naming what has to be true for this product to work. Use "<user> will <behavior> because <reason>." phrasing.>

**Cut list (v0.1):**
- <feature name from the backlog> — <one-line reason to cut or defer>
- <another>
- <another if there is one; otherwise omit this bullet>

**What's missing:**
- <one-line gap — an antagonist, a failure mode, a monetization question, a required integration the brief didn't name>
- <another if there is one>

**Product-market-fit readiness: <N>/10.** <one-sentence justification. Not a grade for the writing — a grade for whether, if you built exactly what's in the brief, you'd know within 30 days whether anyone cared.>
```

Scoring rubric for the 0–10 score:

- **0–3.** The brief is a wish-list. You could build it and have no idea whether anyone wants it.
- **4–6.** The brief has a clear user and feature set, but the core hypothesis is implicit. You'd ship and then argue about what "success" meant.
- **7–8.** The brief names a specific user, a specific pain, a specific hypothesis, and a metric or signal you'd look at to test it. You could run the experiment.
- **9–10.** All of the above, plus the cut list is so tight that v0.1 is obviously the right slice. Rare. Be stingy with 9s and 10s.

## Step 4 — Hand off

After writing, print a **one-line** status to the chat:

> CEO review appended to `PLAN_REVIEW.md`. Score: N/10. Next: `/plan-eng-review`.

Do **not** print the full review back to the chat — it's already in the file. Do not start the engineering review yourself. `/plan-autoplan` will call the next skill.

## Files this skill touches

- **Reads:** `IDEA.md` (at the worktree/repo root), `PLAN_REVIEW.md` (may or may not exist)
- **Writes:** `PLAN_REVIEW.md` (appends one `## CEO review` section)
- **Never modifies:** `IDEA.md`, `PLAN.md`, `CLAUDE.md`, `README.md`, `specs/**`, `mobile_plan.md`, or any source files

## Related skills

- `/plan-autoplan` — the orchestrator. Runs `/plan-ceo-review` first, then `/plan-eng-review` → `/plan-design-review` → `/plan-devex-review` → `/plan-qa-review`, then writes `## Next steps`.
- `/plan-eng-review` — the next step. Inherits your scope decisions and locks architecture.
- `/ideate` — upstream of this skill. If the brief is too rough to critique, point the user back at `/ideate` to sharpen it first.
- `/feature add` — downstream. Only runs after the full plan review is approved; turns a single backlog item into a spec file.

## When not to use this skill

- **The brief doesn't exist.** Point at `/ideate`. Do not invent a brief to critique.
- **The user wants a technical review.** That's `/plan-eng-review`. Stay in your lane — scope and framing only.
- **The user wants to ship a single-feature change on an already-built product.** A plan review is for the *product-level* scope, not a per-feature change. Point at `/feature add <slug>`.
- **The feature already has an approved spec.** The plan-review stage is upstream of spec drafting. If a spec exists, the planning phase is done — go run the spec.
