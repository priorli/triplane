# Docker Setup Guide for Triplane Web

Triplane ships with a working Dockerfile + docker-compose setup. This guide explains what each piece does and how to use it for local production builds and deployment.

## Files in this directory

- **`Dockerfile`** — multi-stage build (deps → builder → runner) producing a ~270 MB image
- **`docker-compose.yml`** — runs the production image locally, optionally with a local Postgres
- **`docker-entrypoint.sh`** — runs `prisma migrate deploy` before starting the server
- **`.dockerignore`** — excludes `node_modules`, `.next`, `.env*`, etc.

The Docker build context is the **repo root** (so the Dockerfile can `COPY web/`). When you build with `docker compose build` from `web/`, the `context: ..` in `docker-compose.yml` walks up to the repo root.

## Local dev (without Docker — recommended for iteration)

Nothing changes. Use:

```sh
cd web && bun run dev
```

Docker is only for testing the production build locally and for deployment. Dev with hot reload is always faster outside containers.

## Build and run the production image locally

```sh
cd web

# Build the image (first time takes a few minutes, subsequent builds use the cache)
docker compose build

# Start it — uses your .env.local for Neon + Clerk + Tigris keys
docker compose up
```

Then open `http://localhost:3000` and verify `/api/v1/health` returns `{"data":{"status":"ok",...}}`.

To stop: `Ctrl+C`, then `docker compose down`.

## Fully-offline dev with a local Postgres

If you want to develop without hitting Neon (e.g. on a plane):

1. Update `.env.local` to point at the local db:
   ```
   DATABASE_URL="postgresql://postgres:postgres@db:5432/triplane?schema=public"
   DIRECT_URL="postgresql://postgres:postgres@db:5432/triplane?schema=public"
   ```
2. Uncomment the `depends_on` block in `docker-compose.yml`.
3. Run: `docker compose --profile local-db up --build`

Migrations will run automatically on container start via the entrypoint script.

## Deploying anywhere

Any platform that runs Docker images will work: **Fly.io, Railway, Render, a VPS with Docker, AWS ECS, Google Cloud Run, Kubernetes**, etc.

For Fly.io specifically (the recommended deploy target — `fly.toml` lives at the repo root and references `web/Dockerfile`):

```sh
brew install flyctl
fly launch                       # detects Dockerfile, asks for app name and region
fly secrets set DATABASE_URL="..." DIRECT_URL="..." CLERK_SECRET_KEY="..."  # ...etc
fly deploy
```

For other platforms, the Dockerfile is portable — just point your build at the repo root with `--file web/Dockerfile`.

## Environment variables at build vs runtime

An important distinction that trips people up:

- **`NEXT_PUBLIC_*` variables are baked in at build time.** They get hardcoded into the JavaScript bundle. If you change them, you must rebuild the image.
- **All other env vars are read at runtime.** You can change `DATABASE_URL`, `CLERK_SECRET_KEY`, etc. by restarting the container with new env — no rebuild needed.

This means: if you have `NEXT_PUBLIC_*` keys that differ between staging and production, you need **two separate image builds**, or you accept that those values are the same across environments.

For server-side secrets (`CLERK_SECRET_KEY`, `AWS_SECRET_ACCESS_KEY`, etc.) you set them per-environment when you start the container.

## Image size expectations

A healthy build should produce a runtime image around **250–320 MB**. Mostly that's:

- Node.js runtime (~170 MB for `node:20-slim`)
- Prisma CLI + engines (~50 MB)
- Your app's standalone bundle (~20–50 MB depending on dependencies)
- OpenSSL + tini (~10 MB)

If you see images over 600 MB, something is wrong — probably `.dockerignore` is letting `node_modules` in, or `output: "standalone"` is missing from `next.config.ts`.

## Why these config choices

### `output: "standalone"` in `next.config.ts`

Standalone mode produces a minimal `.next/standalone/server.js` that the Docker runner stage copies. Drops image size dramatically vs copying the full `.next/` and `node_modules/`.

### `outputFileTracingIncludes` for Prisma

Next.js traces dependencies for the standalone bundle, but sometimes misses Prisma's generated client and native engines. The explicit include in `next.config.ts` ensures Prisma works inside the container.

### `serverExternalPackages: ["@prisma/client", "prisma"]`

Tells Next.js that Prisma is an external package so it's not bundled into the server build (Prisma needs to resolve its engines at runtime).

### `binaryTargets = ["native", "debian-openssl-3.0.x"]` in `schema.prisma`

When Prisma generates its client on your Mac/Windows machine, it compiles engines for your local OS. Inside the Docker runner (Debian slim), it needs a different binary. `native` keeps local dev working, `debian-openssl-3.0.x` matches `node:20-slim`.

> If you switch the Docker base image to Alpine, use `linux-musl-openssl-3.0.x` instead. For AWS Lambda or similar, add `rhel-openssl-3.0.x`.

## Troubleshooting

### `Query engine binary for current platform "debian-openssl-3.0.x" could not be found`

`schema.prisma` is missing `binaryTargets = ["native", "debian-openssl-3.0.x"]`, or you changed it but didn't re-run `bun run postinstall` before the build.

### `Cannot find module '@/generated/prisma'`

The Prisma client wasn't generated during the Docker build. Verify the `RUN npx prisma generate` line exists in the builder stage of the Dockerfile. Also confirm the `src/generated/prisma` path matches the `output` in `schema.prisma`.

### `server.js: not found` when the container starts

`output: "standalone"` isn't set in `next.config.ts`, so Next.js never produced `.next/standalone/server.js`.

### Migrations fail on first startup

Check that `DATABASE_URL` and `DIRECT_URL` are both set in the container's environment, and that the database is reachable from inside the container (if using local Postgres via docker-compose, the hostname is `db`, not `localhost`).
