# Triplane

> **Three surfaces, one codebase, day-one ready.**

Triplane is Priorli's opinionated full-stack monorepo template for shipping a product across **web, Android, and iOS** from a single codebase, with Claude Code as your day-to-day collaborator.

It's the distilled lessons of building [Travolp](https://github.com/haibuiorg/priorli-public) — what worked, what hurt, and what we'd do on day one of the next project to avoid the pain.

## What you get

```
triplane/
├── web/          # Next.js 16 + Clerk + i18n + Prisma + OpenAPI
├── mobile/       # Compose Multiplatform — KMM shared module + native Android + iOS
├── specs/        # Per-feature contracts that keep web and mobile in sync
├── .claude/      # Claude Code skills that automate the workflow
├── PLAN.md       # Stack table, architecture principles, feature matrix, decisions log
├── CLAUDE.md     # Workflow rules — read at every Claude Code session start
├── LESSONS.md    # Why each decision is what it is — the rationale you'll forget
└── mobile_plan.md  # Mobile phase tracker (Phase 0 → 9)
```

## What's in the stack

| Layer | Choice | Why |
|---|---|---|
| Web framework | Next.js 16 (App Router) | Versioned API routes serve both clients from one origin |
| Web auth | Clerk | Same SDK on web + native mobile; no WebView OAuth |
| Web DB | Neon (serverless Postgres) + Prisma 7 | Zero-ops, generous free tier |
| Web i18n | next-intl | URL-based locale routing, server-rendered |
| Web API docs | OpenAPI 3.1 via zod-to-openapi + Scalar | The contract for mobile development |
| Mobile framework | Compose Multiplatform 1.10+ | Single Compose UI codebase, ~95% sharing |
| Mobile architecture | Clean Architecture in KMM shared module | Domain → Data → Presentation, testable |
| Mobile auth | Clerk Android SDK + Clerk iOS SDK | Native Credential Manager / Sign in with Apple, no WebView |
| Mobile HTTP | Ktor 3 | Multiplatform, idiomatic |
| Mobile DI | Koin 4 | Lightweight, KMM-friendly |
| Mobile maps | swmansion/kmp-maps | Google Maps (Android) + Apple Maps (iOS), commonMain composable |
| Mobile image picker | Peekaboo | Cross-platform, no expect/actual needed |
| Mobile image loading | Coil 3 | Multiplatform, fast |
| Hosting | Docker → Fly.io | Deploy from any monorepo path |
| Package manager (web) | Bun ≥ 1.1 | Fast |
| Package manager (mobile) | Gradle 8.11 | Standard |

Versions are pinned in `web/package.json` and `mobile/gradle/libs.versions.toml`. Cascading version bumps are managed via the `/upgrade-deps` skill.

## Status

**v0.1 is ready.** The template is runnable end-to-end on web, Android, and iOS. `xcodebuild build` against `mobile/iosApp/iosApp.xcodeproj` compiles green and hooks into Clerk iOS SDK 1.0.9 via the Swift/Kotlin bridge.

| Phase | Status | What it delivers |
|---|---|---|
| 1. Skeleton + docs | ✅ | Directory tree, LESSONS.md, README, PLAN.md, CLAUDE.md, `/feature` skill |
| 2. Web extraction | ✅ | Clean Next.js 16 + Clerk + i18n + Prisma 7 + OpenAPI scaffold |
| 3. Mobile extraction | ✅ | Clean CMP 1.10 + KMM + Clean Architecture + Clerk Android scaffold |
| 4. Items + photos example | ✅ | End-to-end feature: API + web + mobile with cross-platform presigned-URL file upload |
| 5. Skills library | ✅ | `/audit`, `/scaffold`, `/api-change`, `/upgrade-deps`, `/release-check` shipped alongside `/feature` |
| 6. Polish | ✅ | `bin/init.sh` rename script, GitHub Actions CI, getting-started guide |
| 7. iOS auth | ✅ | Clerk iOS SDK 1.0.9 integration via Swift/Kotlin bridge, hand-authored `iosApp/` Xcode wrapper |

See `PLAN.md` for the full plan, architecture principles, and decisions log.

## Triplane Forge (dev tool, `forge` branch only)

**Triplane Forge** is a browser GUI over the `/ideate` + `/init-app` pipeline. Instead of running Claude Code in a terminal, you fill a form, pick a brand color, click Bootstrap, and watch a real `/init-app` run stream into the browser via SSE — with an in-browser approval dialog for every state-changing tool call. On completion, download the worktree as a tar.gz or open it in-place in your editor.

It lives on a **long-lived `forge` branch** that never merges back to main. Main stays pristine as the template; the forge branch extends it with the meta-app. Downstream consumers who clone from `priorli/triplane` via `--template` get zero forge code.

**Prereqs**

- `ANTHROPIC_API_KEY` exported (or run `claude login` if you use the Claude subscription)
- git ≥ 2.20 (any modern git; `git worktree add` is needed)
- bun ≥ 1.1 (same as the rest of the template)
- macOS or Linux (`tar` + `jq` must be on `PATH` — standard on both)

**Run it locally**

```bash
git checkout forge
cd web
bun install           # pulls @anthropic-ai/claude-agent-sdk
bun run dev
# open http://localhost:3000/en-US/forge/new
```

The `/forge` routes do NOT require a Clerk sign-in in dev mode — `requireForgeUser()` returns a fixed `local-dev` identity so you can bootstrap projects without auth friction.

**Form fields**

| Field | What it is |
|---|---|
| Product name | The app you're bootstrapping (e.g. "Recipe Share") |
| Tagline | One-line pitch — goes into IDEA.md and the rewritten README |
| Description | 3–5 sentences: who it's for, what problem it solves, how |
| Target user | One sentence describing the primary persona |
| Features (1–7) | Name + one-line description per row. These become the MVP feature backlog and drive the `/feature add` loop at the end of `/init-app` |
| Slug / namespace / display name | Auto-derived from product name, overrideable |
| Brand color (optional) | OKLch (L, C, h) sliders. If set, the forge passes `--brand-color L,C,h` to `rewrite-docs.sh`, which regenerates `design/tokens.json` + `web/src/app/generated/tokens.css` + `mobile/.../DesignTokens.kt` with the new palette |

**What happens under the hood**

1. `POST /api/v1/forge/sessions` creates a git worktree at `$TMPDIR/triplane-forge/<sessionId>` on a fresh `forge-session-<id>` branch (so `/init-app`'s branch safety guard passes)
2. `IDEA.md` is written to the worktree root with frontmatter (suggested_slug + features) + prose
3. A worker spawns `@anthropic-ai/claude-agent-sdk`'s `query()` with `cwd=<worktree>` + `settingSources: ['project']` (native `.claude/skills/*` discovery) + the `claude_code` tool preset
4. The agent runs `/init-app` step by step: pre-flight → `bin/init.sh` → `rewrite-docs.sh [--brand-color]` → git diff review → parallel web+Android+iOS builds → `/feature add` loop → final report
5. Every Bash/Write/Edit tool call routes through `canUseTool` and shows an approval dialog in the browser. Safe reads (Read/Glob/Grep) auto-approve
6. On completion: status → `ready`. Click **Download tar.gz** or **Copy `code <path>`** to continue working, or **Discard** to clean up the worktree + branch

**Expected cost**

~$1–3 in Claude API spend per full run (Opus 4.6, ~60–80 turns across `/init-app` + the `/feature add` loop). Prompt caching is enabled so re-runs within 5 minutes pay only the delta.

**Scope**

- Localhost single-user v1. No hosted SaaS, no session persistence, no queue.
- Form-first flow only. Chat-style `/ideate` proxy is deferred to v2.
- No GitHub push integration — download the tar.gz and `gh repo create` yourself.
- No mobile UI for the forge itself (it's a dev tool, not a product).

See `PLAN.md` § Phase 9 and the 2026-04-11 decisions log entry for the full architectural rationale.

## Getting started

### 1. Create your repo from the template

```bash
gh repo create my-awesome-app --template priorli/triplane --private
cd my-awesome-app
```

### 2. Rename placeholders

```bash
./bin/init.sh my-awesome-app com.myorg.myawesomeapp
```

This renames Kotlin packages (`com.priorli.triplane` → your namespace), moves the source directory layout to match, updates Android `namespace` + `applicationId`, renames `web/package.json`, and copies `web/.env.example` → `web/.env.local` plus `mobile/local.properties.example` → `mobile/local.properties` so you have somewhere to put your secrets.

It deliberately does **not** rewrite `README.md`, `PLAN.md`, `LESSONS.md`, `CLAUDE.md`, or `mobile_plan.md` — you should rewrite those for your project, not have a script mangle them.

Review the changes, then commit:

```bash
git add -A
git commit -m "Initialize my-awesome-app from Triplane template"
```

### 3. Provision backing services

Triplane needs three external services:

- **Neon** (serverless Postgres) — sign up at [neon.tech](https://neon.tech), create a project, copy the connection string into `web/.env.local` as `DATABASE_URL` and `DIRECT_URL`.
- **Clerk** (auth) — create an application at [dashboard.clerk.com](https://dashboard.clerk.com), copy `pk_test_…` and `sk_test_…` into `web/.env.local`, and copy the `pk_test_…` into `mobile/local.properties` as `CLERK_PUBLISHABLE_KEY`.
- **Tigris** (S3-compatible storage, optional — only needed if you keep the items + photos example or build any file upload feature) — run `fly storage create` after `fly launch`, copy `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_ENDPOINT_URL_S3`, and `TIGRIS_BUCKET_NAME` into `web/.env.local`.

If you're going to run the mobile app on Android, also add `GOOGLE_MAPS_API_KEY` to `mobile/local.properties` (Google Cloud → Maps SDK for Android).

### 4. Run the database migration

```bash
cd web
bun install
bunx prisma migrate dev --name init
```

The initial schema includes `User`, `Item`, and `Attachment` — the items + photos example uses all three.

### 5. Run the apps locally

```bash
# Web (from web/)
bun run dev
# → http://localhost:3000

# Android (from another terminal, in mobile/)
./gradlew :composeApp:assembleDebug
# Open mobile/ in Android Studio or IntelliJ to run on an emulator.
```

iOS — `./gradlew :composeApp:compileKotlinIosSimulatorArm64` will succeed, but the app cannot run end-to-end until Phase 7 (Clerk iOS SDK integration) ships. All commonMain code compiles for iOS; only auth is stubbed.

### 6. Add your first feature with Claude Code

Open Claude Code in the project root and run:

```
/feature add notes
```

The `/feature` skill will read `specs/features/_template.md`, draft a spec for you, wait for your approval, and then walk you through implementation on web + mobile. The related `/scaffold` skill generates empty source-file stubs; `/api-change` walks the cascade when you evolve an endpoint; `/release-check` runs all three build verifications in parallel.

Full list of shipped skills:

| Skill | What it does |
|---|---|
| `/feature` | Spec-driven feature workflow (add / check / continue) |
| `/audit` | Repo-wide drift detector — spec ↔ matrix ↔ code |
| `/scaffold` | New-feature file scaffolder (requires approved spec) |
| `/api-change` | Endpoint cascade walker — OpenAPI + server + mobile DTOs + screens + spec |
| `/upgrade-deps` | Kotlin / CMP / AGP / compileSdk cascade handler |
| `/release-check` | Runs web + Android + iOS build verifications in parallel, then `/audit` |

### 7. Verify builds

Before shipping any change:

```bash
cd web && bun run build                                                  # web
cd mobile && ./gradlew :composeApp:assembleDebug                         # Android
cd mobile && ./gradlew :composeApp:compileKotlinIosSimulatorArm64        # iOS compile
```

Or, inside Claude Code: `/release-check`.

### Continuous integration

`.github/workflows/ci.yml` ships with three parallel jobs running the same three build verifications on every push and pull request. It does not require any GitHub secrets — placeholder environment variables let the web build complete without reaching real services. Add real secrets only when you wire up a deploy workflow.

## Documents

- **`LESSONS.md`** — start here. Captures *why* every decision in this template is what it is. The rationale you'll forget in 6 months.
- **`PLAN.md`** — stack table, architecture principles, feature matrix, recent decisions log, phase tracker.
- **`CLAUDE.md`** — workflow rules. Read by Claude Code at every session start. Keep it short.
- **`mobile_plan.md`** — mobile-specific phase tracker. Detailed CMP architecture notes.
- **`specs/features/_template.md`** — the contract format every new feature uses.

## License

TBD — likely MIT once v0.1 ships.

## Built with

- The full [Travolp](https://github.com/haibuiorg/priorli-public) codebase as the source for every extracted pattern
- Claude Code as the day-to-day pair-programmer
- Many late nights resolving "why does iOS not compile when Android works"
