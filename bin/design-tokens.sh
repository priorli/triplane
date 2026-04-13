#!/usr/bin/env bash
#
# Triplane design tokens — regenerate platform outputs from design/tokens.json.
#
# Input:  design/tokens.json
# Output: web/src/app/generated/tokens.css
#         mobile/composeApp/src/commonMain/kotlin/com/priorli/triplane/common/theme/DesignTokens.kt
#
# The generator derives the full color palette (light + dark) from a single
# `brand` OKLch triplet in tokens.json + a fixed neutral gray scale + a fixed
# destructive red. Typography, radius, and spacing pass through.
#
# Deterministic: running twice produces zero git diff. No timestamps, no
# randomness, jq output is sorted where order matters.
#
# Dependencies: bash 4+, jq. `brew install jq` if missing.

set -euo pipefail

# --- Resolve paths relative to repo root -------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

TOKENS_JSON="design/tokens.json"
WEB_OUT="web/src/app/generated/tokens.css"

if [[ ! -f "$TOKENS_JSON" ]]; then
    echo "Error: $TOKENS_JSON not found. Run from repo root." >&2
    exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
    echo "Error: jq is required. Install with 'brew install jq' on macOS." >&2
    exit 1
fi

# --- Derive namespace from mobile/composeApp/build.gradle.kts ---------------
# The Kotlin output path and `package` declaration must track the current
# project namespace. The namespace is authoritative in composeApp's
# build.gradle.kts (`namespace = "com.myorg.myapp"`), which `bin/init.sh`
# rewrites during downstream bootstrap. Reading it here keeps this script
# honest across renames — see the `v0.2.x` note in PLAN.md for context.
COMPOSE_APP_GRADLE="mobile/composeApp/build.gradle.kts"
if [[ ! -f "$COMPOSE_APP_GRADLE" ]]; then
    echo "Error: $COMPOSE_APP_GRADLE not found. Run from repo root." >&2
    exit 1
fi
NAMESPACE=$(sed -nE 's/.*namespace *= *"([^"]+)".*/\1/p' "$COMPOSE_APP_GRADLE" | head -1)
if [[ -z "$NAMESPACE" ]]; then
    echo "Error: could not read 'namespace = \"...\"' from $COMPOSE_APP_GRADLE." >&2
    exit 1
fi
# Use `tr` instead of `${NAMESPACE//./\/}` — macOS bash 3.2 preserves the
# replacement's `\` literally, producing `com\/priorli\/x` with backslashes.
# `tr` is portable and correct.
NAMESPACE_PATH=$(printf '%s' "$NAMESPACE" | tr '.' '/')
KOTLIN_OUT="mobile/composeApp/src/commonMain/kotlin/${NAMESPACE_PATH}/common/theme/DesignTokens.kt"

# --- Font filename constants -------------------------------------------------
# When swapping fonts, update these along with the TTF files under
# mobile/composeApp/src/commonMain/composeResources/font/.
#
# Nunito ships as a single variable-weight TTF (the square-bracket notation is
# Google Fonts' convention for variable axes). Compose Multiplatform's Font()
# factory accepts a FontWeight parameter that selects the weight axis at
# render time — so we reference the same `nunito` resource four times with
# different weights rather than shipping four separate files.
#
# Geist Mono ships as per-weight static TTFs, so we reference each weight's
# own file.
FONT_SANS="nunito"
FONT_MONO_REGULAR="geistmono_regular"
FONT_MONO_BOLD="geistmono_bold"

# --- Read brand from tokens.json --------------------------------------------
# Force all brand numeric values to have a decimal point so they interpolate
# into Kotlin as Double literals, not Int literals. (Kotlin doesn't auto-promote
# Int to Double and `colorFromOklch` takes Double.)
as_double() {
    case "$1" in
        *.*) printf "%s" "$1" ;;
        *)   printf "%s.0" "$1" ;;
    esac
}
BRAND_L=$(as_double "$(jq -r '.brand.L' "$TOKENS_JSON")")
BRAND_C=$(as_double "$(jq -r '.brand.C' "$TOKENS_JSON")")
BRAND_H=$(as_double "$(jq -r '.brand.h' "$TOKENS_JSON")")

# --- Optional accent color (schema extension) -------------------------------
# `accent` is an optional second brand hue for emphasis/CTA variants.
# If present in tokens.json, the generator emits a real accent color in CSS
# and maps it to Material 3's `secondary` / `onSecondary` slots in Compose.
# If absent, the CSS aliases `--color-accent` to `--muted` (shadcn default)
# and Compose's `secondary` falls back to Material 3's default derivation.
HAS_ACCENT=$(jq 'has("accent")' "$TOKENS_JSON")
if [[ "$HAS_ACCENT" == "true" ]]; then
    ACCENT_L=$(as_double "$(jq -r '.accent.L' "$TOKENS_JSON")")
    ACCENT_C=$(as_double "$(jq -r '.accent.C' "$TOKENS_JSON")")
    ACCENT_H=$(as_double "$(jq -r '.accent.h' "$TOKENS_JSON")")
fi

SANS_FAMILY=$(jq -r '.typography.fontFamily.sans' "$TOKENS_JSON")
MONO_FAMILY=$(jq -r '.typography.fontFamily.mono' "$TOKENS_JSON")

# --- Derive dark-mode brand lightness ----------------------------------------
# Formula: dark_L = clamp(1 - brand_L + 0.7, 0, 0.97)
# Rationale: mirror the brand across L=0.5 and shift toward the bright end so
# it reads as "same hue, inverted depth" rather than "completely different color".
BRAND_L_DARK=$(awk -v l="$BRAND_L" 'BEGIN {
    v = 1.0 - l + 0.7
    if (v < 0)    v = 0
    if (v > 0.97) v = 0.97
    printf "%.4f", v
}')

# --- Derive brandForeground lightness (light + dark mode) --------------------
# High brand lightness → dark foreground (near-black). Low brand lightness →
# light foreground (near-white). Threshold at L=0.5.
brand_foreground_l() {
    awk -v l="$1" 'BEGIN { printf "%.3f", (l > 0.5) ? 0.145 : 0.985 }'
}
BRAND_FG_L_LIGHT=$(brand_foreground_l "$BRAND_L")
BRAND_FG_L_DARK=$(brand_foreground_l "$BRAND_L_DARK")

if [[ "$HAS_ACCENT" == "true" ]]; then
    ACCENT_L_DARK=$(awk -v l="$ACCENT_L" 'BEGIN {
        v = 1.0 - l + 0.7
        if (v < 0)    v = 0
        if (v > 0.97) v = 0.97
        printf "%.4f", v
    }')
    ACCENT_FG_L_LIGHT=$(brand_foreground_l "$ACCENT_L")
    ACCENT_FG_L_DARK=$(brand_foreground_l "$ACCENT_L_DARK")
fi

# --- OKLch string helper -----------------------------------------------------
oklch() {
    printf "oklch(%s %s %s)" "$1" "$2" "$3"
}

# --- Compose the full palette ------------------------------------------------
# Each entry: VAR_NAME LIGHT_OKLCH DARK_OKLCH
# The neutral palette is fixed pure gray (C=0, h=0) in v0.2. Only `brand` and
# `brandForeground` vary with the input; `destructive` is also fixed.

BRAND_LIGHT=$(oklch "$BRAND_L"      "$BRAND_C" "$BRAND_H")
BRAND_DARK=$(oklch "$BRAND_L_DARK"  "$BRAND_C" "$BRAND_H")
BRAND_FG_LIGHT=$(oklch "$BRAND_FG_L_LIGHT" 0 0)
BRAND_FG_DARK=$(oklch "$BRAND_FG_L_DARK"   0 0)

BACKGROUND_LIGHT=$(oklch 1        0 0)
BACKGROUND_DARK=$(oklch  0.145    0 0)
FOREGROUND_LIGHT=$(oklch 0.145    0 0)
FOREGROUND_DARK=$(oklch  0.985    0 0)
CARD_LIGHT=$(oklch       1        0 0)
CARD_DARK=$(oklch        0.205    0 0)
CARD_FG_LIGHT=$(oklch    0.145    0 0)
CARD_FG_DARK=$(oklch     0.985    0 0)
MUTED_LIGHT=$(oklch      0.97     0 0)
MUTED_DARK=$(oklch       0.269    0 0)
MUTED_FG_LIGHT=$(oklch   0.556    0 0)
MUTED_FG_DARK=$(oklch    0.708    0 0)
BORDER_LIGHT=$(oklch     0.922    0 0)
BORDER_DARK=$(oklch      0.269    0 0)
DESTRUCTIVE_LIGHT="oklch(0.577 0.245 27.325)"
DESTRUCTIVE_DARK="oklch(0.704 0.191 22.216)"
DESTRUCTIVE_FG_LIGHT=$(oklch 0.985 0 0)
DESTRUCTIVE_FG_DARK=$(oklch  0.985 0 0)

if [[ "$HAS_ACCENT" == "true" ]]; then
    ACCENT_LIGHT=$(oklch "$ACCENT_L"      "$ACCENT_C" "$ACCENT_H")
    ACCENT_DARK=$(oklch  "$ACCENT_L_DARK" "$ACCENT_C" "$ACCENT_H")
    ACCENT_FG_LIGHT=$(oklch "$ACCENT_FG_L_LIGHT" 0 0)
    ACCENT_FG_DARK=$(oklch  "$ACCENT_FG_L_DARK"  0 0)
fi

# --- Read the typography scale as shell-friendly strings --------------------
# jq -r outputs one line per scale entry: "<name> <size> <weight> <lineHeight>"
TYPO_SCALE=$(jq -r '
    .typography.scale |
    to_entries |
    sort_by(.key) |
    .[] |
    "\(.key) \(.value.size) \(.value.weight) \(.value.lineHeight)"
' "$TOKENS_JSON")

# --- Read radius + spacing scales -------------------------------------------
RADIUS_SCALE=$(jq -r '
    .radius | to_entries | sort_by(.key) | .[] | "\(.key) \(.value)"
' "$TOKENS_JSON")

SPACING_SCALE=$(jq -r '
    .spacing | to_entries | sort_by(.key) | .[] | "\(.key) \(.value)"
' "$TOKENS_JSON")

# --- Ensure output directories exist ----------------------------------------
mkdir -p "$(dirname "$WEB_OUT")"
mkdir -p "$(dirname "$KOTLIN_OUT")"

# --- Emit web/src/app/generated/tokens.css ----------------------------------
{
cat <<EOF
/* GENERATED FILE — DO NOT EDIT BY HAND.
 * Source:   design/tokens.json
 * Generator: bin/design-tokens.sh
 *
 * To change tokens: edit design/tokens.json, then run ./bin/design-tokens.sh
 * and commit both files.
 *
 * globals.css imports this file AFTER its own @import "tailwindcss", so we
 * don't re-import Tailwind here.
 */

@theme inline {
  /* Colors — light mode (via :root; .dark overrides below) */
  --color-brand: var(--brand);
  --color-brand-foreground: var(--brand-foreground);
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-border: var(--border);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);

  /* shadcn aliases so existing components (Button, Card, etc.) keep working
   * with their semantic class names (bg-primary, text-primary-foreground, …). */
  --color-primary: var(--brand);
  --color-primary-foreground: var(--brand-foreground);
  --color-secondary: var(--muted);
  --color-secondary-foreground: var(--muted-foreground);
  --color-accent: var(--muted);
  --color-accent-foreground: var(--muted-foreground);
  --color-popover: var(--card);
  --color-popover-foreground: var(--card-foreground);
  --color-input: var(--border);
  --color-ring: var(--brand);

  /* Font families — reference CSS variables set up by next/font/google in
   * web/src/app/[locale]/layout.tsx. To change the font, edit both the
   * layout.tsx next/font loader AND tokens.json (the font-family name must
   * match so the generated variable name matches the layout's setup).
   */
  --font-sans: var(--font-$(printf %s "$SANS_FAMILY" | tr '[:upper:] ' '[:lower:]-'));
  --font-mono: var(--font-$(printf %s "$MONO_FAMILY" | tr '[:upper:] ' '[:lower:]-'));

EOF

# Typography scale
while read -r name size weight lineHeight; do
    [[ -z "$name" ]] && continue
    echo "  --text-${name}: ${size}px;"
    echo "  --text-${name}--line-height: ${lineHeight}px;"
    echo "  --text-${name}--font-weight: ${weight};"
done <<< "$TYPO_SCALE"

echo ""
echo "  /* Radius scale */"
while read -r name value; do
    [[ -z "$name" ]] && continue
    echo "  --radius-${name}: ${value}px;"
done <<< "$RADIUS_SCALE"

echo ""
echo "  /* Spacing scale (additions to Tailwind's built-in spacing) */"
while read -r name value; do
    [[ -z "$name" ]] && continue
    echo "  --spacing-${name}: ${value}px;"
done <<< "$SPACING_SCALE"

cat <<EOF
}

/* Light-mode color values */
:root {
  --brand: $BRAND_LIGHT;
  --brand-foreground: $BRAND_FG_LIGHT;
  --background: $BACKGROUND_LIGHT;
  --foreground: $FOREGROUND_LIGHT;
  --card: $CARD_LIGHT;
  --card-foreground: $CARD_FG_LIGHT;
  --muted: $MUTED_LIGHT;
  --muted-foreground: $MUTED_FG_LIGHT;
  --border: $BORDER_LIGHT;
  --destructive: $DESTRUCTIVE_LIGHT;
  --destructive-foreground: $DESTRUCTIVE_FG_LIGHT;
}

/* Dark-mode color values */
.dark {
  --brand: $BRAND_DARK;
  --brand-foreground: $BRAND_FG_DARK;
  --background: $BACKGROUND_DARK;
  --foreground: $FOREGROUND_DARK;
  --card: $CARD_DARK;
  --card-foreground: $CARD_FG_DARK;
  --muted: $MUTED_DARK;
  --muted-foreground: $MUTED_FG_DARK;
  --border: $BORDER_DARK;
  --destructive: $DESTRUCTIVE_DARK;
  --destructive-foreground: $DESTRUCTIVE_FG_DARK;
}
EOF

# Optional accent color — emit additional @theme inline alias override +
# :root / .dark blocks only when .accent is present in tokens.json. Appending
# extra CSS rules is safe: later :root/.dark selectors merge with earlier ones,
# and the @theme override wins via source order.
if [[ "$HAS_ACCENT" == "true" ]]; then
cat <<EOF

/* Accent (schema extension — present when tokens.json has an .accent triplet) */
@theme inline {
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
}
:root {
  --accent: $ACCENT_LIGHT;
  --accent-foreground: $ACCENT_FG_LIGHT;
}
.dark {
  --accent: $ACCENT_DARK;
  --accent-foreground: $ACCENT_FG_DARK;
}
EOF
fi
} > "$WEB_OUT"

# --- Emit DesignTokens.kt ---------------------------------------------------
# The Kotlin output has to convert OKLch to sRGB ARGB long at runtime because
# Compose Color() takes sRGB. The conversion happens once at first access via
# lazy val, not per frame. The helper lives in this generated file rather than
# in Theme.kt so edits to the generator don't silently break color accuracy.

{
# Heredoc is UNQUOTED so `$NAMESPACE` interpolates in the `package` line.
# Nothing else in this block contains `$` or backticks, so unquoting is safe.
cat <<EOF
// GENERATED FILE — DO NOT EDIT BY HAND.
// Source:    design/tokens.json
// Generator: bin/design-tokens.sh
//
// To change tokens: edit design/tokens.json, then run ./bin/design-tokens.sh
// and commit both files.

package ${NAMESPACE}.common.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.sin
import org.jetbrains.compose.resources.Font
import triplanemobile.composeapp.generated.resources.Res
EOF

# Font references
cat <<EOF
import triplanemobile.composeapp.generated.resources.${FONT_SANS}
import triplanemobile.composeapp.generated.resources.${FONT_MONO_REGULAR}
import triplanemobile.composeapp.generated.resources.${FONT_MONO_BOLD}

EOF

cat <<'EOF'
// --- OKLch → sRGB ARGB conversion --------------------------------------------
// Based on the formulas from https://bottosson.github.io/posts/oklab/ —
// OKLch → OKLab → linear sRGB → gamma-compressed sRGB → 0xAARRGGBB long.
internal fun oklchToArgb(l: Double, c: Double, hDeg: Double): Long {
    val hRad = hDeg * (kotlin.math.PI / 180.0)
    val a = c * cos(hRad)
    val b = c * sin(hRad)

    val lL = (l + 0.3963377774 * a + 0.2158037573 * b).pow(3.0)
    val mL = (l - 0.1055613458 * a - 0.0638541728 * b).pow(3.0)
    val sL = (l - 0.0894841775 * a - 1.2914855480 * b).pow(3.0)

    var r =  4.0767416621 * lL - 3.3077115913 * mL + 0.2309699292 * sL
    var g = -1.2684380046 * lL + 2.6097574011 * mL - 0.3413193965 * sL
    var bc = -0.0041960863 * lL - 0.7034186147 * mL + 1.7076147010 * sL

    // Gamma-compress linear sRGB
    fun encode(v: Double): Double =
        if (v <= 0.0031308) 12.92 * v
        else 1.055 * v.pow(1.0 / 2.4) - 0.055

    r = encode(r).coerceIn(0.0, 1.0)
    g = encode(g).coerceIn(0.0, 1.0)
    bc = encode(bc).coerceIn(0.0, 1.0)

    val ri = (r * 255.0 + 0.5).toInt()
    val gi = (g * 255.0 + 0.5).toInt()
    val bi = (bc * 255.0 + 0.5).toInt()
    return 0xFF000000L or (ri.toLong() shl 16) or (gi.toLong() shl 8) or bi.toLong()
}

internal fun colorFromOklch(l: Double, c: Double, h: Double): Color =
    Color(oklchToArgb(l, c, h))

EOF

# Emit color schemes — light + dark. Split into pre-error / optional accent /
# error-to-close so we can inject M3 `secondary` / `onSecondary` slots from
# the optional `accent` token without duplicating the heredoc.
cat <<EOF
// --- Color schemes -----------------------------------------------------------

internal val LightColorScheme = lightColorScheme(
    primary = colorFromOklch($BRAND_L, $BRAND_C, $BRAND_H),
    onPrimary = colorFromOklch($BRAND_FG_L_LIGHT, 0.0, 0.0),
    background = colorFromOklch(1.0, 0.0, 0.0),
    onBackground = colorFromOklch(0.145, 0.0, 0.0),
    surface = colorFromOklch(1.0, 0.0, 0.0),
    onSurface = colorFromOklch(0.145, 0.0, 0.0),
    surfaceVariant = colorFromOklch(0.97, 0.0, 0.0),
    onSurfaceVariant = colorFromOklch(0.556, 0.0, 0.0),
    outline = colorFromOklch(0.922, 0.0, 0.0),
EOF
if [[ "$HAS_ACCENT" == "true" ]]; then
cat <<EOF
    secondary = colorFromOklch($ACCENT_L, $ACCENT_C, $ACCENT_H),
    onSecondary = colorFromOklch($ACCENT_FG_L_LIGHT, 0.0, 0.0),
EOF
fi
cat <<EOF
    error = colorFromOklch(0.577, 0.245, 27.325),
    onError = colorFromOklch(0.985, 0.0, 0.0),
)

internal val DarkColorScheme = darkColorScheme(
    primary = colorFromOklch($BRAND_L_DARK, $BRAND_C, $BRAND_H),
    onPrimary = colorFromOklch($BRAND_FG_L_DARK, 0.0, 0.0),
    background = colorFromOklch(0.145, 0.0, 0.0),
    onBackground = colorFromOklch(0.985, 0.0, 0.0),
    surface = colorFromOklch(0.205, 0.0, 0.0),
    onSurface = colorFromOklch(0.985, 0.0, 0.0),
    surfaceVariant = colorFromOklch(0.269, 0.0, 0.0),
    onSurfaceVariant = colorFromOklch(0.708, 0.0, 0.0),
    outline = colorFromOklch(0.269, 0.0, 0.0),
EOF
if [[ "$HAS_ACCENT" == "true" ]]; then
cat <<EOF
    secondary = colorFromOklch($ACCENT_L_DARK, $ACCENT_C, $ACCENT_H),
    onSecondary = colorFromOklch($ACCENT_FG_L_DARK, 0.0, 0.0),
EOF
fi
cat <<EOF
    error = colorFromOklch(0.704, 0.191, 22.216),
    onError = colorFromOklch(0.985, 0.0, 0.0),
)

EOF

# Font families
cat <<EOF
// --- Font families -----------------------------------------------------------
//
// Nunito is a variable-weight TTF — Compose picks the axis position from the
// FontWeight argument at render time. Geist Mono ships as static per-weight
// files.

@Composable
internal fun triplaneSansFamily(): FontFamily = FontFamily(
    Font(Res.font.${FONT_SANS}, FontWeight.Normal),
    Font(Res.font.${FONT_SANS}, FontWeight.Medium),
    Font(Res.font.${FONT_SANS}, FontWeight.SemiBold),
    Font(Res.font.${FONT_SANS}, FontWeight.Bold),
)

@Composable
internal fun triplaneMonoFamily(): FontFamily = FontFamily(
    Font(Res.font.${FONT_MONO_REGULAR}, FontWeight.Normal),
    Font(Res.font.${FONT_MONO_BOLD},    FontWeight.Bold),
)

EOF

# Typography — emit each scale as a TextStyle
cat <<'EOF'
// --- Typography --------------------------------------------------------------

@Composable
internal fun triplaneTypography(): Typography {
    val sans = triplaneSansFamily()
    return Typography(
EOF

# Map token scale names to Material 3 Typography property names.
# Material 3 uses exactly these names; we pick a sensible subset matching the
# token scale in tokens.json. If tokens.json adds a scale name Material doesn't
# have (e.g. "caption"), that's a downstream design system extension; v0.2
# doesn't support it.
while read -r name size weight lineHeight; do
    [[ -z "$name" ]] && continue
    echo "        ${name} = TextStyle("
    echo "            fontFamily = sans,"
    echo "            fontSize = ${size}.sp,"
    echo "            lineHeight = ${lineHeight}.sp,"
    echo "            fontWeight = FontWeight(${weight}),"
    echo "        ),"
done <<< "$TYPO_SCALE"

cat <<'EOF'
    )
}

EOF

# Shapes
cat <<'EOF'
// --- Shapes (radius scale) ---------------------------------------------------

internal val TriplaneShapes = Shapes(
EOF

# jq emits in sort order. Material 3 Shapes has: extraSmall, small, medium,
# large, extraLarge. Map token radius names to those slots (sm→small, md→medium,
# lg→large, xl→extraLarge). Using jq lookups for bash-3.2 portability (macOS
# default bash doesn't support associative arrays).
RADIUS_SM=$(jq -r '.radius.sm // empty' "$TOKENS_JSON")
RADIUS_MD=$(jq -r '.radius.md // empty' "$TOKENS_JSON")
RADIUS_LG=$(jq -r '.radius.lg // empty' "$TOKENS_JSON")
RADIUS_XL=$(jq -r '.radius.xl // empty' "$TOKENS_JSON")
[[ -n "$RADIUS_SM" ]] && echo "    small = RoundedCornerShape(${RADIUS_SM}.dp),"
[[ -n "$RADIUS_MD" ]] && echo "    medium = RoundedCornerShape(${RADIUS_MD}.dp),"
[[ -n "$RADIUS_LG" ]] && echo "    large = RoundedCornerShape(${RADIUS_LG}.dp),"
[[ -n "$RADIUS_XL" ]] && echo "    extraLarge = RoundedCornerShape(${RADIUS_XL}.dp),"

cat <<'EOF'
)
EOF

} > "$KOTLIN_OUT"

# --- Emit design/tokens.dtcg.json (DTCG mirror) -----------------------------
# W3C Design Tokens Community Group mirror of the fully-expanded palette +
# typography + radius + spacing. Consumed by tools that speak DTCG (Tokens
# Studio in Figma, Style Dictionary).
#
# This is an OUTPUT, not an input. `design/tokens.json` stays the source of
# truth. `bin/tokens-pull.sh` (Phase B) reads an *incoming* DTCG file pushed
# by designers and writes back into tokens.json.
#
# Deterministic: jq sorts map entries by key (typography, radius, spacing)
# and `from_entries` preserves that order. Object literals preserve
# insertion order, so running twice yields byte-identical output.

DTCG_OUT="design/tokens.dtcg.json"

TYPO_SCALE_DTCG=$(jq '
    .typography.scale | to_entries | sort_by(.key) |
    map({
        key,
        value: {
            "size":       {"$value": "\(.value.size)px",       "$type": "dimension"},
            "weight":     {"$value": .value.weight,            "$type": "fontWeight"},
            "lineHeight": {"$value": "\(.value.lineHeight)px", "$type": "dimension"}
        }
    }) |
    from_entries
' "$TOKENS_JSON")

RADIUS_SCALE_DTCG=$(jq '
    .radius | to_entries | sort_by(.key) |
    map({key, value: {"$value": "\(.value)px", "$type": "dimension"}}) |
    from_entries
' "$TOKENS_JSON")

SPACING_SCALE_DTCG=$(jq '
    .spacing | to_entries | sort_by(.key) |
    map({key, value: {"$value": "\(.value)px", "$type": "dimension"}}) |
    from_entries
' "$TOKENS_JSON")

jq -n \
    --arg brand_light            "$BRAND_LIGHT" \
    --arg brand_dark             "$BRAND_DARK" \
    --arg brand_fg_light         "$BRAND_FG_LIGHT" \
    --arg brand_fg_dark          "$BRAND_FG_DARK" \
    --arg background_light       "$BACKGROUND_LIGHT" \
    --arg background_dark        "$BACKGROUND_DARK" \
    --arg foreground_light       "$FOREGROUND_LIGHT" \
    --arg foreground_dark        "$FOREGROUND_DARK" \
    --arg card_light             "$CARD_LIGHT" \
    --arg card_dark              "$CARD_DARK" \
    --arg card_fg_light          "$CARD_FG_LIGHT" \
    --arg card_fg_dark           "$CARD_FG_DARK" \
    --arg muted_light            "$MUTED_LIGHT" \
    --arg muted_dark             "$MUTED_DARK" \
    --arg muted_fg_light         "$MUTED_FG_LIGHT" \
    --arg muted_fg_dark          "$MUTED_FG_DARK" \
    --arg border_light           "$BORDER_LIGHT" \
    --arg border_dark            "$BORDER_DARK" \
    --arg destructive_light      "$DESTRUCTIVE_LIGHT" \
    --arg destructive_dark       "$DESTRUCTIVE_DARK" \
    --arg destructive_fg_light   "$DESTRUCTIVE_FG_LIGHT" \
    --arg destructive_fg_dark    "$DESTRUCTIVE_FG_DARK" \
    --arg sans                   "$SANS_FAMILY" \
    --arg mono                   "$MONO_FAMILY" \
    --argjson typo               "$TYPO_SCALE_DTCG" \
    --argjson radius             "$RADIUS_SCALE_DTCG" \
    --argjson spacing            "$SPACING_SCALE_DTCG" \
    '{
        "$description": "GENERATED from design/tokens.json by bin/design-tokens.sh. Edit the source, not this file. DTCG (W3C Design Tokens Community Group) mirror, consumable by Tokens Studio and Style Dictionary.",
        "color": {
            "light": {
                "brand":                 {"$value": $brand_light,          "$type": "color", "$description": "Primary brand color"},
                "brandForeground":       {"$value": $brand_fg_light,       "$type": "color"},
                "background":            {"$value": $background_light,     "$type": "color"},
                "foreground":            {"$value": $foreground_light,     "$type": "color"},
                "card":                  {"$value": $card_light,           "$type": "color"},
                "cardForeground":        {"$value": $card_fg_light,        "$type": "color"},
                "muted":                 {"$value": $muted_light,          "$type": "color"},
                "mutedForeground":       {"$value": $muted_fg_light,       "$type": "color"},
                "border":                {"$value": $border_light,         "$type": "color"},
                "destructive":           {"$value": $destructive_light,    "$type": "color"},
                "destructiveForeground": {"$value": $destructive_fg_light, "$type": "color"}
            },
            "dark": {
                "brand":                 {"$value": $brand_dark,           "$type": "color"},
                "brandForeground":       {"$value": $brand_fg_dark,        "$type": "color"},
                "background":            {"$value": $background_dark,      "$type": "color"},
                "foreground":            {"$value": $foreground_dark,      "$type": "color"},
                "card":                  {"$value": $card_dark,            "$type": "color"},
                "cardForeground":        {"$value": $card_fg_dark,         "$type": "color"},
                "muted":                 {"$value": $muted_dark,           "$type": "color"},
                "mutedForeground":       {"$value": $muted_fg_dark,        "$type": "color"},
                "border":                {"$value": $border_dark,          "$type": "color"},
                "destructive":           {"$value": $destructive_dark,     "$type": "color"},
                "destructiveForeground": {"$value": $destructive_fg_dark,  "$type": "color"}
            }
        },
        "typography": {
            "fontFamily": {
                "sans": {"$value": $sans, "$type": "fontFamily"},
                "mono": {"$value": $mono, "$type": "fontFamily"}
            },
            "scale": $typo
        },
        "radius":  $radius,
        "spacing": $spacing
    }' > "$DTCG_OUT"

# Optional accent — second pass that merges accent entries into both color
# blocks. Kept separate to keep the base jq expression narrow and to make the
# accent path trivially no-op when .accent is absent.
if [[ "$HAS_ACCENT" == "true" ]]; then
    jq \
        --arg al  "$ACCENT_LIGHT" \
        --arg ad  "$ACCENT_DARK" \
        --arg afl "$ACCENT_FG_LIGHT" \
        --arg afd "$ACCENT_FG_DARK" \
        '
        .color.light += {
            "accent":           {"$value": $al,  "$type": "color", "$description": "Accent brand color (schema extension)"},
            "accentForeground": {"$value": $afl, "$type": "color"}
        }
        | .color.dark += {
            "accent":           {"$value": $ad,  "$type": "color"},
            "accentForeground": {"$value": $afd, "$type": "color"}
        }
        ' "$DTCG_OUT" > "$DTCG_OUT.tmp"
    mv "$DTCG_OUT.tmp" "$DTCG_OUT"
fi

echo "✓ Regenerated design tokens"
echo "  → $WEB_OUT"
echo "  → $KOTLIN_OUT"
echo "  → $DTCG_OUT"
