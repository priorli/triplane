# Design tokens

Single source of truth for Triplane's colors, typography, spacing, and radii across **both** the Next.js web app (`web/`) and the Compose Multiplatform mobile app (`mobile/composeApp/`). One hand-edited JSON file drives two generated outputs — a Tailwind 4 `@theme` block on web and a Kotlin `DesignTokens.kt` file on mobile.

## Files

- **`tokens.json`** — hand-edited source of truth.
- **`README.md`** — this file.
- **`../bin/design-tokens.sh`** — deterministic, idempotent bash generator. Reads `tokens.json`, emits both platform outputs.
- **`../web/src/app/generated/tokens.css`** — generated, committed. A Tailwind 4 `@theme inline` block with OKLch color CSS custom properties, font family references, radius scale, and spacing scale. Imported at the top of `web/src/app/globals.css`.
- **`../mobile/composeApp/src/commonMain/kotlin/com/priorli/triplane/common/theme/DesignTokens.kt`** — generated, committed. Contains `internal val LightColorScheme`, `internal val DarkColorScheme`, `internal val TriplaneTypography`, `internal val TriplaneShapes`, and a small `oklchToArgb(L, C, h): Long` conversion helper.

Both generated files are committed to git. `bun run build` and `xcodebuild build` do NOT depend on the generator — they consume the already-generated files. The generator only runs when a designer edits `tokens.json` or swaps font binaries.

## Workflow — how to change the design

### Change the brand color (most common)

Open `tokens.json`, edit exactly one value:

```json
"brand": { "L": 0.55, "C": 0.20, "h": 250 }
```

That's an OKLch triplet:
- **L** — lightness, 0.0 (pure black) to 1.0 (pure white). A "brand" color typically sits between 0.40 and 0.65.
- **C** — chroma (colorfulness), 0.0 (gray) to ~0.4. A vivid brand color is around 0.15–0.25.
- **h** — hue angle in degrees, 0–360. Examples: 0 red, 30 orange, 60 yellow, 120 green, 180 cyan, 250 blue, 300 purple, 340 pink.

Then regenerate:

```bash
./bin/design-tokens.sh
```

Both `web/src/app/generated/tokens.css` and `mobile/.../DesignTokens.kt` update. Every `Button`, FAB, focus ring, primary link, and card accent now pick up the new color — without touching any feature code. Commit the three files (`tokens.json`, the generated CSS, the generated Kotlin) together.

### Derivation rules — what the generator computes from `brand`

The neutral palette is **fixed pure gray** (chroma 0) in v0.2. The brand color drives only the `brand` and `brandForeground` tokens. Everything else is a neutral lookup. This is intentionally conservative — most apps look better with a single accent color against neutral surroundings than with a fully brand-tinted palette.

| Output token | Light mode | Dark mode |
|---|---|---|
| `brand` | `oklch(B_L B_C B_h)` | `oklch(clamp(1 - B_L + 0.7, 0, 0.97) B_C B_h)` |
| `brandForeground` | `oklch(B_L > 0.5 ? 0.145 : 0.985, 0, 0)` | mirrors with dark `B_L` |
| `background` | `oklch(1 0 0)` | `oklch(0.145 0 0)` |
| `foreground` | `oklch(0.145 0 0)` | `oklch(0.985 0 0)` |
| `card` | `oklch(1 0 0)` | `oklch(0.205 0 0)` |
| `cardForeground` | `oklch(0.145 0 0)` | `oklch(0.985 0 0)` |
| `muted` | `oklch(0.97 0 0)` | `oklch(0.269 0 0)` |
| `mutedForeground` | `oklch(0.556 0 0)` | `oklch(0.708 0 0)` |
| `border` | `oklch(0.922 0 0)` | `oklch(0.269 0 0)` |
| `destructive` | `oklch(0.577 0.245 27.325)` | `oklch(0.704 0.191 22.216)` |
| `destructiveForeground` | `oklch(0.985 0 0)` | `oklch(0.985 0 0)` |

### Platform mapping

| Output token | shadcn (web) | Material 3 (mobile) |
|---|---|---|
| `brand` | `--primary` | `primary` |
| `brandForeground` | `--primary-foreground` | `onPrimary` |
| `background` | `--background` | `background` |
| `foreground` | `--foreground` | `onBackground` |
| `card` | `--card` | `surface` |
| `cardForeground` | `--card-foreground` | `onSurface` |
| `muted` | `--muted` | `surfaceVariant` |
| `mutedForeground` | `--muted-foreground` | `onSurfaceVariant` |
| `border` | `--border` | `outline` |
| `destructive` | `--destructive` | `error` |
| `destructiveForeground` | `--destructive-foreground` | `onError` |

### Change the typography scale

Edit `tokens.json` `typography.scale`. Each scale entry is `{ size, weight, lineHeight }` where `size` and `lineHeight` are in sp/px and `weight` is 100–900. The generator emits identical values to both platforms.

Scale names follow Material 3 conventions so Compose's `Typography(...)` constructor accepts them directly. Tailwind on web receives them as CSS `--text-<name>-*` custom properties.

### Change the font family

Step 1: Edit `tokens.json` `typography.fontFamily.sans` (or `.mono`) to the new font name.

Step 2: Replace the font binaries on mobile. The TTFs live at:

```
mobile/composeApp/src/commonMain/composeResources/font/
├── nunito_regular.ttf        (weight 400)
├── nunito_medium.ttf         (weight 500)
├── nunito_semibold.ttf       (weight 600)
├── nunito_bold.ttf           (weight 700)
├── geistmono_regular.ttf     (weight 400)
├── geistmono_bold.ttf        (weight 700)
└── OFL.txt                   (SIL Open Font License 1.1 — ships with both fonts)
```

Delete the old files, drop in the new ones, name them `<fontname>_regular.ttf` / `<fontname>_bold.ttf` / etc. Compose Resources auto-generates `Res.font.<fontname>_<weight>` accessors from the filenames.

Step 3: Update the generator's Kotlin output to reference the new filenames. This is one `sed`-friendly change in `bin/design-tokens.sh` — the `FONT_REGULAR` and `FONT_BOLD` variables near the top of the script.

Step 4: On web, if the font isn't on Google Fonts or already bundled, update `web/src/app/[locale]/layout.tsx` to load it via `next/font/google` or `next/font/local`.

Step 5: Regenerate (`./bin/design-tokens.sh`) and rebuild both platforms.

Fonts are not in `tokens.json` as binaries because binaries don't belong in JSON. `tokens.json` declares the font NAMES; the TTFs are separate committed files.

### Change a radius or spacing value

Edit `tokens.json`, regenerate, commit. Mobile reads them as `Dp` values in `TriplaneShapes`; web reads them as CSS custom properties in `@theme`.

## Verification after any change

Run the three-build contract:

```bash
cd web && bun run build
cd mobile && ./gradlew :composeApp:assembleDebug
cd mobile && ./gradlew :composeApp:linkDebugFrameworkIosSimulatorArm64
```

**Use `linkDebugFrameworkIosSimulatorArm64`, not `compileKotlinIosSimulatorArm64`.** The compile-only task skips the ObjC header exporter and can silently green while the framework link fails. The link task is the verification bar. See `LESSONS.md` § "Build verification practices" for the why.

Visual check: open `/design` on web and the Design showcase screen on mobile. Every swatch, type scale, radius, and sample component should look right in both light and dark modes.

Idempotency check:

```bash
./bin/design-tokens.sh
git diff --stat
./bin/design-tokens.sh
git diff --stat  # should be identical — zero new changes
```

## Future work — v0.3 skill

A future `/design-tokens` or `/rebrand` skill will wrap this workflow interactively: prompt for a brand color (accepts OKLch, hex, or named colors), optionally generate hue-tinted neutrals (vs. the fixed gray neutrals of v0.2), preview the palette in a temporary HTML file, and commit the regenerated tokens. The scaffolding in v0.2 — `tokens.json` schema, bash generator, Kotlin `oklchToArgb` helper — is the substrate the skill will build on.
