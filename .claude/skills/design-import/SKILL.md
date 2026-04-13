---
name: design-import
description: Use this skill when the user wants to import design tokens from Figma / Tokens Studio into the Triplane codebase. Triggers on phrases like "import Figma tokens", "pull design tokens", "sync tokens from Tokens Studio", "update tokens from design", "designer pushed new tokens", "the Figma has been updated". Wraps `bin/tokens-pull.sh` + regeneration + build verification. For screenshot-based or URL-based design inspiration (no Figma involved), use `/design-study` instead. For schema extensions (new color beyond brand, new scale entry), also use `/design-study`.
invocable: true
---

# Design import — pull Tokens Studio changes into the codebase

The primary way external designs reach Triplane: a designer edits tokens in Figma via the [Tokens Studio](https://tokens.studio) plugin, pushes through its Git sync, and the developer pulls here.

This skill is a thin wrapper around `bin/tokens-pull.sh` — it runs the pull, reads the output, handles warnings, runs build verification, and leaves the user ready to commit.

## Invariants

1. **One brand, derived rest.** The Triplane schema has a single `brand` OKLch triplet and derives everything else (muted, border, destructive, dark mode) via formulas in `bin/design-tokens.sh`. Incoming DTCG files that set arbitrary `muted` / `border` / etc. get their non-brand colors silently ignored — the tool warns, not errors. If the designer truly wants a new color, that goes through `/design-study` (schema extension), not through this skill.
2. **Incoming file is transient.** `design/tokens.dtcg.incoming.json` is the handoff file. It can be `.gitignore`d or committed — project choice. The skill reads it once and leaves regenerated outputs committed.
3. **Never skip build verification.** Tokens touch both web (Tailwind `@theme inline`) and mobile (Compose `ColorScheme` / `Typography` / `Shapes`). A token change that compiles on web can still break Kotlin/Native iOS framework linking. Always run `/release-check` after the pull.

## Step 1 — Verify the incoming file

```bash
ls -la design/tokens.dtcg.incoming.json
```

If the file is missing: the designer hasn't pushed yet, or the Tokens Studio Git sync isn't configured. Ask the user to confirm the plugin has pushed to this path. Do not proceed without it.

## Step 2 — Run the pull

```bash
./bin/tokens-pull.sh
```

Capture the script's output. It prints:
- `brand: L=… C=… h=…` — the new brand OKLch that was adopted.
- `fonts: sans=… mono=…` — the new font families.
- A `⚠️ N warning(s)` block if any non-expressible fields were in the incoming file.
- The regeneration output from `bin/design-tokens.sh`.

## Step 3 — Handle warnings

If warnings appeared, summarize them to the user in plain language. For each class of warning, offer a concrete next step:

- **"non-brand light-mode colors ignored"** — the designer set e.g. `muted` or `destructive` to a custom value. Ask: *"The designer set a custom `<field>` color. Want to extend the schema to support a separate `<field>` token (runs `/design-study`), or leave it derived from brand?"*
- **"color.dark.* entries ignored"** — the designer overrode dark-mode manually. Explain that our dark mode is derived via an L-flip formula from light brand, so the override is deliberately ignored. Ask if the formula needs revisiting (unlikely, but record the request).
- **"typography.scale.X ignored"** — a scale entry we don't support (e.g. `caption`, `display2`). Extending requires updating `design/tokens.schema.json` + `bin/design-tokens.sh` + the Compose `Typography` slot map. Route through `/design-study`.
- **"radius.X ignored"** — same story as scale; our `Shapes` has `small`/`medium`/`large`/`extraLarge` slots only.

If there are NO warnings, skip this step.

## Step 4 — Review the diff

Show the user the summary of changes:

```bash
git diff --stat design/tokens.json design/tokens.dtcg.json web/src/app/generated/tokens.css mobile/composeApp/src/commonMain/kotlin/<ns>/common/theme/DesignTokens.kt
```

*(Derive `<ns>` from `mobile/composeApp/build.gradle.kts`'s `namespace = "…"` — the same way `bin/design-tokens.sh` does.)*

Remind the user that the **first-ever pull** may show a large `design/tokens.json` diff due to jq reformatting (compact-one-liner → pretty-multiline). That's a one-time migration cost; subsequent pulls produce minimal diffs.

## Step 5 — Build verification

Run `/release-check` — it executes the three build verifications in parallel (web `bun run build`, Android `:composeApp:assembleDebug`, iOS `:composeApp:linkDebugFrameworkIosSimulatorArm64`) plus `/audit` for drift.

**Do not declare success on type-check alone.** A token change that renames e.g. `--color-brand` will typecheck-green but runtime-break components that hardcode the old variable name. The real verification is that all three builds complete.

## Step 6 — Offer to commit

End with a suggested commit message, but **do not commit automatically** — the user decides:

```
Import tokens from Figma (<short description — brand hue shift / type scale change / etc.>)

Pulled via bin/tokens-pull.sh from design/tokens.dtcg.incoming.json.
Regenerated web/src/app/generated/tokens.css + Compose DesignTokens.kt.
```

If the user confirms, stage and commit:
```bash
git add design/tokens.json design/tokens.dtcg.json web/src/app/generated/tokens.css mobile/composeApp/src/commonMain/kotlin/*/common/theme/DesignTokens.kt
git commit ...
```

Mention that `design/tokens.dtcg.incoming.json` can be gitignored or committed — ask the user's project preference the first time this skill runs; record the answer in CLAUDE.md if relevant.

## Files this skill touches

- **Reads:** `design/tokens.dtcg.incoming.json`
- **Runs:** `bin/tokens-pull.sh` (which calls `bin/design-tokens.sh`)
- **Writes (via the scripts above):** `design/tokens.json`, `design/tokens.dtcg.json`, `web/src/app/generated/tokens.css`, `mobile/composeApp/src/commonMain/kotlin/<ns>/common/theme/DesignTokens.kt`
- **Never edits directly:** generator scripts, schema file, components.

## Related skills

- `/design-study` — vision-driven import: drop screenshots / URLs / prose prompts, get a proposed design-system evolution. Handles schema extensions (new colors, new scale entries). Use when the input is not a Tokens Studio export.
- `/release-check` — the post-import verification gate. Must pass before declaring done.
- `/audit` — drift check. Not strictly required for token imports (tokens don't appear in the feature matrix) but cheap to run.
