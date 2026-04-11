---
name: seed-demo
description: Use this skill to populate a downstream Triplane project's local database with realistic fake data for a presentation or demo. Triggers on phrases like "seed demo data", "populate the app with demo content", "we have a presentation coming up", "add fake records for a demo", "prepare the app for a walkthrough", "fill the database with sample items", "seed the db", "demo mode". Reads `web/prisma/schema.prisma` to enumerate models, generates (or regenerates) `web/prisma/seed.ts` with `@faker-js/faker`-powered fixtures scoped to a hardcoded demo user, patches `web/package.json` to wire up Prisma's seed config and a `db:seed` script, runs `bun install` to pick up Faker, and optionally runs `bun run db:seed` immediately if `DATABASE_URL` is set. Idempotent — running twice produces the same database state because (a) the seed clears prior demo records before re-creating, (b) the Faker PRNG is pinned to `faker.seed(42)`. **Never touches `web/src/**`, mobile code, or any file outside `web/prisma/seed.ts` and `web/package.json`.** Refuses to run on the pristine Triplane template (only downstream projects). Re-runnable anytime after `/feature add` introduces new models.
invocable: true
---

# /seed-demo — populate the downstream app for a presentation

You are configuring a downstream Triplane project so the presenter can show a populated app at their demo instead of an empty first-run state. Empty tables are technically correct but telegraph "this is a prototype" to anyone watching. Realistic records telegraph "this is a real product."

Your job is to: (1) read the current Prisma schema, (2) generate a working `web/prisma/seed.ts` that inserts Faker-powered records for every user-owned model, (3) wire the project so `bun run db:seed` is a one-liner, and (4) optionally run the seed against the dev database. The web UI and both mobile clients hit the same API, so seeding the server-side DB is enough — no mobile-side changes are needed.

## Invariants

1. **Only modifies `web/prisma/seed.ts` and `web/package.json`.** Never touches any file under `web/src/`, `mobile/`, `specs/`, `.claude/`, `PLAN.md`, `CLAUDE.md`, or `README.md`. If a follow-up asks you to "update the README so presenters know how to run the seed" — say no and suggest that as a separate task.
2. **Never creates Attachments.** The Items+Photos feature's `Attachment` records reference Tigris S3 via presigned URLs, and generating fake presigned URLs would 404 at read time (worse than no attachments at all). v1 seeds only records that don't need external storage. This is a known limitation documented in the "Future work" section below.
3. **Never calls Tigris, S3, MinIO, or any object-storage service.** No presigned-URL generation, no uploads, no bucket listing. The seed runs against Prisma only.
4. **Never creates a Clerk user through the Clerk API.** The demo user exists only in the local Prisma `User` table. Signing in as the demo user requires either a matching Clerk dev user (set up manually in the Clerk dashboard) or the `requireSuperAdmin` dev-promote bypass. Document this in the final report — don't try to be clever about it.
5. **Scopes record creation to a single hardcoded demo user.** Use `DEMO_USER_ID = "user_demo_triplane_seed"` and `DEMO_USER_EMAIL = "demo@triplane.local"`. This namespace is distinct from any plausible real user ID, so delete-and-reseed only affects demo data — never a real test user.
6. **Idempotent.** Running the skill twice produces the same database state. The generated seed hard-deletes prior demo records (scoped to `DEMO_USER_ID`) before reseeding, and uses a pinned Faker PRNG (`faker.seed(42)`) so the re-created records are byte-identical across runs.
7. **Never runs the seed without checking `DATABASE_URL` first.** Read `.env.local` and `.env` to detect the var. If it's missing, generate the files anyway (that's valuable standalone) but refuse to execute `bun run db:seed` and tell the user the exact command to run themselves once they set it.
8. **Refuses on Triplane's pristine template.** Grep `web/` and `mobile/` for `com.priorli.triplane`. If that literal string is present anywhere, the template hasn't been initialized via `/init-app` yet — refuse with a one-line pointer at `/init-app`. The template itself must stay empty; only downstream projects get seeded.
9. **Never hard-deletes real user data.** The `deleteMany` in the generated seed is scoped by `userId: DEMO_USER_ID`. If you find yourself writing a Prisma call without that filter, stop. Real users are soft-deleted; demo users are hard-deleted. Do not mix the two.
10. **Never regenerates the seed over user-authored logic without asking.** If `web/prisma/seed.ts` contains anything other than the Triplane stub (detect the literal string `"nothing to seed in the base scaffold"` at line 20), stop and ask: overwrite / back-up-then-overwrite / abort.

## Step 1 — Pre-flight checks

Run these in parallel; halt on any failure:

1. **Repo root detection.** Locate the repo root (it has a `web/` directory and a `PLAN.md`). If you're not in a Triplane repo, halt.
2. **Template freshness check.** Grep for `com.priorli.triplane` in `web/` and `mobile/`. If present anywhere, the project is still the pristine template. Halt with:
   > This skill only runs on initialized downstream projects. It looks like `/init-app` hasn't run yet. Run `/init-app` first, then re-run `/seed-demo`.
3. **Required files exist.** `web/prisma/schema.prisma`, `web/prisma/seed.ts`, `web/package.json`. If any is missing, halt with a one-line message naming the missing file.
4. **`DATABASE_URL` detection.** Check `.env.local` and `.env` (in that order, `.env.local` wins per the dotenv precedence used at `web/prisma/seed.ts:13-14`). Record whether the var is set. This controls whether Step 7 runs the seed automatically.

## Step 2 — Read the Prisma schema

Read `web/prisma/schema.prisma`. Enumerate every `model` block. For each:

- **Model name** and whether it's the `User` model or something else.
- **Required vs optional fields**, and their types (String, Int, DateTime, Boolean, enum, relation).
- **Foreign keys to User.** Look for `userId String` + a matching `user User @relation(...)`. Any model with that pair is a "user-owned model" and is a candidate for seeding.
- **Soft-delete columns.** Note which models have `deletedAt DateTime?`. The generated seed doesn't set `deletedAt` (soft-delete is a runtime concern, not a seed concern), but the field list matters for Prisma input types.
- **Related-model links.** Note cases like `Attachment.itemId → Item.id` — if you're skipping a related model (attachments in v1), make sure the generator doesn't try to create it.

Report the findings to the user in one short block: "I see models X, Y, Z. Of those, Y and Z are user-owned and will be seeded. Attachments are skipped (v1 limitation — needs S3)."

## Step 3 — Check the existing `web/prisma/seed.ts`

Read it. Classify into one of three states:

- **Triplane stub.** If the file contains the literal string `"nothing to seed in the base scaffold"` at or near line 20, this is the unmodified template stub. Proceed to overwrite.
- **Prior `/seed-demo` output.** If the file contains the literal string `"user_demo_triplane_seed"` (the `DEMO_USER_ID` from a prior run), this is a re-run. Proceed to overwrite — the generator's output is deterministic, so the "new" file will be identical unless the schema has changed.
- **User-authored logic.** Anything else — e.g., a custom seed script the user wrote by hand. Stop and ask:
  > `web/prisma/seed.ts` looks user-authored (no Triplane stub marker, no `/seed-demo` marker). Overwrite, back up first (to `seed.ts.bak`) then overwrite, or abort?

Wait for an explicit answer. Never silently clobber.

## Step 4 — Plan the `web/package.json` patches

Read `web/package.json`. Record whether each of these is present; plan to add whichever is missing:

1. **`@faker-js/faker` in `devDependencies`.** If missing, plan a `bun add -D @faker-js/faker` call (lets bun resolve the latest stable). The generated seed imports `faker` from this package.
2. **Prisma seed config.** The top-level `"prisma": { "seed": "bun run prisma/seed.ts" }` block. If missing, plan to add it — this is what enables `bunx prisma db seed`.
3. **`"db:seed"` script.** The convenience entry in `"scripts"`: `"db:seed": "bun run prisma/seed.ts"`. If missing, plan to add it — this is what the user actually runs during a demo setup.

If all three are already present (the skill was run before), report that and skip to Step 6.

## Step 5 — Generate the new `seed.ts` content

Build the replacement file. The skeleton below is the canonical shape for the Items+Photos baseline. For projects with additional user-owned models, extend the generator — for every model found in Step 2 (except User, which is upserted separately), emit a `deleteMany` + `createMany` pair modeled on the Items block.

```ts
// web/prisma/seed.ts — generated by /seed-demo
//
// Populates the local dev database with Faker-powered demo records owned by
// a single hardcoded demo user. Idempotent: running `bun run db:seed` twice
// produces the same state (demo records are hard-deleted and re-created; the
// Faker PRNG is pinned so the re-creation is byte-identical).
//
// To regenerate this file after adding new Prisma models, re-run /seed-demo.

import { config } from "dotenv";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../src/generated/prisma/client";
import { faker } from "@faker-js/faker";

config({ path: ".env.local" });
config({ path: ".env" });

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// Hardcoded Clerk-shaped user ID. Distinct namespace so clearing demo data
// never touches real test users. Matches the `web/src/lib/auth.ts` upsert
// shape, so signing in as this user (if a matching Clerk dev user exists)
// would hit the same row idempotently.
const DEMO_USER_ID = "user_demo_triplane_seed";
const DEMO_USER_EMAIL = "demo@triplane.local";
const ITEM_COUNT = 20;

async function main() {
  console.log(`Seeding demo data under user ${DEMO_USER_ID}...`);

  // 1. Upsert the demo User.
  await prisma.user.upsert({
    where: { id: DEMO_USER_ID },
    create: { id: DEMO_USER_ID, email: DEMO_USER_EMAIL },
    update: { email: DEMO_USER_EMAIL },
  });

  // 2. Clear prior demo Items (hard delete — demo data, not real user data).
  await prisma.item.deleteMany({ where: { userId: DEMO_USER_ID } });

  // 3. Pin the Faker PRNG so re-runs produce byte-identical records.
  faker.seed(42);

  // 4. Create N Items with realistic titles and descriptions.
  const items = Array.from({ length: ITEM_COUNT }, () => ({
    userId: DEMO_USER_ID,
    title: faker.commerce.productName(),
    description: faker.commerce.productDescription(),
  }));
  await prisma.item.createMany({ data: items });

  console.log(`✓ Seeded ${ITEM_COUNT} Items for ${DEMO_USER_ID}`);
  console.log(`  Sign in as this user (or use the dev-promote bypass) to see them.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

**Generator rules for additional models** (if Step 2 found user-owned models beyond `Item`):

- **One `deleteMany` + `createMany` pair per model**, in dependency order (parents first — e.g., Item before Attachment — so FKs are satisfied).
- **Skip models that require external storage.** `Attachment` has `storageKey String @unique` pointing at Tigris. Skip it entirely in v1 and print a note in the seed's console output: `"Skipped Attachment seeding — requires S3 (v1 limitation)"`.
- **Pick a Faker helper by field name:**
  - `title` → `faker.commerce.productName()`
  - `description` → `faker.commerce.productDescription()`
  - `name` → `faker.person.fullName()` (if the model looks personal) or `faker.company.name()` (if organizational)
  - `email` → `faker.internet.email()`
  - `url` → `faker.internet.url()`
  - `phone` → `faker.phone.number()`
  - `address` → `faker.location.streetAddress()`
  - `body` / `content` → `faker.lorem.paragraphs(2)`
  - Anything else with a String type → `faker.lorem.sentence()` as a last-resort fallback
  - Int → `faker.number.int({ min: 1, max: 1000 })`
  - Boolean → `faker.datatype.boolean()`
  - DateTime (non-`@default(now())`) → `faker.date.recent({ days: 30 })`
  - Optional fields → 50% chance of being set vs `undefined`
- **Never generate data for `@default(now())` or `@default(cuid())` / `@id` fields** — Prisma fills those automatically.
- **Never generate data for `deletedAt`** — seed only creates live records.
- **Enum fields** — pick the first value in the enum definition. If there are exactly two values, alternate. Don't be fancy.

The generated file must be valid TypeScript that runs under `bun` without any compile-or-runtime error once Faker is installed. If you're unsure about a field type, leave it unset and the downstream developer can fill it in.

## Step 6 — Show the diff and get explicit approval

Before touching any file, show the user:

1. **The new `web/prisma/seed.ts` content** in full. Don't skip to "...generates the rest" — paste the whole file so they can read what's about to land.
2. **The `web/package.json` patches**, as a short diff showing:
   - `devDependencies` gets `"@faker-js/faker": "^..."` (bun will resolve the version)
   - Top-level `"prisma": { "seed": "bun run prisma/seed.ts" }` if missing
   - `"scripts"` gets `"db:seed": "bun run prisma/seed.ts"` if missing
3. **The commands you'll run:**
   - `bun install` (to pull Faker)
   - If `DATABASE_URL` is set: `bun run db:seed`
   - If `DATABASE_URL` is missing: no seed execution; just generate the files and print the exact command for the user to run later.

Ask: "Ready to write these files and run the install, or want changes?"

Wait for explicit approval. "Looks good" is not approval. Only `yes` / `approved` / `go` / `proceed` counts. If the user wants a different item count, a different Faker field mapping, or additional user-owned models seeded — adjust and re-show the diff.

## Step 7 — Apply changes

After approval, in order:

1. **Write `web/prisma/seed.ts`** with the content from Step 5.
2. **Patch `web/package.json`** — add Faker, add Prisma seed config, add `db:seed` script. Preserve the existing key order as much as possible; add new entries at the end of their respective sections.
3. **Run `bun install`** from `web/` to pull `@faker-js/faker`. Surface the exit code.
4. **If `DATABASE_URL` is set**, run `bun run db:seed` from `web/`. Surface the exit code and the stdout (the seed script prints the record count).
5. **If `DATABASE_URL` is missing**, skip the seed and print:
   > `web/prisma/seed.ts` and `web/package.json` are ready. To run the seed, set `DATABASE_URL` in `web/.env.local` and run `cd web && bun run db:seed`.

If any command fails, halt and report the failure. Do not try to roll back — the user can inspect the partial state and decide.

## Step 8 — Final report

Print a short status block — no paragraphs, three to five lines:

> Seed ready.
> Files written: `web/prisma/seed.ts`, `web/package.json`.
> Faker installed: yes/no.
> Seed executed: yes (N Items created) / no (DATABASE_URL missing, command: `cd web && bun run db:seed`).
> Demo user: `user_demo_triplane_seed` / `demo@triplane.local`. Sign in via a matching Clerk dev user or the `requireSuperAdmin` dev-promote bypass.

Do not paste the full seed.ts content again — it's on disk. Do not editorialize.

## Files this skill touches

- **Reads:** `web/prisma/schema.prisma`, `web/prisma/seed.ts` (to classify state), `web/package.json`, `web/.env`, `web/.env.local`
- **Writes:** `web/prisma/seed.ts` (full overwrite), `web/package.json` (surgical patch — Faker dep + Prisma seed config + db:seed script)
- **Runs:** `bun install` (from `web/`), optionally `bun run db:seed` (from `web/`)
- **Never modifies:** anything under `web/src/`, anything under `mobile/`, anything under `specs/`, anything under `.claude/`, `PLAN.md`, `CLAUDE.md`, `README.md`, `mobile_plan.md`, `LESSONS.md`, or any file outside `web/prisma/` and `web/package.json`
- **Never creates:** Attachment records, S3 objects, Clerk users, migration files, or any new source file

## Related skills

- `/init-app` — **must run before this skill.** Bootstraps the downstream project from the pristine template. `/seed-demo` refuses to run until `com.priorli.triplane` has been scrubbed from `web/` and `mobile/`.
- `/feature add` — when a new user-owned Prisma model lands via `/feature add`, re-run `/seed-demo` to refresh the seed with the new model. The generator picks up new models automatically from `schema.prisma`.
- `/ideate` — upstream of `/init-app`, upstream of this skill.
- `/plan-autoplan` — runs before `/init-app` (optional plan review). Orthogonal to seed data.
- `/audit` — unaffected. Seed data doesn't touch the feature matrix or any spec checkbox; `/audit` won't flag or be flagged by demo records.
- `/release-check` — unaffected. Seed data is a dev-only concern; `bun run build` doesn't exercise `web/prisma/seed.ts` at all.

## Future work (v2+)

Documented here so presenters know what's possible and what's not in v1. None of this is implemented.

- **Attachment seeding.** Would require one of three paths: (a) bundle a handful of CC0 sample images under `web/public/demo-images/` and add a second code path in `serializeAttachment()` that emits static public URLs when a `storageKey` matches a bundled-image sentinel, (b) stand up local MinIO via Docker and have the seed script upload real images, or (c) require a real Tigris bucket. v1 skips all three.
- **Multi-user seed data.** A `DEMO_USER_COUNT` env var (default 1) controls how many demo users are created, with items shared between them to demonstrate social features (follows, shares, comments). Needed only if the downstream project has a social feature; trivial to add later.
- **Faker field mapping as config.** A `web/prisma/seed-config.json` file where the user can override the generator's field-name → Faker-helper guesses (e.g., "for `title`, use `faker.music.songName` not `faker.commerce.productName`"). v1 uses the hardcoded mapping in Step 5.
- **Safety rail for non-local `DATABASE_URL`.** Refuse to run the seed if `DATABASE_URL` points at a production host (heuristics: contains "prod", "production", or a known hosted-Postgres domain). v1 scopes delete-and-reseed safely by user ID, but a prod-URL check is cheap insurance.

## When not to use this skill

- **The user wants production seed data** (real users, real content, migration fixtures). Wrong tool — that's a data migration or a seeding script tied to a deploy, not a demo-data skill. Point them at Prisma's migration docs.
- **The user is running this on the pristine Triplane template.** The skill refuses. Run `/init-app` first.
- **The user wants static screenshots without touching any database.** Point at Storybook, a design mockup tool, or Figma. Touching the DB is overkill for still images.
- **The user's presentation needs real images in the app.** v1 skips Attachments. They should either hand-upload a few photos via the real app before the demo, stand up local MinIO, or wait for the v2 attachment-seeding path.
- **The user wants the seed to run automatically on every `bun install`.** Out of scope. The `"prisma": { "seed": "..." }` config enables `bunx prisma db seed` but does not auto-run. Presenters run `bun run db:seed` explicitly when they want demo data.
