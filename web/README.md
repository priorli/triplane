# Triplane Web

> Phase 2 — Next.js scaffold extracted from Travolp.
>
> This directory is a placeholder until Phase 2 ships. See [`PLAN.md`](../PLAN.md) for the phase tracker.

## What will go here

- **Next.js 16** (App Router) with TypeScript 5.6+
- **Clerk** authentication (matches the mobile app's Clerk Android/iOS SDK integration)
- **Prisma 7** + Neon (serverless Postgres)
- **next-intl** for URL-based locale routing
- **OpenAPI 3.1** via `zod-to-openapi` + Scalar UI at `/api/v1/docs`
- **Tailwind CSS 4** + shadcn/ui
- **Tigris** (Fly.io S3-compatible) for file storage
- **Bun** as the package manager

The structure (`src/app/api/v1/*`, `src/app/[locale]/(app|marketing)/*`, `src/lib/openapi/`, etc.) is documented in [`PLAN.md`](../PLAN.md) § Project structure.

## Build verification (once Phase 2 ships)

```bash
cd web && bun install
cd web && bun run build
```
