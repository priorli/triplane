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

**Triplane is under active construction.** This is the initial scaffold. Sub-phases:

| Phase | Status | What it delivers |
|---|---|---|
| 1. Skeleton + docs | 🟡 In progress | Directory tree, LESSONS.md, README, PLAN.md, CLAUDE.md, `/feature` skill |
| 2. Web extraction | 🔲 | Clean Next.js + Clerk + i18n + Prisma + OpenAPI scaffold from Travolp |
| 3. Mobile extraction | 🔲 | Clean CMP + KMM + Clean Architecture + auth scaffold from Travolp |
| 4. Items + photos example | 🔲 | One end-to-end feature: API + web + mobile + spec + matrix entry. Proves the template runs and demonstrates the hardest pattern (cross-platform file upload). |
| 5. Skills library | 🔲 | `/audit`, `/scaffold`, `/api-change`, `/upgrade-deps`, `/release-check` |
| 6. Polish | 🔲 | `bin/init.sh` (rename placeholders), CI templates, getting-started guide, v0.1 release |

See `PLAN.md` for the full plan.

## How to use this template (once v0.1 ships)

```bash
gh repo create my-app --template priorli/triplane --private
cd my-app
./bin/init.sh my-app   # rename placeholders, generate env files
cd web && bun install
cd ../mobile && ./gradlew :composeApp:assembleDebug
```

Then ask Claude Code: `/feature add my-first-feature`. The skill will draft the spec, scaffold web + mobile + API, and walk you through implementation.

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
