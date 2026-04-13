---
name: design-study
description: Use this skill when the user wants to analyze reference designs (screenshots, URLs, Figma exports, or prose descriptions) and propose an evolution of Triplane's design system. Triggers on phrases like "study this design", "learn from this UI", "analyze these screenshots", "make our design more like X", "take inspiration from <app/URL>", "what can we adopt from this Figma frame", "extract tokens from this screenshot", "rebrand based on these references", "propose a design-system update". Accepts any combination of local image files, reference URLs (captured via headless browser), Figma share URLs / exported PNGs, and natural-language prompts. Produces `design/studies/<timestamp>/DESIGN_STUDY.md` with proposed token deltas + schema-extension proposals + new-component suggestions + accessibility checks. Read-only by default; `--apply` required to mutate. For exact-value imports from Tokens Studio use `/design-import` instead.
invocable: true
---

# Design study — vision-driven design-system evolution

Triplane's design system has a single brand OKLch triplet, a Material-3 typography scale, four radius slots, and a derived palette. This skill lets the user say *"here's a reference — evolve our design system toward it"* by dropping screenshots, URLs, Figma exports, or a description. Claude's vision reads the references, extracts estimated tokens, compares against the current state, and writes a proposal you approve before anything changes.

> The sister skill `/design-import` is for exact-value sync (designer edits in Figma via Tokens Studio → code). Use this one for **inspiration** when the designer is working visually, not in Tokens Studio.

## Invariants

1. **Read-only by default.** A bare invocation produces `DESIGN_STUDY.md` and nothing else. Mutations require the user to explicitly say so (or pass `--apply` after reviewing the report).
2. **Append-only history.** Studies live under `design/studies/<ISO-timestamp>/`. Never overwrite a prior study. The `sources/` subdirectory is gitignored (can get large with reference PNGs); the `DESIGN_STUDY.md` report is committed.
3. **Uncertainty is load-bearing.** OKLch estimates from a screenshot are approximate (±0.02 on L, ±5° on h, ±0.02 on C). Every proposed value includes a confidence note and is explicitly approximate. Never claim pixel-exact precision.
4. **Schema extensions are atomic.** When references imply a token Triplane's bespoke schema can't express (most common: a distinct `accent` color separate from `brand`), the extension edits `design/tokens.schema.json` + `bin/design-tokens.sh` + the Compose emitter in a single transaction. Partial application is never shipped; a build failure during `--apply` rolls all three files back via `git checkout`.
5. **One brand, one accent max.** The schema can grow from one derived color (`brand`) to two (`brand` + `accent`). Proposals for a *third* distinct color are rejected with a note explaining that three-color systems are out of scope for Triplane v0.3.
6. **Never touches `bin/init.sh`.** The schema-extension flow edits the generator and the schema; `bin/init.sh` is orthogonal.

## Step 1 — Clarify inputs

Ask the user to confirm or expand their inputs before analysis:

1. **Images.** List the local PNG/JPG/WebP files the user is referencing. If they gave none, ask.
2. **URLs.** If they listed URLs, check that `npx playwright` is available. If not, tell the user:
   > "Playwright isn't installed. To screenshot the URL I'd need `cd web && bun add -D @playwright/test && bunx playwright install chromium`. Want me to install it, or can you paste screenshots instead?"
3. **Figma.** If they gave a Figma share URL, check for `FIGMA_TOKEN` env var. If absent, tell them:
   > "A Figma API token isn't configured — I can't read private Figma files directly. Can you export the frame as PNG and drop it in, or is the file public and I can follow the URL?"
4. **Prose prompt.** Ask "anything describing the vibe you want?" (e.g. "Linear-like — dense, monochromatic, sharp corners"). Short prose dramatically improves analysis because it tells Claude what to weigh.
5. **Scope.** Ask which parts of the design system are in scope: *colors only*, *typography only*, *full rebrand*, or *new components*. Analysis depth scales with scope.

If the user already specified everything in the initial message, skip the clarification and proceed.

## Step 2 — Gather sources

Create `design/studies/<YYYY-MM-DDTHHMMSS>/sources/` and copy/capture inputs:

```bash
TIMESTAMP=$(date -u +%Y-%m-%dT%H%M%S)
STUDY_DIR="design/studies/$TIMESTAMP"
mkdir -p "$STUDY_DIR/sources"
```

- **Local images** — copy into `sources/` preserving filenames.
- **URLs** — if Playwright is available, capture three viewports (mobile 375×812, tablet 768×1024, desktop 1440×900):
  ```bash
  cat > "$STUDY_DIR/sources/.screenshot.ts" <<'TS'
  import { chromium } from 'playwright';
  const url = process.argv[2];
  const out = process.argv[3];
  const viewports = [
    { name: 'mobile',  width: 375,  height: 812 },
    { name: 'tablet',  width: 768,  height: 1024 },
    { name: 'desktop', width: 1440, height: 900 },
  ];
  (async () => {
    const browser = await chromium.launch();
    for (const v of viewports) {
      const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }});
      const page = await ctx.newPage();
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.screenshot({ path: `${out}/${v.name}.png`, fullPage: false });
      await ctx.close();
    }
    await browser.close();
  })();
  TS
  cd web && bunx tsx "../$STUDY_DIR/sources/.screenshot.ts" "<URL>" "../$STUDY_DIR/sources"
  ```
- **Figma public URL** — if the file is public, fetch the thumbnail PNG with the Figma Node API:
  ```bash
  curl -sL "https://api.figma.com/v1/images/<file-key>?ids=<node-id>&format=png&scale=2" \
       -H "X-Figma-Token: $FIGMA_TOKEN" \
       | jq -r '.images[]' \
       | xargs -I {} curl -sL {} -o "$STUDY_DIR/sources/figma_<node-id>.png"
  ```
- **Prose prompt** — write to `sources/prompt.md`.
- **URLs manifest** — write to `sources/urls.txt` so the study is reproducible.

## Step 3 — Analyze each source

For each image file, use the Read tool (which surfaces images directly to vision). Across the set, extract:

### 3a. Color palette
- **Top-5 dominant colors** per image. For each, estimate OKLch `(L, C, h)`. Use the perceptual lightness of the swatch, the saturation relative to pure gray, and the hue angle (0°=red, 30°=orange, 60°=yellow, 120°=green, 180°=cyan, 240°=blue, 300°=purple).
- **Semantic role**: which color is the PRIMARY brand (usually used for CTAs, links, accents), which is neutral (backgrounds/text), which is accent (secondary emphasis), which is destructive/warning.
- **Light vs dark mode**: are the references light-themed, dark-themed, or both?
- **Cross-reference consensus**: note where all 3 references agree on a color vs where they disagree. Report uncertainty (e.g. *"brand h ≈ 142° across all three refs — high confidence"* vs *"brand h ranges 240°–270° — one ref is bluer; low-confidence average 255°"*).

### 3b. Typography
- **Inferred font family** per image — match visible letter shapes against common webfonts. Common candidates: Inter, Geist, Manrope, DM Sans, Nunito (current), Poppins, IBM Plex Sans, SF Pro. Mono candidates: Geist Mono (current), JetBrains Mono, Fira Code, IBM Plex Mono.
- **Type scale samples** — measure pixel heights of visibly distinct text groups (headlines, body, captions). Report as estimated sp/px values, clearly approximate.
- **Weight range** — are headlines bold (700+), semibold (600), or display-thin (200–300)?

### 3c. Shape language
- **Corner radius class** — sharp (0–2px) / crisp (3–5px) / soft (6–10px) / rounded (11–16px) / pill (full rounding). Cite visible UI elements to justify.
- **Elevation / shadow depth** — flat (no shadows) / subtle (tight 1–3px y-offset) / prominent (loose 8–16px y-offset + blur).

### 3d. Density and spacing
- **Spacing scale inference** — is the grid tight (4/8/12/16) or loose (8/16/24/32)?
- **Density** — info-dense (Linear) / medium (Stripe) / airy (Apple).

### 3e. Component patterns
Look for common UI atoms that recur across references: bottom sheets, tab bars, segmented controls, card grids, avatar clusters, data tables, command menus, inline validation. Note which patterns appear in 2+ references (high signal) vs single (low signal).

## Step 4 — Cross-reference against current state

Read `design/tokens.json` and list current values. Read `design/tokens.schema.json` (if present — may only exist after a prior schema extension) to see the expressible shape. List existing `web/src/components/ui/*.tsx` for current component inventory.

Compute:
- **Delta per token** — proposed OKLch vs current, with a note on magnitude of change (≤0.02 L = subtle, >0.1 L = dramatic re-brand).
- **Out-of-schema needs** — references imply a color/scale/radius the bespoke schema can't hold. Flag each for schema extension (Step 5).
- **Gap components** — reference patterns that we don't have as primitives yet (e.g. BottomSheet, CommandMenu).

## Step 5 — Plan schema extensions (when needed)

If references imply tokens that can't be expressed in the current bespoke schema, draft an *atomic* extension plan. The most common case is adding `accent` as a second brand color:

### Extension plan template

```markdown
### Schema extension: `accent` color token

References consistently show a second emphatic color distinct from `brand`:
- `sources/linear.png` — brand=green for CTAs, accent=purple for highlights
- `sources/notion.png` — brand=black for CTAs, accent=blue for mentions
- `sources/stripe.png` — brand=indigo for CTAs, accent=orange for warnings

To adopt, we'd add one OKLch triplet to `design/tokens.json`:

```json
"accent": { "L": 0.60, "C": 0.15, "h": 290 }
```

And extend three files atomically:

1. **`design/tokens.schema.json`** — add an `accent` property alongside `brand`, same OKLch shape.
2. **`bin/design-tokens.sh`** — add:
   - `ACCENT_L/ACCENT_C/ACCENT_H` shell reads (mirror `BRAND_*`).
   - `ACCENT_LIGHT / ACCENT_DARK / ACCENT_FG_LIGHT / ACCENT_FG_DARK` derivations (mirror `BRAND_*`).
   - CSS: `--color-accent-brand / --color-accent-foreground` in `@theme inline` + `--accent-brand / --accent-foreground` in `:root` / `.dark`.
   - Kotlin: `secondary = colorFromOklch(accent…)` + `onSecondary = colorFromOklch(accentFg…)` in both `lightColorScheme` and `darkColorScheme`.
   - DTCG mirror: add `accent` / `accentForeground` alongside `brand` in both `color.light` and `color.dark` blocks.
3. **`bin/tokens-pull.sh`** — accept `.color.light.accent["$value"]` and parse to OKLch triplet like we do for brand.

Confidence the references support this: **high** (3/3 refs show distinct accent vs brand).
Estimated OKLch: **`L=0.60 ± 0.03, C=0.15 ± 0.04, h=290° ± 10°`**.

⚠️ **Approving this extension widens the template contract.** Downstream forks that have customized `bin/design-tokens.sh` will need to merge. Version-bump `tokens.schema.json` from the current `v0.2.x` implied shape to `v0.3.accent`.
```

Other common extensions (draft similar plans if the analysis calls for them):
- **Motion tokens** (`motion.duration.fast/base/slow`, `motion.easing.standard/accelerate/decelerate`) — needed if references show distinctive animation timing.
- **Elevation tokens** (`elevation.low/medium/high`) — needed if references are shadow-heavy (e.g. Material 3 outdoor, Apple-like depth).
- **A new typography scale slot** (e.g. `displayXL` for hero text larger than `displayLarge`).

## Step 6 — Write DESIGN_STUDY.md

Produce `design/studies/<timestamp>/DESIGN_STUDY.md` with these sections (in order):

```markdown
# Design study — <short title>

**Sources:** <image file list, URLs, Figma nodes>
**Prompt:** <prose summary, if provided>
**Scope:** <colors-only / typography-only / full rebrand / new components>
**Generated:** <ISO timestamp>

## Summary

<2–3 sentence TL;DR of the direction this study recommends>

## Token deltas

| Token | Current | Proposed | Δ | Confidence | Note |
|---|---|---|---|---|---|
| brand.L | 0.205 | 0.57 ±0.03 | +0.37 | high | Dramatic shift from near-black to mid-tone green |
| brand.C | 0 | 0.18 ±0.04 | +0.18 | high | Adding chroma — references are saturated |
| brand.h | 0 | 142° ±5° | +142° | high | Pure green consensus across 3 refs |
| fontFamily.sans | Nunito | Inter | — | medium | Only 2 of 3 refs use Inter; third is Geist |

## Schema extensions

<either a subsection per extension (see Step 5 template) or "None needed — current schema covers everything in the proposed delta">

## Component gaps

- **BottomSheet** — appears in all 3 refs as the primary mobile form pattern. Not in our library.
- **CommandMenu** — appears in 2 refs (Linear, Notion). Would pair with `/` keyboard shortcut.

## Accessibility spot-checks

- **Proposed brand on white:** contrast ratio 4.8:1 — **passes WCAG AA** for large text, borderline for body text.
- **Proposed brand on foreground:** 13.2:1 — **passes AAA**.
- **Accent on brand (if both adopted):** 2.1:1 — **FAILS** AA. If user still wants the pairing, accent should never be stacked directly on brand.

## Proposed diffs

<concrete patches, file-by-file, exactly as they'd apply>

### `design/tokens.json`

```json
{
  ...
  "brand": { "L": 0.57, "C": 0.18, "h": 142 },
  ...
}
```

### `bin/design-tokens.sh` (for schema extension, if any)

... (full diff) ...

### New components to scaffold

`web/src/components/ui/bottom-sheet.tsx` — wraps `@base-ui/react` Dialog with bottom anchoring. Adapted from shadcn/ui `sheet.tsx` @ <source commit SHA>.

`mobile/composeApp/src/commonMain/kotlin/<ns>/common/ui/BottomSheet.kt` — wraps Material 3 `ModalBottomSheet`.

## Apply

Once approved, run:

```bash
# Apply token diffs (safe — deterministic, reversible via git)
/design-study --apply design/studies/<timestamp>

# Or selectively — tokens only, skip schema extension:
/design-study --apply --tokens-only design/studies/<timestamp>
```

After apply:
- `./bin/design-tokens.sh` regenerates CSS + Kotlin + DTCG.
- `/release-check` verifies web + Android + iOS still build.
- If schema extension was applied, downstream forks get a migration note committed alongside the schema bump.
```

## Step 7 — When `--apply` is invoked

Only runs after the user has reviewed `DESIGN_STUDY.md` and explicitly asks to apply.

1. **Save a git stash / branch checkpoint** of the working tree in case rollback is needed.
2. **Apply token diffs** to `design/tokens.json`.
3. **Apply schema extensions** (if any) — edit `design/tokens.schema.json` + `bin/design-tokens.sh` + `bin/tokens-pull.sh` in one sequence.
4. **Run `./bin/design-tokens.sh`** — catches schema-extension shell bugs immediately.
5. **Run `/release-check`** — web build + Android build + iOS link + `/audit`. This is the gate.
6. **On any failure:**
   - Roll back with `git checkout -- <files changed in steps 2–3>`.
   - Report the failure and the rolled-back state.
   - Do NOT leave the tree in a half-applied state.
7. **On success:**
   - Stage and show the diff.
   - Offer a suggested commit message; do not commit automatically.

## Step 8 — When new components are proposed

Components are *suggestions* — the skill does NOT scaffold them automatically. The user runs `/feature add` or `/scaffold` separately (those skills own component creation).

This skill's job is to say *"based on the references, here's what's missing from the library"*, not to build them.

## Safeguards

- **No secret-only knowledge.** Vision estimates must be grounded in what's visible in the references. Never invent a hue that isn't in the image.
- **Confidence floors.** Never propose a change with "low" confidence unless the user has asked for "aggressive" analysis. Low-confidence findings go in a separate "Also noticed" section.
- **Never proposes removing Triplane invariants.** Can't propose removing dark-mode derivation, removing the two-platform generator, or going Android-only. These are load-bearing.
- **Schema extension is a one-way door within a study.** Once proposed, don't retract in the same study — the user approves or not.

## Files this skill touches

- **Reads:** `design/tokens.json`, `design/tokens.schema.json` (if present), `bin/design-tokens.sh`, `web/src/components/ui/*.tsx`, `web/package.json` (to check Playwright availability), user-supplied images, user-supplied URLs (via Playwright), Figma API (via `FIGMA_TOKEN`).
- **Creates (default mode):** `design/studies/<timestamp>/sources/**` (gitignored), `design/studies/<timestamp>/DESIGN_STUDY.md` (committed).
- **Writes (--apply mode only, with approval):** `design/tokens.json`, `design/tokens.schema.json`, `bin/design-tokens.sh`, `bin/tokens-pull.sh`, `design/tokens.dtcg.json` (via `design-tokens.sh`), `web/src/app/generated/tokens.css` (via `design-tokens.sh`), `mobile/composeApp/src/commonMain/kotlin/<ns>/common/theme/DesignTokens.kt` (via `design-tokens.sh`).
- **Never edits:** `bin/init.sh`, feature code under `web/src/app/**` or `mobile/composeApp/src/commonMain/kotlin/**/feature/**`. Component gaps are suggestions, not actions — the user dispatches to `/scaffold` or `/feature add` to build them.

## Related skills

- `/design-import` — sister skill for exact-value Figma sync via Tokens Studio. Use when the designer is in Figma, not using screenshots.
- `/release-check` — always run after `--apply`.
- `/audit` — unchanged by design-system changes, but cheap to run.
- `/scaffold` / `/feature add` — for building the component gaps this skill identifies.
