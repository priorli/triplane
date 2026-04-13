#!/usr/bin/env bash
#
# Triplane tokens pull — merge design/tokens.dtcg.incoming.json (DTCG file
# pushed by Tokens Studio) into design/tokens.json, then regenerate outputs.
#
# Workflow:
#   1. Designer edits tokens in Figma via Tokens Studio plugin.
#   2. Tokens Studio Git sync pushes DTCG JSON to
#      design/tokens.dtcg.incoming.json on a branch.
#   3. Developer runs: ./bin/tokens-pull.sh
#   4. Script extracts expressible fields (brand OKLch, font families,
#      typography scale, radius, spacing) back into design/tokens.json.
#   5. Script WARNS on non-expressible fields (manual overrides to derived
#      colors, dark-mode brand, extra scale names). Those are ignored — the
#      bespoke schema has one brand and derives the rest.
#   6. Script runs ./bin/design-tokens.sh to regenerate CSS + Kotlin + DTCG.
#   7. Developer reviews `git diff`, commits.
#
# Round-trip invariant:
#   gen → cp design/tokens.dtcg.json design/tokens.dtcg.incoming.json → pull →
#   gen → `git diff design/tokens.dtcg.json` is empty.
#
# Schema extensions (adding new color like `accent`, or a new scale slot) go
# through /design-study, which updates design/tokens.schema.json,
# bin/design-tokens.sh, and the Compose emitter atomically.
#
# Dependencies: bash 3.2+ (macOS default), jq.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

INCOMING="design/tokens.dtcg.incoming.json"
TARGET="design/tokens.json"

if [[ ! -f "$INCOMING" ]]; then
    echo "Error: $INCOMING not found." >&2
    echo "       Tokens Studio's Git sync writes to this path." >&2
    echo "       If you're testing, copy design/tokens.dtcg.json to that path first." >&2
    exit 1
fi

if [[ ! -f "$TARGET" ]]; then
    echo "Error: $TARGET not found. Run from repo root." >&2
    exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
    echo "Error: jq is required. Install with 'brew install jq' on macOS." >&2
    exit 1
fi

echo "→ Pulling $INCOMING → $TARGET"
echo ""

# --- Extract brand OKLch from incoming light-mode ----------------------------
# Keys prefixed with `$` must be accessed via bracket notation in jq — `.$foo`
# would be parsed as a variable reference.

BRAND_VALUE=$(jq -r '.color.light.brand["$value"] // empty' "$INCOMING")
if [[ -z "$BRAND_VALUE" ]]; then
    echo "Error: incoming file has no .color.light.brand[\"\$value\"]" >&2
    exit 2
fi

# Parse "oklch(L C h)" — whitespace-separated, no alpha channel.
OKLCH_REGEX='^oklch\(([0-9.]+)[[:space:]]+([0-9.]+)[[:space:]]+([0-9.]+)\)$'
if [[ "$BRAND_VALUE" =~ $OKLCH_REGEX ]]; then
    NEW_L="${BASH_REMATCH[1]}"
    NEW_C="${BASH_REMATCH[2]}"
    NEW_H="${BASH_REMATCH[3]}"
else
    echo "Error: cannot parse brand OKLch from '$BRAND_VALUE'" >&2
    echo "       Expected: oklch(L C h) with space separators and no alpha." >&2
    exit 2
fi

# --- Extract font families ---------------------------------------------------
NEW_SANS=$(jq -r '.typography.fontFamily.sans["$value"] // empty' "$INCOMING")
NEW_MONO=$(jq -r '.typography.fontFamily.mono["$value"] // empty' "$INCOMING")
if [[ -z "$NEW_SANS" || -z "$NEW_MONO" ]]; then
    echo "Error: incoming file missing .typography.fontFamily.{sans,mono}[\"\$value\"]" >&2
    exit 2
fi

# --- Supported subsets -------------------------------------------------------
# The bespoke schema + Compose Material3 Typography slots + Shapes slots cap
# what we accept. Widening requires a /design-study schema extension.

SUPPORTED_SCALE='["displayLarge","headlineLarge","titleLarge","bodyLarge","bodyMedium","labelMedium"]'
SUPPORTED_RADIUS='["sm","md","lg","xl"]'

# --- Extract typography scale (supported entries only) -----------------------
UPDATED_TYPO_SCALE=$(jq --argjson ok "$SUPPORTED_SCALE" '
    (.typography.scale // {}) |
    with_entries(select(.key as $k | $ok | index($k) != null)) |
    with_entries({
        key: .key,
        value: {
            size:       (.value.size["$value"]       | tostring | rtrimstr("px") | tonumber),
            weight:     (.value.weight["$value"]),
            lineHeight: (.value.lineHeight["$value"] | tostring | rtrimstr("px") | tonumber)
        }
    })
' "$INCOMING")

# --- Extract radius (supported entries only) ---------------------------------
UPDATED_RADIUS=$(jq --argjson ok "$SUPPORTED_RADIUS" '
    (.radius // {}) |
    with_entries(select(.key as $k | $ok | index($k) != null)) |
    with_entries({
        key: .key,
        value: (.value["$value"] | tostring | rtrimstr("px") | tonumber)
    })
' "$INCOMING")

# --- Extract spacing ---------------------------------------------------------
# Spacing keys are arbitrary numeric strings ("1", "2", "6", …) — we accept
# whatever the incoming file provides.
UPDATED_SPACING=$(jq '
    (.spacing // {}) |
    with_entries({
        key: .key,
        value: (.value["$value"] | tostring | rtrimstr("px") | tonumber)
    })
' "$INCOMING")

# --- Collect warnings --------------------------------------------------------
WARNINGS=()

EXTRA_TYPO=$(jq -r --argjson ok "$SUPPORTED_SCALE" '
    ((.typography.scale // {} | keys) - $ok) | .[]
' "$INCOMING")
while IFS= read -r extra; do
    [[ -z "$extra" ]] && continue
    WARNINGS+=("typography.scale.$extra ignored (supported: displayLarge, headlineLarge, titleLarge, bodyLarge, bodyMedium, labelMedium)")
done <<< "$EXTRA_TYPO"

EXTRA_RADIUS=$(jq -r --argjson ok "$SUPPORTED_RADIUS" '
    ((.radius // {} | keys) - $ok) | .[]
' "$INCOMING")
while IFS= read -r extra; do
    [[ -z "$extra" ]] && continue
    WARNINGS+=("radius.$extra ignored (supported: sm, md, lg, xl)")
done <<< "$EXTRA_RADIUS"

NONBRAND_LIGHT=$(jq -r '
    ((.color.light // {} | keys) - ["brand"]) | length
' "$INCOMING")
if (( NONBRAND_LIGHT > 0 )); then
    WARNINGS+=("non-brand light-mode colors ignored — bin/design-tokens.sh derives them from brand + fixed neutrals (run /design-study to propose schema extension for a new color)")
fi

HAS_DARK=$(jq -r '(.color.dark // {} | keys | length) > 0' "$INCOMING")
if [[ "$HAS_DARK" == "true" ]]; then
    WARNINGS+=("color.dark.* entries ignored — dark mode is derived via an L-flip formula, not imported")
fi

# --- Rewrite design/tokens.json (targeted update) ----------------------------
# Preserve the $schema reference and any other top-level fields; only replace
# the fields this tool manages. jq pretty-prints: first-ever pull against a
# hand-formatted tokens.json may reflow formatting — that's a one-time
# diff, subsequent pulls produce minimal diffs.

jq \
    --argjson L "$NEW_L" \
    --argjson C "$NEW_C" \
    --argjson H "$NEW_H" \
    --arg sans "$NEW_SANS" \
    --arg mono "$NEW_MONO" \
    --argjson typo "$UPDATED_TYPO_SCALE" \
    --argjson radius "$UPDATED_RADIUS" \
    --argjson spacing "$UPDATED_SPACING" \
    '.brand = {L: $L, C: $C, h: $H}
     | .typography.fontFamily.sans = $sans
     | .typography.fontFamily.mono = $mono
     | .typography.scale = $typo
     | .radius = $radius
     | .spacing = $spacing' \
    "$TARGET" > "$TARGET.tmp"
mv "$TARGET.tmp" "$TARGET"

# --- Report ------------------------------------------------------------------
echo "✓ Updated $TARGET"
echo "  brand:  L=$NEW_L  C=$NEW_C  h=$NEW_H"
echo "  fonts:  sans=\"$NEW_SANS\"  mono=\"$NEW_MONO\""
echo ""

if (( ${#WARNINGS[@]} > 0 )); then
    echo "⚠️  ${#WARNINGS[@]} warning(s) — non-expressible fields were ignored:"
    for w in "${WARNINGS[@]}"; do
        echo "   • $w"
    done
    echo ""
fi

# --- Regenerate --------------------------------------------------------------
echo "→ Running ./bin/design-tokens.sh"
echo ""
./bin/design-tokens.sh

echo ""
echo "Done. Review with: git diff $TARGET design/tokens.dtcg.json web/src/app/generated/tokens.css"
