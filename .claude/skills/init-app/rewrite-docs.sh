#!/usr/bin/env bash
#
# Triplane init-app doc rewriter — strips template-meta from PLAN.md +
# mobile_plan.md, replaces README.md with a downstream version, and rewrites
# display strings (Compose + web i18n + OpenAPI metadata) from "Triplane" to
# the downstream app's display name.
#
# This is the helper script for the /init-app skill. It runs AFTER bin/init.sh
# (which handles Kotlin package + Android namespace renames) and handles the
# structural markdown surgery and display-string rewrites that are too subtle
# for sed-from-instructions to do reliably.
#
# Usage:
#   rewrite-docs.sh --display-name "My App" --slug my-app \
#                   [--idea-file IDEA.md] [--description "..."] [--tagline "..."] \
#                   [--features "feature-a,feature-b,feature-c"] \
#                   [--dry-run] [--yes]
#
# What it rewrites:
#   - PLAN.md: strips "Phased build plan" + "Recent decisions log" sections,
#     removes their TOC entries, renumbers remaining TOC, resets the feature
#     matrix body (preserves header + iOS note), rewrites the title heading,
#     replaces the Status + Last-updated lines, removes "(Phase N)" skill
#     references in principles.
#   - mobile_plan.md: strips the "Mobile phase tracker" rows and the entire
#     "Mobile parity — Phase 7 complete" section (Triplane-specific). Preserves
#     the "What's shared vs platform-specific" reference table.
#   - README.md: replaces entirely with a downstream-app template generated
#     from a heredoc using the display name, tagline, description, and slug.
#   - Kotlin + XML display strings (ordered, because substitutions overlap):
#       1. `TriplaneTheme` Kotlin symbol  →  `<SymbolName>Theme`
#       2. `Theme.Triplane` XML style ref →  `Theme.<SymbolName>`
#       3. `triplane_auth` SharedPreferences key → `<slug_snake>_auth`
#       4. `triplane.priorli.com` default base URL → `<slug>.example.com`
#       5. Remaining literal `Triplane` strings → display name (Compose, themes.xml, AndroidManifest)
#   - Web display strings (JSON + TypeScript):
#       en-US i18n JSON, layout.tsx <title>, openapi/index.ts spec title+description,
#       api/v1/docs/route.ts HTML title, openapi/responses.ts + types/api.ts header comments.
#
# What it LEAVES ALONE:
#   - CLAUDE.md, LESSONS.md — universal workflow knowledge, useful downstream as-is
#   - .claude/skills/**                — the skills themselves reference "Triplane" in their docs
#   - specs/**                         — feature specs don't exist yet (or /feature add creates them)
#   - bin/init.sh                      — still useful as a record of what was renamed
#   - Anything under .git/, .gradle/, .kotlin/, .next/, node_modules/, build/, generated/
#
# Safety:
#   - Refuses if the literal string "Triplane" is already absent from the display-string
#     target files (idempotency guard — means we've already run).
#   - Uses portable temp-file sed (works on macOS BSD sed and Linux GNU sed).
#   - --dry-run prints the planned edits without touching anything.
#   - Never commits — leaves `git status` for the caller to review.

set -euo pipefail

# --- Arg parsing -------------------------------------------------------------

DISPLAY_NAME=""
SLUG=""
IDEA_FILE="IDEA.md"
DESCRIPTION=""
TAGLINE=""
FEATURES_CSV=""
DRY_RUN="false"
ASSUME_YES="false"

usage() {
    cat <<'EOF'
rewrite-docs.sh — strip Triplane template-meta and rewrite display strings.

Usage:
  rewrite-docs.sh --display-name "My App" --slug my-app [options]

Required:
  --display-name <string>    Human-readable app name (e.g., "My Awesome App")
  --slug <kebab-case>        Project slug, e.g., "my-awesome-app"

Options:
  --idea-file <path>         Path to IDEA.md brief (default: IDEA.md at repo root)
  --description <string>     One-paragraph description (else pulled from IDEA.md Description section, else placeholder)
  --tagline <string>         One-line tagline (else pulled from IDEA.md blockquote after the title, else placeholder)
  --features <a,b,c>         Comma-separated feature slugs; each becomes an empty-status row in PLAN.md matrix
  --dry-run                  Print planned edits; do not modify any file
  --yes, -y                  Skip the confirmation prompt
  --help, -h                 Show this help

Example:
  rewrite-docs.sh --display-name "Recipe Share" --slug recipe-share \
                  --tagline "Share recipes with your cooking circle" \
                  --features "recipes,photos,follows"
EOF
}

while (( $# > 0 )); do
    case "$1" in
        -h|--help)
            usage
            exit 0
            ;;
        --display-name)
            DISPLAY_NAME="$2"
            shift 2
            ;;
        --slug)
            SLUG="$2"
            shift 2
            ;;
        --idea-file)
            IDEA_FILE="$2"
            shift 2
            ;;
        --description)
            DESCRIPTION="$2"
            shift 2
            ;;
        --tagline)
            TAGLINE="$2"
            shift 2
            ;;
        --features)
            FEATURES_CSV="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN="true"
            shift
            ;;
        -y|--yes)
            ASSUME_YES="true"
            shift
            ;;
        *)
            echo "Error: unexpected argument '$1'" >&2
            usage >&2
            exit 2
            ;;
    esac
done

if [[ -z "$DISPLAY_NAME" || -z "$SLUG" ]]; then
    echo "Error: --display-name and --slug are required." >&2
    echo "" >&2
    usage >&2
    exit 2
fi

# Validate slug — same regex as bin/init.sh
if ! [[ "$SLUG" =~ ^[a-z][a-z0-9-]*$ ]]; then
    echo "Error: --slug must be kebab-case (lowercase letters, digits, hyphens; must start with a letter)." >&2
    echo "       Got: '$SLUG'" >&2
    exit 2
fi

# --- Derived vars ------------------------------------------------------------

# PascalCase symbol name derived from display name (split on spaces/hyphens, capitalize each word)
derive_symbol_name() {
    local display="$1"
    local result=""
    local word
    local IFS=$' \t-'
    for word in $display; do
        if [[ -n "$word" ]]; then
            # Capitalize first letter, keep rest
            local first="${word:0:1}"
            local rest="${word:1}"
            result+="$(echo "$first" | tr '[:lower:]' '[:upper:]')${rest}"
        fi
    done
    echo "$result"
}

SYMBOL_NAME="$(derive_symbol_name "$DISPLAY_NAME")"
if [[ -z "$SYMBOL_NAME" ]]; then
    echo "Error: could not derive a PascalCase symbol from display name '$DISPLAY_NAME'." >&2
    exit 2
fi

# snake_case slug for SharedPreferences key
LOWER_SLUG_UNDERSCORE="${SLUG//-/_}"

# Resolve repo root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
cd "$REPO_ROOT"

# If idea-file is a relative path, resolve against REPO_ROOT
if [[ "$IDEA_FILE" != /* ]]; then
    IDEA_FILE="$REPO_ROOT/$IDEA_FILE"
fi

# --- Pull tagline + description from IDEA.md if not passed ------------------

if [[ -f "$IDEA_FILE" ]]; then
    if [[ -z "$TAGLINE" ]]; then
        # First blockquote line immediately after the H1 title
        TAGLINE="$(awk '/^> / {sub(/^> /, ""); print; exit}' "$IDEA_FILE" || true)"
    fi
    if [[ -z "$DESCRIPTION" ]]; then
        # First non-empty paragraph under "## Description"
        DESCRIPTION="$(awk '/^## Description$/{flag=1; next} flag && NF && !/^#/{print; exit} /^## /{flag=0}' "$IDEA_FILE" || true)"
    fi
fi

# Fall back to generic placeholders if still empty
[[ -z "$TAGLINE" ]] && TAGLINE="A $DISPLAY_NAME — built from the Triplane template."
[[ -z "$DESCRIPTION" ]] && DESCRIPTION="$DISPLAY_NAME is a full-stack app with a Next.js web client and a Compose Multiplatform mobile client (Android + iOS), all sharing a versioned API."

# --- Preview -----------------------------------------------------------------

echo "rewrite-docs.sh — Triplane → $DISPLAY_NAME"
echo ""
echo "  Display name:   $DISPLAY_NAME"
echo "  Symbol name:    $SYMBOL_NAME (Kotlin/XML identifier)"
echo "  Slug:           $SLUG"
echo "  Slug (snake):   $LOWER_SLUG_UNDERSCORE"
echo "  Idea file:      $IDEA_FILE $( [[ -f "$IDEA_FILE" ]] && echo '(found)' || echo '(missing — using placeholders)' )"
echo "  Tagline:        $TAGLINE"
echo "  Description:    ${DESCRIPTION:0:80}$( [[ ${#DESCRIPTION} -gt 80 ]] && echo '…' )"
echo "  Features:       ${FEATURES_CSV:-<none — matrix will be empty>}"
echo "  Dry run:        $DRY_RUN"
echo ""
echo "Will rewrite:"
echo "  • PLAN.md       — strip phased build plan + decisions log, reset matrix, rewrite title"
echo "  • README.md     — replace with downstream-app template"
echo "  • mobile_plan.md — strip Triplane phase tracker + 'Mobile parity — Phase 7' section"
echo "  • Kotlin + XML: Theme.kt, App.kt, HomeScreen.kt, AndroidManifest.xml, themes.xml,"
echo "                  TokenStorage.android.kt, PlatformModule.ios.kt"
echo "  • Web: en-US i18n JSON, layout.tsx, openapi/index.ts, docs/route.ts,"
echo "         openapi/responses.ts, types/api.ts"
echo ""
echo "Leaves untouched:"
echo "  • CLAUDE.md, LESSONS.md, .claude/skills/**, specs/**, bin/init.sh"
echo ""

# --- Idempotency guard -------------------------------------------------------

GUARD_FILES=(
    "web/src/messages/en-US/common.json"
    "mobile/composeApp/src/androidMain/AndroidManifest.xml"
    "PLAN.md"
)
ALREADY_DONE="true"
for f in "${GUARD_FILES[@]}"; do
    if [[ -f "$f" ]] && grep -q "Triplane" "$f" 2>/dev/null; then
        ALREADY_DONE="false"
        break
    fi
done

if [[ "$ALREADY_DONE" == "true" ]]; then
    echo "Error: no 'Triplane' references found in the display-string target files." >&2
    echo "       Looks like rewrite-docs.sh has already run on this repo." >&2
    echo "       If you want to re-run, use 'git reset --hard' to restore first." >&2
    exit 3
fi

if [[ "$DRY_RUN" == "true" ]]; then
    echo "(dry-run: no files will be modified)"
    exit 0
fi

if [[ "$ASSUME_YES" != "true" ]]; then
    read -r -p "Proceed? [y/N] " ANSWER
    if [[ "$ANSWER" != "y" && "$ANSWER" != "Y" ]]; then
        echo "Aborted."
        exit 0
    fi
fi

# --- Helper: portable in-place sed ------------------------------------------

replace_in_file() {
    local pattern="$1"
    local replacement="$2"
    local file="$3"
    # Use | as delimiter (paths and display names never contain pipes).
    sed "s|${pattern}|${replacement}|g" "$file" > "$file.tmp"
    mv "$file.tmp" "$file"
}

# sed range-delete: delete lines from start pattern through end pattern, inclusive
delete_range_in_file() {
    local start_pat="$1"
    local end_pat="$2"
    local file="$3"
    sed "/${start_pat}/,/${end_pat}/d" "$file" > "$file.tmp"
    mv "$file.tmp" "$file"
}

# sed delete-to-EOF: delete from start pattern through end of file
delete_to_eof_in_file() {
    local start_pat="$1"
    local file="$2"
    sed "/${start_pat}/,\$d" "$file" > "$file.tmp"
    mv "$file.tmp" "$file"
}

# sed line-delete: delete a single line matching a pattern
delete_line_in_file() {
    local pat="$1"
    local file="$2"
    sed "/${pat}/d" "$file" > "$file.tmp"
    mv "$file.tmp" "$file"
}

# --- Step 1: PLAN.md surgery -------------------------------------------------

echo ""
echo "Step 1/4 — rewriting PLAN.md"

if [[ ! -f PLAN.md ]]; then
    echo "  SKIP: PLAN.md not found"
else
    # 1a. Rewrite the H1 title
    replace_in_file "^# Triplane — Project Plan$" "# ${DISPLAY_NAME} — Project Plan" PLAN.md
    echo "  rewrote H1 title → '$DISPLAY_NAME — Project Plan'"

    # 1b. Strip the "Priorli's full-stack monorepo template..." tagline blockquote
    #     (line 3 of the original template file)
    replace_in_file "^> Priorli's full-stack monorepo template\..*$" "> ${TAGLINE}" PLAN.md
    echo "  rewrote tagline blockquote"

    # 1c. Strip the Status + Last-updated lines (Triplane-specific metadata)
    delete_line_in_file "^\*\*Status:\*\* All phases" PLAN.md || true
    delete_line_in_file "^\*\*Status:\*\* Phases " PLAN.md || true
    delete_line_in_file "^\*\*Last updated:\*\*" PLAN.md || true
    echo "  stripped Status + Last-updated metadata lines"

    # 1d. Strip the "Phased build plan" section (header through next ---)
    delete_range_in_file "^## Phased build plan$" "^---$" PLAN.md
    echo "  stripped 'Phased build plan' section"

    # 1e. Strip the "Recent decisions log" section (to EOF)
    delete_to_eof_in_file "^## Recent decisions log$" PLAN.md
    echo "  stripped 'Recent decisions log' section"

    # 1f. Remove the TOC entries for the stripped sections
    delete_line_in_file "^5\. \[Phased build plan\]" PLAN.md || true
    delete_line_in_file "^7\. \[Recent decisions log\]" PLAN.md || true
    # Renumber the Feature matrix TOC entry from 6 to 5
    replace_in_file "^6\. \[Feature matrix\]" "5. [Feature matrix]" PLAN.md
    echo "  updated TOC entries"

    # 1g. Remove "(Phase 5)" / "(Phase N)" parenthetical skill references
    replace_in_file " (Phase 5)" "" PLAN.md
    replace_in_file " (Phase 6)" "" PLAN.md
    replace_in_file " (Phase 7)" "" PLAN.md
    echo "  stripped '(Phase N)' skill parentheticals"

    # 1h. Reset the feature matrix body (preserve header + iOS note, delete data rows)
    #     The Triplane template ships with two rows: Auth and Items + Photos.
    delete_line_in_file "^| Auth " PLAN.md || true
    delete_line_in_file "^| Items + Photos" PLAN.md || true
    echo "  reset feature matrix body"

    # 1i. If --features was supplied, append a row per feature
    if [[ -n "$FEATURES_CSV" ]]; then
        TMP_MATRIX_ROWS="$(mktemp)"
        IFS=',' read -ra FEATS <<< "$FEATURES_CSV"
        for feat in "${FEATS[@]}"; do
            # Trim whitespace
            feat="$(echo "$feat" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
            [[ -z "$feat" ]] && continue
            printf "| %-20s | 🔲  | 🔲  | 🔲               | 🔲           | 🔲   |\n" "$feat" >> "$TMP_MATRIX_ROWS"
        done
        # Insert the rows after the matrix header's separator row
        #   | Feature              | API | Web | ... | Spec |
        #   |----------------------|-----|-----|-----|------|    <-- insert here
        awk -v rows_file="$TMP_MATRIX_ROWS" '
            /^\|---/ && in_matrix {
                print
                while ((getline line < rows_file) > 0) print line
                close(rows_file)
                in_matrix = 0
                next
            }
            /^\| Feature / { in_matrix = 1 }
            { print }
        ' PLAN.md > PLAN.md.tmp && mv PLAN.md.tmp PLAN.md
        rm -f "$TMP_MATRIX_ROWS"
        echo "  appended ${#FEATS[@]} feature row(s) to matrix"
    fi

    # 1j. Replace remaining literal 'Triplane' references in PLAN.md with display name
    #     (catches things like "Triplane ships with..." in the Project structure comment block)
    replace_in_file "Triplane" "$DISPLAY_NAME" PLAN.md
    echo "  rewrote remaining 'Triplane' literals"
fi

# --- Step 2: mobile_plan.md surgery -----------------------------------------

echo ""
echo "Step 2/4 — rewriting mobile_plan.md"

if [[ ! -f mobile_plan.md ]]; then
    echo "  SKIP: mobile_plan.md not found"
else
    # 2a. Rewrite H1
    replace_in_file "^# Triplane Mobile — Plan$" "# ${DISPLAY_NAME} Mobile — Plan" mobile_plan.md
    echo "  rewrote H1 title"

    # 2b. Strip the Mobile phase tracker data rows (preserves header + separator)
    delete_line_in_file "^| \*\*3\.0\*\*" mobile_plan.md || true
    delete_line_in_file "^| \*\*3\.1\*\*" mobile_plan.md || true
    delete_line_in_file "^| \*\*4\.0\*\*" mobile_plan.md || true
    delete_line_in_file "^| \*\*4\.1\*\*" mobile_plan.md || true
    delete_line_in_file "^| \*\*7\.0\*\*" mobile_plan.md || true
    delete_line_in_file "^| \*\*7\.1\*\*" mobile_plan.md || true
    delete_line_in_file "^(Triplane phases 1, 2, 5, 6 are" mobile_plan.md || true
    echo "  stripped Triplane phase tracker rows"

    # 2c. Strip the "Mobile parity — Phase 7 complete" section (header through next --- or ##)
    delete_range_in_file "^## Mobile parity — Phase 7 complete$" "^---$" mobile_plan.md || true
    echo "  stripped 'Mobile parity — Phase 7 complete' section"

    # 2d. Replace remaining 'Triplane' literals
    replace_in_file "Triplane" "$DISPLAY_NAME" mobile_plan.md
    echo "  rewrote remaining 'Triplane' literals"
fi

# --- Step 3: README.md replacement -------------------------------------------

echo ""
echo "Step 3/4 — replacing README.md with downstream template"

cat > README.md <<README_EOF
# ${DISPLAY_NAME}

> ${TAGLINE}

${DESCRIPTION}

## Getting started

### 1. Install dependencies

\`\`\`bash
cd web && bun install
\`\`\`

### 2. Configure environment variables

Fill in \`web/.env.local\` with your Clerk + Neon + (optional) Tigris credentials, and \`mobile/local.properties\` with your Android SDK path + Clerk publishable key + (optional) Google Maps API key. Both files were pre-copied from their \`.example\` templates when you ran \`bin/init.sh\`.

### 3. Run the database migration

\`\`\`bash
cd web
bunx prisma migrate dev --name init
\`\`\`

### 4. Run the apps

\`\`\`bash
# Web (from web/)
bun run dev
# → http://localhost:3000

# Android (from mobile/)
./gradlew :composeApp:assembleDebug
# Open mobile/ in Android Studio to run on an emulator.

# iOS (from mobile/iosApp)
# Open iosApp.xcodeproj in Xcode and run on a simulator.
\`\`\`

## Stack

| Layer | Choice |
|---|---|
| Web framework | Next.js 16 (App Router) |
| Web auth | Clerk |
| Web DB | Neon (serverless Postgres) + Prisma |
| Mobile framework | Compose Multiplatform (Android + iOS) |
| Mobile architecture | Clean Architecture in KMM shared module |
| Mobile auth | Native Clerk SDKs (Android + iOS) |
| Mobile HTTP | Ktor 3 |
| Mobile DI | Koin 4 |
| File storage | Tigris (S3-compatible, optional) |

See \`PLAN.md\` for the full stack table, architecture principles, and feature matrix.

## Features

See \`specs/features/\` (per-feature contracts) and the feature matrix in \`PLAN.md\`.

${FEATURES_CSV:+The current MVP backlog: ${FEATURES_CSV}.}

## Workflow with Claude Code

This project is built on the [Triplane](https://github.com/priorli/triplane) template and ships with the following Claude Code skills under \`.claude/skills/\`:

| Skill | Purpose |
|---|---|
| \`/ideate\` | Brainstorm a product idea into \`IDEA.md\` |
| \`/init-app\` | Bootstrap a downstream project from the template (one-shot) |
| \`/feature\` | Spec-driven feature workflow — add / check / continue |
| \`/audit\` | Repo-wide drift detector |
| \`/scaffold\` | File-stub generator for an approved spec |
| \`/api-change\` | Endpoint cascade walker |
| \`/upgrade-deps\` | Mobile dependency version cascade handler |
| \`/release-check\` | Run web + Android + iOS build verifications in parallel |

Architecture principles, build verification commands, and common gotchas live in \`CLAUDE.md\` — Claude Code reads that at every session start.

## Build verification

Before shipping any change:

\`\`\`bash
cd web && bun run build                                                  # web
cd mobile && ./gradlew :composeApp:assembleDebug                         # Android
cd mobile && ./gradlew :composeApp:compileKotlinIosSimulatorArm64        # iOS compile
\`\`\`

Or, inside Claude Code: \`/release-check\`.

## License

TBD
README_EOF

echo "  replaced README.md"

# --- Step 4: Display string rewrites ----------------------------------------

echo ""
echo "Step 4/4 — rewriting display strings (ordered to avoid collisions)"

# Find target files by glob, resilient to the new namespace path after bin/init.sh

find_kotlin() {
    local basename="$1"
    local path_contains="$2"
    find mobile/composeApp/src -type f -name "$basename" \
        -not -path "*/build/*" -not -path "*/.gradle/*" -not -path "*/.kotlin/*" \
        | while read -r f; do
            if [[ -z "$path_contains" ]] || [[ "$f" == *"$path_contains"* ]]; then
                echo "$f"
            fi
        done
}

# 4a. Kotlin symbol: TriplaneTheme → <SymbolName>Theme
#     (must run BEFORE the generic 'Triplane' → display-name sweep)
THEME_KT="$(find_kotlin Theme.kt /common/theme/ | head -1)"
APP_KT="$(find_kotlin App.kt "" | grep -v '/test/' | grep -v '/androidTest/' | head -1)"

for f in "$THEME_KT" "$APP_KT"; do
    if [[ -n "$f" && -f "$f" ]]; then
        replace_in_file "TriplaneTheme" "${SYMBOL_NAME}Theme" "$f"
        echo "  [Kotlin symbol] TriplaneTheme → ${SYMBOL_NAME}Theme in $f"
    fi
done

# 4b. XML style ref: Theme.Triplane → Theme.<SymbolName>
#     Used in AndroidManifest.xml (@style/Theme.Triplane) and themes.xml (<style name="Theme.Triplane">)
for f in mobile/composeApp/src/androidMain/AndroidManifest.xml \
         mobile/composeApp/src/androidMain/res/values/themes.xml; do
    if [[ -f "$f" ]] && grep -q "Theme\.Triplane" "$f"; then
        replace_in_file "Theme\.Triplane" "Theme.${SYMBOL_NAME}" "$f"
        echo "  [XML style] Theme.Triplane → Theme.${SYMBOL_NAME} in $f"
    fi
done

# 4c. SharedPreferences key: triplane_auth → <slug_snake>_auth
TOKEN_STORAGE="$(find_kotlin TokenStorage.android.kt /androidMain/ | head -1)"
if [[ -n "$TOKEN_STORAGE" && -f "$TOKEN_STORAGE" ]]; then
    replace_in_file "\"triplane_auth\"" "\"${LOWER_SLUG_UNDERSCORE}_auth\"" "$TOKEN_STORAGE"
    echo "  [SharedPreferences] triplane_auth → ${LOWER_SLUG_UNDERSCORE}_auth in $TOKEN_STORAGE"
fi

# 4d. Production base URL placeholder: triplane.priorli.com → <slug>.example.com
PLATFORM_IOS="$(find_kotlin PlatformModule.ios.kt /iosMain/ | head -1)"
if [[ -n "$PLATFORM_IOS" && -f "$PLATFORM_IOS" ]]; then
    replace_in_file "triplane\.priorli\.com" "${SLUG}.example.com" "$PLATFORM_IOS"
    echo "  [base URL] triplane.priorli.com → ${SLUG}.example.com in $PLATFORM_IOS"
fi

# 4e. Remaining literal 'Triplane' → display name, in specific Kotlin/XML files
#     (avoid a blanket find — only touch the known display-string sites)
KOTLIN_DISPLAY_TARGETS=()
HOME_SCREEN="$(find_kotlin HomeScreen.kt /feature/home/ | head -1)"
[[ -n "$HOME_SCREEN" ]] && KOTLIN_DISPLAY_TARGETS+=("$HOME_SCREEN")
KOTLIN_DISPLAY_TARGETS+=(
    "mobile/composeApp/src/androidMain/AndroidManifest.xml"
)

for f in "${KOTLIN_DISPLAY_TARGETS[@]}"; do
    if [[ -f "$f" ]] && grep -q "Triplane" "$f"; then
        replace_in_file "Triplane" "$DISPLAY_NAME" "$f"
        echo "  [display literal] Triplane → ${DISPLAY_NAME} in $f"
    fi
done

# 4f. Web i18n JSON (en-US)
for f in web/src/messages/en-US/common.json \
         web/src/messages/en-US/landing.json; do
    if [[ -f "$f" ]] && grep -q "Triplane" "$f"; then
        # Also rewrite the "Priorli's full-stack monorepo template..." subtitle phrase
        replace_in_file "Priorli's full-stack monorepo template — three surfaces, one codebase, day-one ready\." "${TAGLINE}" "$f"
        replace_in_file "Priorli's full-stack monorepo template" "${DESCRIPTION}" "$f"
        replace_in_file "Triplane" "$DISPLAY_NAME" "$f"
        echo "  [i18n] rewrote Triplane → ${DISPLAY_NAME} in $f"
    fi
done

# 4g. Web OpenAPI + layout + docs HTML + Prisma schema/seed comments
#     Quoted paths avoid [locale] being glob-expanded by the shell.
#     Order matters inside the loop: the "Triplane is Priorli's ..." sentence is replaced first so
#     the later "Triplane → display name" substitution doesn't produce "DisplayName is DisplayName is ..."
WEB_META_FILES=(
    "web/src/lib/openapi/index.ts"
    "web/src/lib/openapi/responses.ts"
    "web/src/app/[locale]/layout.tsx"
    "web/src/app/api/v1/docs/route.ts"
    "web/src/types/api.ts"
    "web/prisma/schema.prisma"
    "web/prisma/seed.ts"
)
for f in "${WEB_META_FILES[@]}"; do
    if [[ -f "$f" ]] && grep -q "Triplane" "$f"; then
        replace_in_file "Triplane is Priorli's full-stack monorepo template\." "${DESCRIPTION}" "$f"
        replace_in_file "Priorli's full-stack monorepo template" "$DESCRIPTION" "$f"
        replace_in_file "Triplane" "$DISPLAY_NAME" "$f"
        echo "  [web meta] rewrote Triplane → ${DISPLAY_NAME} in $f"
    fi
done

# --- Summary -----------------------------------------------------------------

echo ""
echo "Done."
echo ""
echo "Next steps:"
echo "  1. Review changes: git status && git diff --stat"
echo "  2. Regenerate Prisma client (refreshes cached comment in web/src/generated/prisma/):"
echo "       cd web && bunx prisma generate"
echo "  3. Verify builds:"
echo "       cd web && bun run build"
echo "       cd mobile && ./gradlew :composeApp:assembleDebug"
echo "       cd mobile && ./gradlew :composeApp:compileKotlinIosSimulatorArm64"
echo "  4. Commit when satisfied: git add -A && git commit -m 'Bootstrap ${DISPLAY_NAME} from Triplane template'"
