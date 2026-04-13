#!/usr/bin/env bash
#
# Triplane init — rename template placeholders for a downstream project.
#
# Usage:
#   ./bin/init.sh <project-slug> <java-namespace> [--yes]
#   ./bin/init.sh my-awesome-app com.myorg.myawesomeapp
#
# What it rewrites:
#   - Kotlin package directories under mobile/*/src/*/kotlin/com/priorli/triplane/
#   - `com.priorli.triplane` → <namespace> in every .kt / .kts file
#   - Android namespace + applicationId in mobile/composeApp/build.gradle.kts
#   - Android namespace in mobile/shared/build.gradle.kts
#   - The package attribute in mobile/composeApp/src/androidMain/AndroidManifest.xml
#   - web/package.json `name: "triplane-web"` → `name: "<slug>-web"`
#   - Copies web/.env.example → web/.env.local and mobile/local.properties.example
#     → mobile/local.properties if those destinations don't exist
#
# What it leaves alone (intentionally — documentation should be rewritten by you):
#   - README.md, PLAN.md, LESSONS.md, CLAUDE.md, mobile_plan.md, specs/**
#   - Display strings like Text("Triplane") in Compose code or "title": "Triplane"
#     in i18n JSON — grep and update these yourself, the semantics are too subtle
#     to automate safely.
#
# Safety:
#   - Refuses to run if the repo has already been initialized (no "com.priorli.triplane"
#     references left).
#   - Uses a temp-file sed pattern so it works on macOS (BSD sed) and Linux (GNU sed).
#   - Excludes build/, .gradle/, .kotlin/, .next/, node_modules/, generated/, .git/, bin/.
#   - Prints a preview of changes and waits for confirmation unless --yes is passed.
#   - Never commits — leaves `git status` for you to review and commit yourself.

set -euo pipefail

# --- Arg parsing -------------------------------------------------------------

SLUG=""
NAMESPACE=""
ASSUME_YES="false"

usage() {
    cat <<'EOF'
Triplane init — rename template placeholders for a downstream project.

Usage:
  ./bin/init.sh <project-slug> <java-namespace> [--yes]
  ./bin/init.sh my-app com.myorg.myapp

Arguments:
  <project-slug>     kebab-case project name (e.g., my-awesome-app)
  <java-namespace>   Dotted Java-style namespace (e.g., com.myorg.myapp)

Options:
  --yes, -y          Skip the confirmation prompt
  --help, -h         Show this help

Example:
  ./bin/init.sh my-app com.myorg.myapp
EOF
}

while (( $# > 0 )); do
    case "$1" in
        -h|--help)
            usage
            exit 0
            ;;
        -y|--yes)
            ASSUME_YES="true"
            shift
            ;;
        *)
            if [[ -z "$SLUG" ]]; then
                SLUG="$1"
            elif [[ -z "$NAMESPACE" ]]; then
                NAMESPACE="$1"
            else
                echo "Error: unexpected argument '$1'" >&2
                usage
                exit 2
            fi
            shift
            ;;
    esac
done

if [[ -z "$SLUG" || -z "$NAMESPACE" ]]; then
    echo "Error: both <project-slug> and <java-namespace> are required." >&2
    echo "" >&2
    usage
    exit 2
fi

# Validate slug — lowercase alphanumerics and hyphens, must start with a letter.
if ! [[ "$SLUG" =~ ^[a-z][a-z0-9-]*$ ]]; then
    echo "Error: project-slug must be kebab-case (lowercase letters, digits, hyphens; must start with a letter)." >&2
    echo "       Got: '$SLUG'" >&2
    exit 2
fi

# Validate namespace — dotted java-style identifier, at least two segments.
if ! [[ "$NAMESPACE" =~ ^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$ ]]; then
    echo "Error: java-namespace must be dotted lowercase (e.g., com.myorg.myapp)." >&2
    echo "       Got: '$NAMESPACE'" >&2
    exit 2
fi

# --- Constants ---------------------------------------------------------------

OLD_NS="com.priorli.triplane"
OLD_PATH="com/priorli/triplane"
NEW_NS="$NAMESPACE"
# Use `tr` instead of `${NAMESPACE//./\/}` — macOS bash 3.2 preserves the
# replacement's `\` literally, producing `com\/priorli\/x` with backslashes
# (i.e., a single directory name with embedded backslashes rather than 3
# nested dirs). `tr` is portable and correct across bash 3/4/5.
NEW_PATH=$(printf '%s' "$NAMESPACE" | tr '.' '/')

OLD_WEB_PKG="triplane-web"
NEW_WEB_PKG="${SLUG}-web"

# Derive repo root — the script must be invoked from the repo root OR from anywhere,
# so resolve relative to this script's location.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

# --- Idempotency guard -------------------------------------------------------

if ! grep -r --include="*.kt" --include="*.kts" -l "$OLD_NS" mobile/ web/ >/dev/null 2>&1; then
    echo "Error: no '$OLD_NS' references found. This repo looks already initialized." >&2
    echo "       If you really want to rename again, do it manually." >&2
    exit 3
fi

# --- Preview -----------------------------------------------------------------

echo "Triplane → $SLUG (namespace $NEW_NS)"
echo ""
echo "Will rewrite:"
echo "  • Kotlin package directories: $OLD_PATH → $NEW_PATH (across mobile/composeApp + mobile/shared, all source sets)"

# Count .kt / .kts files that contain the old namespace
KT_COUNT=$(grep -rl --include="*.kt" --include="*.kts" "$OLD_NS" mobile/ web/ 2>/dev/null | wc -l | tr -d ' ')
echo "  • $KT_COUNT Kotlin / Gradle files: package + import + namespace declarations"
echo "  • mobile/composeApp/build.gradle.kts: namespace + applicationId"
echo "  • mobile/shared/build.gradle.kts: namespace"
echo "  • mobile/composeApp/src/androidMain/AndroidManifest.xml: package attribute"
echo "  • web/package.json: name: \"$OLD_WEB_PKG\" → \"$NEW_WEB_PKG\""

if [[ ! -f web/.env.local ]]; then
    echo "  • Copy web/.env.example → web/.env.local"
fi
if [[ ! -f mobile/local.properties ]]; then
    echo "  • Copy mobile/local.properties.example → mobile/local.properties"
fi

echo ""
echo "Leaves untouched (rewrite these yourself):"
echo "  • README.md, PLAN.md, LESSONS.md, CLAUDE.md, mobile_plan.md, specs/**"
echo "  • Display strings in Compose UI and web i18n JSON"
echo ""

if [[ "$ASSUME_YES" != "true" ]]; then
    read -r -p "Proceed? [y/N] " ANSWER
    if [[ "$ANSWER" != "y" && "$ANSWER" != "Y" ]]; then
        echo "Aborted."
        exit 0
    fi
fi

# --- Helper: portable in-place sed ------------------------------------------
# sed -i has different flag syntax on BSD (macOS) and GNU (Linux). Using a temp
# file sidesteps the difference entirely.
replace_in_file() {
    local pattern="$1"
    local replacement="$2"
    local file="$3"
    # Use | as delimiter since Java package names contain dots but never pipes.
    sed "s|${pattern}|${replacement}|g" "$file" > "$file.tmp"
    mv "$file.tmp" "$file"
}

# --- Helper: find files to rewrite (with exclusions) -----------------------
find_source_files() {
    find mobile web \
        \( -name "*.kt" -o -name "*.kts" -o -name "*.xml" \) \
        -not -path "*/node_modules/*" \
        -not -path "*/build/*" \
        -not -path "*/.gradle/*" \
        -not -path "*/.kotlin/*" \
        -not -path "*/.next/*" \
        -not -path "*/generated/*" \
        -not -path "*/.git/*" \
        -not -path "*/bin/*"
}

# --- Step 1: move Kotlin package directories --------------------------------

echo ""
echo "Step 1/5 — moving Kotlin package directories"
while IFS= read -r old_dir; do
    # old_dir looks like: mobile/composeApp/src/commonMain/kotlin/com/priorli/triplane
    parent="${old_dir%/$OLD_PATH}"
    new_dir="$parent/$NEW_PATH"
    mkdir -p "$(dirname "$new_dir")"
    if [[ -e "$new_dir" ]]; then
        echo "  SKIP: $new_dir already exists (merged?)"
    else
        mv "$old_dir" "$new_dir"
        echo "  mv $old_dir → $new_dir"
    fi
done < <(find mobile -type d -path "*/kotlin/$OLD_PATH" 2>/dev/null)

# --- Step 2: rewrite package / import / namespace declarations --------------

echo ""
echo "Step 2/5 — rewriting package declarations + imports + namespaces"
while IFS= read -r file; do
    if grep -q "$OLD_NS" "$file" 2>/dev/null; then
        replace_in_file "$OLD_NS" "$NEW_NS" "$file"
        echo "  edited $file"
    fi
done < <(find_source_files)

# --- Step 3: web/package.json name -------------------------------------------

echo ""
echo "Step 3/5 — renaming web package"
if [[ -f web/package.json ]] && grep -q "\"$OLD_WEB_PKG\"" web/package.json; then
    replace_in_file "\"$OLD_WEB_PKG\"" "\"$NEW_WEB_PKG\"" web/package.json
    echo "  edited web/package.json"
else
    echo "  SKIP: web/package.json does not reference $OLD_WEB_PKG"
fi

# --- Step 4: env / local.properties template copies --------------------------

echo ""
echo "Step 4/5 — copying env templates"
if [[ -f web/.env.example && ! -f web/.env.local ]]; then
    cp web/.env.example web/.env.local
    echo "  cp web/.env.example → web/.env.local"
else
    echo "  SKIP: web/.env.local already exists or .env.example missing"
fi

if [[ -f mobile/local.properties.example && ! -f mobile/local.properties ]]; then
    cp mobile/local.properties.example mobile/local.properties
    echo "  cp mobile/local.properties.example → mobile/local.properties"
else
    echo "  SKIP: mobile/local.properties already exists or example missing"
fi

# --- Step 5: summary ---------------------------------------------------------

echo ""
echo "Step 5/5 — done"
echo ""
echo "Next steps:"
echo "  1. Fill in web/.env.local with real Clerk + Neon values"
echo "  2. Fill in mobile/local.properties with SDK path + Clerk + Google Maps keys"
echo "  3. Rewrite README.md, PLAN.md, LESSONS.md, CLAUDE.md, mobile_plan.md for your project"
echo "  4. Grep for remaining display strings: grep -rn 'Triplane' web/src/ mobile/composeApp/src/commonMain/"
echo "  5. Review with: git status"
echo "  6. Commit: git add -A && git commit -m 'Initialize $SLUG from Triplane template'"
echo "  7. Install deps and verify builds:"
echo "       cd web && bun install && bun run build"
echo "       cd mobile && ./gradlew :composeApp:assembleDebug"
echo "       cd mobile && ./gradlew :composeApp:compileKotlinIosSimulatorArm64"
