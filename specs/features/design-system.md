# Design system

## Description

Single source of truth for colors, typography, spacing, and radii — drives both the Next.js web app and the Compose Multiplatform mobile app from one hand-edited JSON file. The designer picks **one brand color** in `design/tokens.json`; the generator (`bin/design-tokens.sh`) derives the full palette from it + a fixed neutral scale + a fixed destructive red, then emits two committed outputs: a Tailwind 4 `@theme` block on web and a Kotlin `DesignTokens.kt` file on mobile. Dark mode supported from day one on both platforms. Custom fonts (Nunito + Geist Mono) are bundled cross-platform via `composeResources` so Android and iOS share the same typography as web. Existing feature code (Items + Photos) is not rewritten — shadcn and Material 3 components already reference tokens through semantic names, so updating the tokens restyles them automatically.

A lightweight **design showcase** surface on both platforms — one page on web (`/design`), one screen on mobile reachable from HomeScreen — exercises every token as a visual-regression guard and as a reference for downstream consumers.

## Pressure-tested decisions

1. **Token source format**: hand-edited `design/tokens.json` + bash generator using `jq`. No Style Dictionary, no build-time plugin. Zero tool dependencies for downstream consumers beyond `jq` (commonly installed, `brew install jq` otherwise).
2. **Generated outputs are committed to git** — `bun run build` and `xcodebuild build` don't need the generator in their path. Regeneration is explicit and happens only when the designer edits `tokens.json` or adds/replaces font binaries.
3. **Components stay native** — shadcn on web, Material 3 on mobile. The design system defines tokens, not a parallel component library. shadcn already reads `--primary` / `--muted` semantic CSS variables; Compose already reads `MaterialTheme.colorScheme.primary` — token updates propagate for free.
4. **Dark mode from day one** on both platforms. Every derived color token has `light` and `dark` values. Web gets a visible header toggle via `next-themes`. Mobile follows `isSystemInDarkTheme()` (no in-app toggle in v0.2 — that's a one-screen change later).
5. **Brand-driven derivation**: the designer sets `brand` in `tokens.json` as one OKLch value. Everything else (background, foreground, card, cardForeground, muted, mutedForeground, border, brandForeground, destructive, destructiveForeground) is derived algorithmically by the generator, in both light and dark modes. Default brand is neutral gray (`L: 0.205, C: 0, h: 0`) — Triplane-as-canvas. Downstream consumers pick their real brand by editing exactly one value.
6. **Typography**: Nunito (sans) + Geist Mono (mono), loaded on web via `next/font/google` and on mobile via `composeResources/font/*.ttf`. Compose Resources handles Android and iOS transparently — no Android XML font resource, no iOS Info.plist `UIAppFonts` entry, no pbxproj edit. Font TTFs are committed under OFL 1.1 with `OFL.txt` alongside.
7. **Items UI is not rewritten** — it already reads `MaterialTheme.colorScheme.*` and shadcn semantic classes. Verification is visual: after the swap, Items renders identically in light mode and cleanly in dark mode.
8. **Feature folder convention extends to design** — `mobile/.../feature/design/` follows the same shape as `feature/items/`. All types are `internal` per Phase 7's ObjC-exporter workaround (see `LESSONS.md` § "Kotlin/Native ObjC exporter crashes on certain composeApp public types").

## Token schema

`design/tokens.json` ships with a minimal, opinionated shape:

```json
{
  "$schema": "./tokens.schema.json",
  "brand": { "L": 0.205, "C": 0, "h": 0 },
  "typography": {
    "fontFamily": {
      "sans": "Nunito",
      "mono": "Geist Mono"
    },
    "scale": {
      "displayLarge":  { "size": 57, "weight": 400, "lineHeight": 64 },
      "headlineLarge": { "size": 32, "weight": 400, "lineHeight": 40 },
      "titleLarge":    { "size": 22, "weight": 500, "lineHeight": 28 },
      "bodyLarge":     { "size": 16, "weight": 400, "lineHeight": 24 },
      "bodyMedium":    { "size": 14, "weight": 400, "lineHeight": 20 },
      "labelMedium":   { "size": 12, "weight": 500, "lineHeight": 16 }
    }
  },
  "radius":  { "sm": 4, "md": 8, "lg": 12, "xl": 16 },
  "spacing": { "1": 4, "2": 8, "3": 12, "4": 16, "6": 24, "8": 32 }
}
```

### Color derivation rules

Given `brand = { L: B_L, C: B_C, h: B_h }`, the generator emits:

| Output token | Light mode | Dark mode |
|---|---|---|
| `brand` | `oklch(B_L B_C B_h)` | `oklch(clamp(1 - B_L + 0.7, 0, 0.97) B_C B_h)` |
| `brandForeground` | `oklch(B_L > 0.5 ? 0.145 : 0.985, 0, 0)` | mirrors light computation with dark L |
| `background` | `oklch(1 0 0)` | `oklch(0.145 0 0)` |
| `foreground` | `oklch(0.145 0 0)` | `oklch(0.985 0 0)` |
| `card` | `oklch(1 0 0)` | `oklch(0.205 0 0)` |
| `cardForeground` | `oklch(0.145 0 0)` | `oklch(0.985 0 0)` |
| `muted` | `oklch(0.97 0 0)` | `oklch(0.269 0 0)` |
| `mutedForeground` | `oklch(0.556 0 0)` | `oklch(0.708 0 0)` |
| `border` | `oklch(0.922 0 0)` | `oklch(0.269 0 0)` |
| `destructive` | `oklch(0.577 0.245 27.325)` | `oklch(0.704 0.191 22.216)` |
| `destructiveForeground` | `oklch(0.985 0 0)` | `oklch(0.985 0 0)` |

The neutral palette is **fixed pure gray** (chroma 0) in v0.2. Hue-tinted neutrals are a v0.3 upgrade (see Out of scope).

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

## Generator contract

`bin/design-tokens.sh`:
- Reads `design/tokens.json` with `jq`
- Computes the derived palette (both modes) using the rules above
- Emits `web/src/app/generated/tokens.css` — a `@theme inline` block
- Emits `mobile/composeApp/src/commonMain/kotlin/com/priorli/triplane/common/theme/DesignTokens.kt` — `internal val LightColorScheme`, `internal val DarkColorScheme`, `internal val TriplaneTypography`, `internal val TriplaneShapes`
- The Kotlin output includes a small `oklchToArgb(L, C, h): Long` helper that converts OKLch → sRGB ARGB at runtime (Compose `Color` takes sRGB). This is the only non-trivial math in the pipeline; it lives in the generated file so edits to the generator don't silently break it
- Idempotent — running twice produces zero git diff

## Web Implementation

**New files**
- `design/tokens.json` — source of truth
- `design/README.md` — schema docs, regen workflow, derivation rules, font swap instructions, v0.3 skill hint
- `bin/design-tokens.sh` — generator
- `web/src/app/generated/tokens.css` — committed `@theme inline` block
- `web/src/components/theme-provider.tsx` — thin wrapper around `next-themes` `ThemeProvider`
- `web/src/components/theme-toggle.tsx` — header toggle (light / dark / system)
- `web/src/app/[locale]/(app)/design/page.tsx` — showcase page (Client Component)

**Modified files**
- `web/src/app/[locale]/layout.tsx` — mount `ThemeProvider` with `attribute="class"`, `defaultTheme="system"`; `next/font/google` loads Nunito + Geist Mono (if not already present)
- `web/src/app/[locale]/(app)/layout.tsx` — add `ThemeToggle` to header + a "Design" nav link alongside Home and Items
- `web/src/app/globals.css` — `@import "./generated/tokens.css";` at the top, remove the hardcoded OKLch duplicates from `:root` and `.dark`
- `web/src/messages/en-US/common.json` — new keys: `nav.design`, `design.*`, `theme.light`, `theme.dark`, `theme.system`

## Mobile Implementation

**New files (source)**
- `mobile/composeApp/src/commonMain/kotlin/com/priorli/triplane/common/theme/DesignTokens.kt` — committed generator output (see Generator contract)
- `mobile/composeApp/src/commonMain/kotlin/com/priorli/triplane/feature/design/DesignShowcaseScreen.kt` — `internal` showcase screen

**New files (resources)**
- `mobile/composeApp/src/commonMain/composeResources/font/nunito.ttf` — Nunito variable font (referenced 4× with `FontWeight.Normal`/`Medium`/`SemiBold`/`Bold`)
- `mobile/composeApp/src/commonMain/composeResources/font/geistmono_regular.ttf` (weight 400)
- `mobile/composeApp/src/commonMain/composeResources/font/geistmono_bold.ttf` (weight 700)
- `design/FONT-LICENSES.txt` — SIL Open Font License 1.1 with Nunito + Geist Mono copyright notices. **Kept outside `composeResources/font/`** because any file in that directory is exposed as a compose resource — a text license file would generate a spurious `Res.font.OFL` binding.

**Modified files**
- `mobile/composeApp/src/commonMain/kotlin/com/priorli/triplane/common/theme/Theme.kt` — import `DesignTokens.kt`; `TriplaneTheme(content: @Composable () -> Unit)` picks `LightColorScheme` or `DarkColorScheme` based on `isSystemInDarkTheme()`; passes `TriplaneTypography` and `TriplaneShapes` to `MaterialTheme(...)`. `TriplaneTypography` uses `FontFamily(Font(Res.font.nunito_regular), Font(Res.font.nunito_bold, FontWeight.Bold), ...)` — compose-resources handles Android + iOS automatically.
- `mobile/composeApp/src/commonMain/kotlin/com/priorli/triplane/navigation/Routes.kt` — add `@Serializable object DesignShowcase`
- `mobile/composeApp/src/commonMain/kotlin/com/priorli/triplane/navigation/NavGraph.kt` — add `composable<DesignShowcase>`
- `mobile/composeApp/src/commonMain/kotlin/com/priorli/triplane/feature/home/HomeScreen.kt` — add a "Design showcase" Card between the Items card and the sign-out button

**Not touched**
- `feature/items/*` — stays. Visual check after swap verifies tokens propagated.
- `common/MapColors.kt` — stays. Index-based categorical palette, orthogonal to design system.
- Swift code under `iosApp/` — no design changes in v0.2.
- iOS Info.plist `UIAppFonts` — **not** needed. Compose Resources bundles fonts into the framework binary; they're available to Compose without registration.
- pbxproj — no changes. Fonts are in the Kotlin framework, not the Xcode target resources.

## Showcase content (both platforms, ~200 LOC each)

Four sections, one scrollable view:

1. **Colors** — one swatch per token showing name + light value + dark value. Toggle the platform's dark mode and watch the palette rotate.
2. **Typography** — "The quick brown fox jumps over the lazy dog" rendered in every scale from `displayLarge` to `labelMedium`, labeled.
3. **Radii** — four rounded squares at `sm` / `md` / `lg` / `xl`, labeled.
4. **Sample components** — `Button` (default + destructive variants), `Card`, `Input`, dialog trigger. Proves shadcn and Material 3 components inherit tokens correctly.

Deliberately plain — a diagnostic, not a pitch. Deletable by downstream consumers who don't want it.

## Architectural principles touched

Proposed new principle #17 in `PLAN.md`:

> **Design tokens are a single source of truth.** Edit `design/tokens.json`, run `./bin/design-tokens.sh`, commit both the source and the generated files. The generator is deterministic and idempotent — running it twice produces zero git diff.

Phase 7's `internal`-visibility rule (LESSONS.md § "Kotlin/Native ObjC exporter crashes") extends to `feature/design/*` files.

## Verification

- `bash -n bin/design-tokens.sh` — syntax check
- `./bin/design-tokens.sh` once — produces both generated files
- `./bin/design-tokens.sh` twice — git shows zero diff on the second run (idempotent)
- `cd web && bun run build` — Tailwind consumes the generated `@theme` block; no unresolved CSS custom properties; `/design` route builds
- `cd mobile && ./gradlew :composeApp:assembleDebug` — Android builds with bundled fonts
- `cd mobile && ./gradlew :composeApp:linkDebugFrameworkIosSimulatorArm64` — iOS framework link (catches any ObjC exporter regression from the new types — use `link` not `compile` per Phase 7 lesson)
- **Visual check on existing Items UI**: open `/items` on web in light + dark; open Items list on Android emulator/simulator in both modes. Items should render correctly without any source changes.
- **Visual check on the showcase**: open `/design` on web + `DesignShowcase` on mobile in both modes. Every swatch, type scale, radius, and sample component looks right.
- **Brand swap test**: edit `design/tokens.json` `brand` from `{ L: 0.205, C: 0, h: 0 }` (gray) to `{ L: 0.55, C: 0.20, h: 250 }` (blue), rerun `./bin/design-tokens.sh`, rebuild both platforms. Every button, FAB, focus ring, and the showcase's `brand` swatch should turn blue. Revert the file after the test. Proves the derivation pipeline works end-to-end.

## Out of scope for v0.2

- **`/design-tokens` or `/rebrand` skill (v0.3)**: an interactive skill that prompts for a brand color (accepts OKLch, hex, or named colors), optionally generates hue-tinted neutrals, previews the palette in a temporary HTML file, and commits the regenerated tokens. The scaffolding from v0.2 (tokens.json schema, bash generator, Kotlin `oklchToArgb` helper) is the substrate the skill builds on.
- **Hue-tinted neutrals**: `background`/`muted`/`border` picking up a hint of the brand hue. v0.3.
- **In-app dark mode toggle on mobile**. System preference only in v0.2.
- **Elevation / shadow tokens**. Material 3 defaults in v0.2.
- **Per-component theming** (e.g., `button.borderRadius` overriding the global `radius.md`). Add only if actually needed.
- **Sidebar / chart token variants** from shadcn's `globals.css`. Keep them as shadcn-specific for now; promote to shared tokens only when mobile grows a sidebar or chart surface.
- **Font swaps via `tokens.json`** alone — font NAMES are in tokens.json but the TTF binaries must be swapped manually in `composeResources/font/`. Documented in `design/README.md`.
- **Showcase localization**. English-only in v0.2.

## Status
- [x] `design/tokens.json` + `design/README.md` authored
- [x] `bin/design-tokens.sh` generator written + idempotent
- [x] Web: `generated/tokens.css` consumed by `globals.css`
- [x] Web: `next-themes` provider + header toggle wired
- [x] Web: `/design` showcase page
- [x] Mobile: fonts committed to `composeResources/font/`
- [x] Mobile: `DesignTokens.kt` generated + consumed by `Theme.kt` with dark-mode branching
- [x] Mobile: `DesignShowcaseScreen.kt` + navigation + HomeScreen link
- [x] PLAN.md feature matrix row + decisions log entry + principle #17
- [x] Spec synced with OpenAPI docs _(N/A — no API changes)_
