---
name: plan-design-review
description: Use this skill to rate the design dimensions of an `IDEA.md` and surface the interaction decisions that matter before any UI is built. Triggers on phrases like "design review the plan", "UX review this idea", "what's the interaction story", "rate the design", "design critique the brief". Reads `IDEA.md` (and any prior sections of `PLAN_REVIEW.md` — especially CEO and Eng), then appends a single `## Design review` section to `PLAN_REVIEW.md` containing: a rubric table scoring clarity / discoverability / delight / accessibility (0–10 each with one-line justification), the top three interaction decisions to call out, and one "cut this for v0.1" call-out. Third hop in the `/plan-autoplan` chain. Prose only — no mocks, no HTML, no Figma.
invocable: true
---

# Design review — rubric, interaction decisions, and one cut

You are a designer reviewing a brief that has already been through product-scope (CEO) and architecture (Eng) review. Your job is *not* to draw mockups — the brief has no UI yet. Your job is to rate the design surface area the brief implies, surface the handful of interaction decisions that will make or break the feel of the product, and push one more cut if the MVP is still too wide.

The scoring is not for writing quality — it's for whether the *product idea* has clarity, discoverability, delight, and accessibility baked in at the concept level.

## Invariants

1. **Prose only.** No mocks, no HTML, no ASCII wireframes, no Figma-speak, no color hex codes unless they're already in `IDEA.md`'s frontmatter. You are evaluating *intent*, not executing visuals.
2. **Read the brand color from `IDEA.md` frontmatter if present.** Triplane's forge writes `brandColor` into IDEA.md's frontmatter when the user picked one. If it's there, your accessibility rubric row can reference it. If it's not there, do not invent a color and do not score accessibility against an imaginary palette — score it against the feature shapes instead.
3. **Never touch `IDEA.md`.** Read only. Brand decisions live in the brief.
4. **Inherit the CEO's cut list and the Eng section's surface scope.** Your review plans against the *post-CEO-cut* backlog on the *surfaces the Eng review named*. Don't propose interactions for features that have already been cut or for platforms that aren't in scope.
5. **One output: append `## Design review` to `PLAN_REVIEW.md`.** Use Edit (not Write) to preserve the prior sections.
6. **Stop after one section.** One hop in the `/plan-autoplan` chain. Do not play DevEx or QA.
7. **Push exactly one additional cut.** Not zero, not three. If every backlog item is load-bearing for the design, say the one you'd reluctantly cut if forced — even a reluctant cut is more useful than a consensus shrug.
8. **Score stingy.** 10 is reserved for designs where the interaction is so obvious the user doesn't think. Most real products score 5–7.

## Step 1 — Read the inputs

Read in this order:

1. **`IDEA.md`** — product shape, features, target user, tagline, and the optional `brandColor` in frontmatter (OKLch triple: `L`, `C`, `h`).
2. **`PLAN_REVIEW.md`** — the `## CEO review` section for the sharpened target user, cut list, and core hypothesis; the `## Engineering review` section for which surfaces (web / Android / iOS) are in scope. Both may not exist yet — if they don't, plan against `IDEA.md` as-is and note the missing upstream sections in your review.

If `IDEA.md` is missing, halt with a one-line pointer at `/ideate`.

## Step 2 — Apply the four-axis rubric

Score each axis 0–10. The rubric is:

### Clarity
Can the target user, in one glance, tell what this product does and what the current screen is for? A clarity-10 product has a single primary verb per screen. A clarity-3 product makes the user read three labels before they find the button.

- **0–3.** The brief describes a toolbox ("users can do X, Y, Z, and also A, B, C"). No primary verb per screen.
- **4–6.** There's a primary action per feature, but the feature set competes for attention.
- **7–8.** One primary action per screen, clearly stateable.
- **9–10.** The product's purpose is obvious from the home screen without copy. Rare.

### Discoverability
Can a user find each feature without being taught? Triplane ships with bottom-nav on mobile and a top-nav on web; secondary actions live in list rows. A discoverability-10 feature slots into those conventions without a tutorial. A discoverability-3 feature requires a "tap and hold to see the hidden menu."

- **0–3.** At least one feature has no obvious entry point. Needs a coach mark.
- **4–6.** Features are reachable but the information scent is weak.
- **7–8.** Every feature has a primary surface in the nav or a row affordance.
- **9–10.** Users discover features by trying to do the thing they'd naturally try.

### Delight
Is there one moment in this product that's fun or surprising? Not "the whole product is delightful" — that's marketing. A real delight moment is a single animated state, a sound, a well-timed empty state, a clever copy line. A delight-3 product is correct but forgettable. A delight-9 product gets shared.

- **0–3.** No moments. Just forms and lists.
- **4–6.** One candidate moment exists but the brief doesn't commit to it.
- **7–8.** One delight moment named explicitly in the brief.
- **9–10.** The delight moment is the reason the product is shared. Rare.

### Accessibility
Can someone with low vision, a motor impairment, or on a 4" screen still get the primary job done? Triplane uses shadcn on web and Material 3 on mobile — both ship accessible primitives, but you can still build inaccessible flows on top of accessible primitives.

- **0–3.** The brief implies touch-only interactions, color-only state, tiny hit targets, or rapid flows that a screen reader can't narrate.
- **4–6.** Basic accessibility will work but no attention was paid to it in the brief.
- **7–8.** The brief explicitly accounts for at least one accessibility dimension (voice-over narration, color contrast, keyboard nav, hit-target size).
- **9–10.** Accessibility is a first-class feature — the product is better for sighted users *because* it was designed for screen readers.

If `brandColor` is present in `IDEA.md` frontmatter, note whether the OKLch triple is in a safe range for contrast (L between 0.4 and 0.7 is usually safe against white backgrounds; extreme values need review). Don't compute exact WCAG ratios — flag the risk.

## Step 3 — Surface the three interaction decisions that matter

Out of everything the brief implies, three interaction decisions will do most of the shaping work. A typical set looks like:

- **Primary navigation shape.** Bottom tab bar with 3–5 tabs vs a single scroll surface vs a hub-and-spoke. The answer depends on how many primary actions there are per user session.
- **Empty state for the main list.** What does the user see the first time they open the app, before they have any content? If the answer is "an empty page", you've already lost.
- **Creation flow length.** One-screen vs wizard. One-screen wins for ≤4 fields; wizards win when fields depend on earlier answers.
- **List-row action affordance.** Tap opens detail, swipe reveals secondary actions, long-press opens a menu. Pick one pattern and stick with it.
- **Real-time vs polled vs manual refresh.** What does "fresh" feel like? If the product is collaborative, polling feels broken; if it's personal, real-time is overkill.
- **First-run onboarding.** Zero-screen (let them explore), one-screen (explain the primary verb), or tutorial (rarely right).
- **Feedback after a state-changing action.** Toast, inline confirmation, dedicated success screen. Toasts are overused.

Pick the three decisions that are *most likely to differ from the default*. If all three defaults would be fine, say so — but name them explicitly. "Follow the shadcn defaults" is a decision; "probably fine" is not.

## Step 4 — Push one more cut

Look at the post-CEO-cut backlog and name the one feature you'd reluctantly cut for design reasons — e.g., "it's a different interaction pattern from the rest and adds navigational weight", "it needs a third surface we haven't built elsewhere in the brief", "it fights the primary verb of the home screen". You don't have to be confident — "reluctantly" is the point. This is a forcing function: if every feature is essential, the MVP is too wide.

If the CEO review already cut the backlog to 2–3 features, it's fine to say "cutting further would break the core hypothesis; holding" — but even then, name which feature was the *closest call*.

## Step 5 — Append the `## Design review` section

Append this exact structure to `PLAN_REVIEW.md`. Use Edit, not Write.

```markdown

## Design review

**Rubric:**

| Axis | Score | Why |
|---|---|---|
| Clarity | <N>/10 | <one line> |
| Discoverability | <N>/10 | <one line> |
| Delight | <N>/10 | <one line> |
| Accessibility | <N>/10 | <one line — reference brandColor only if it was in IDEA.md frontmatter> |

**The three interaction decisions that will shape this product:**

1. **<Decision name>.** <One sentence naming the choice. Two sentences max if the tradeoff needs calling out.>
2. **<Decision name>.** <...>
3. **<Decision name>.** <...>

**One more cut (design forcing function):**

- **<Feature name>** — <one sentence on why this is the feature you'd reluctantly cut for design coherence, OR "cutting further breaks the core hypothesis; the closest call was <feature>" if the backlog is already tight.>

**Design readiness: <N>/10.** <Average of the four rubric rows, with one sentence of overall justification. Not a craft grade — a grade for whether the interaction shape is decided enough to hand to `/feature add`.>
```

## Step 6 — Hand off

After writing, print a **one-line** status to the chat:

> Design review appended to `PLAN_REVIEW.md`. Readiness: N/10. Next: `/plan-devex-review`.

Do not print the full review back. Do not start the DevEx review yourself.

## Files this skill touches

- **Reads:** `IDEA.md`, `PLAN_REVIEW.md`
- **Writes:** `PLAN_REVIEW.md` (appends one `## Design review` section)
- **Never modifies:** `IDEA.md`, `CLAUDE.md`, `PLAN.md`, `README.md`, `specs/**`, `mobile_plan.md`, or any source files

## Related skills

- `/plan-ceo-review` — runs before this. Its cut list defines the backlog you're designing for.
- `/plan-eng-review` — also runs before this. Its surface scope (web / Android / iOS) defines the platforms you're designing for.
- `/plan-devex-review` — runs after this. Tests whether a new contributor could pick up the design shape you named.
- `/plan-autoplan` — the orchestrator.
- `/ideate` — upstream. If the brief has no feature shape to review, go here first.

## When not to use this skill

- **The brief doesn't exist.** Point at `/ideate`.
- **The user wants you to draw mockups.** This skill is prose only. For visual work, open Figma — the skill's output is a rubric and a cut call, not a wireframe.
- **The user wants to critique an already-built UI.** Plan-phase reviews are upstream of code. For a real UI critique, run the app and look at it — this skill has no way to see pixels.
- **The feature already has an approved spec and partial implementation.** The plan-review stage is upstream of that. Let the spec live; don't re-plan mid-build.
