---
name: api-change
description: Use this skill when the user wants to change, add, remove, or evolve any `/api/v1/*` endpoint — request shape, response shape, field additions, field renames, HTTP-method changes, new endpoints. Triggers on phrases like "change the X API", "add a field to Y response", "update the API for Z", "propagate API change", "api change", "modify the endpoint", "rename field in items API", "add pagination to items". Walks the full cascade — OpenAPI schema, zod validation, server handler, client serializer, web pages, mobile DTOs, mobile mapper, mobile domain model, mobile screens, spec file — and makes sure nothing drifts. Prevents the "change the server, forget the mobile DTO, deserialization throws at runtime" failure mode.
invocable: true
---

# API change cascade walker

Every `/api/v1/*` endpoint is touched by at least eight files spread across three surfaces (`web/` server, `web/` client, `mobile/shared/` domain + data + mapper, `mobile/composeApp/` screens). When the shape of an endpoint changes, all of those files must change together or they silently drift apart. This skill is the checklist that prevents drift.

> Read `LESSONS.md` § "Pain: Spec/matrix drift" once for the why. The short version: updating one place is friction; updating eight places is a guarantee that the 8th gets forgotten. A skill that enumerates the cascade in one pass is the cheapest antidote.

## Invariants

1. **Enumerate before editing.** Always produce the full cascade list and present it to the user before touching any file. Let them approve or trim.
2. **No partial changes.** If you can't walk the full cascade in one session, stop and report what's left — don't ship half an API change.
3. **Build verify after editing.** All three build commands (web, Android, iOS) must pass before the skill declares done.
4. **Update the spec file.** The spec's API table and Request/Response Schemas section must reflect the change. If the spec drifts, future sessions re-learn the wrong shape.
5. **Log non-obvious changes in `PLAN.md`'s decisions log.** Add a row with the date and the reason. Renames especially — git blame will not tell a future reader *why* a field was renamed.

## Step 1 — Identify the change

Ask the user precisely what's changing. Common shapes:

- **Add field** — new field on a response DTO (requires backfill default for existing data?)
- **Rename field** — old name → new name (breaking for mobile clients pinned to old version)
- **Remove field** — deprecation path? return null for a while first?
- **Change type** — `string` → `number`, `string` → `Instant`, nullable → required
- **New endpoint** — full new route + registration + mobile API method + use case
- **Remove endpoint** — mobile clients still calling it will 404
- **HTTP method change** — POST → PATCH, etc.

Get specifics: which resource, which field, what the old and new shapes look like.

## Step 2 — Enumerate the cascade

For the affected resource `<resource>` (e.g., `items`, `attachments`), list the files that depend on its shape:

### Web — API contract
- **Zod schema:** `web/src/lib/openapi/responses.ts` — response schema, request schema, any nested schemas
- **OpenAPI registration:** `web/src/lib/openapi/routes/<resource>.ts` — route summary/description/params/responses
- **Route handler:** `web/src/app/api/v1/<resource>/**/route.ts` — the actual implementation
- **Server serializer:** `web/src/lib/<resource>.ts` — `serialize<Resource>()` and any helpers that shape the response
- **Client-safe types:** `web/src/lib/<resource>-types.ts` — the client-facing TypeScript type used by client components

### Web — UI
- **Server Component pages:** `web/src/app/[locale]/(app)/<name>/page.tsx`, `[id]/page.tsx`
- **Client Components:** `web/src/app/[locale]/(app)/<name>/_components/*.tsx` — any that destructure the response shape
- **i18n:** `web/src/messages/en-US/common.json` — if a new user-facing label is needed

### Mobile — shared KMM
- **DTOs:** `mobile/shared/.../data/remote/dto/<Name>Dto.kt` and `<Name>Dto.kt` siblings (request/response wrappers)
- **API wrapper:** `mobile/shared/.../data/remote/api/<Name>Api.kt` — method signature may change
- **Mapper:** `mobile/shared/.../data/mapper/<Name>Mapper.kt` — DTO → domain translation
- **Domain model:** `mobile/shared/.../domain/model/<Name>.kt` — data class field
- **Repository interface:** `mobile/shared/.../domain/repository/<Name>Repository.kt` — method signature
- **Repository impl:** `mobile/shared/.../data/repository/<Name>RepositoryImpl.kt`
- **Use case:** `mobile/shared/.../domain/usecase/<name>/*.kt` — parameter list

### Mobile — Compose
- **ViewModels:** `mobile/composeApp/.../feature/<name>/<Name>sViewModel.kt`, `<Name>DetailViewModel.kt`
- **Screens:** `mobile/composeApp/.../feature/<name>/<Name>sListScreen.kt`, `<Name>DetailScreen.kt`
- **Components:** `mobile/composeApp/.../feature/<name>/components/*.kt` — if they destructure the domain model

### Contract documents
- **Spec file:** `specs/features/<name>.md` — API table + Request/Response Schemas section + any affected Web or Mobile Implementation notes
- **PLAN.md decisions log:** add a dated row if the change is non-obvious (rename, breaking change, migration step)

Present this list. Ask the user to confirm or trim before editing.

## Step 3 — Walk each location

Make changes in the order above (web contract → web UI → mobile shared → mobile Compose → docs). Each edit should be minimal and surgical — don't refactor surrounding code. If a file doesn't need changing, skip it but say so ("web/src/lib/items.ts unchanged — the serializer already supported the new field").

For type changes, remember the Phase 4 gotchas:
- **zod/v4** is what the project uses: `import { z } from "zod/v4"`
- **Timestamps** are ISO-8601 strings on the wire, `kotlinx.datetime.Instant` in the mobile domain (use `Instant.parse`)
- **Never use `String.format`** in commonMain — iOS Kotlin/Native doesn't support it
- **Presigned URLs** on responses are transient; new transient fields should get a matching `*ExpiresAt` companion if the client needs to know when to re-fetch
- **Next.js 16**: dynamic route params are `Promise<...>` — if you add a new `[id]` route, `await params`

## Step 4 — Build verification

Run all three in parallel:
- `cd web && bun run build`
- `cd mobile && ./gradlew :composeApp:assembleDebug`
- `cd mobile && ./gradlew :composeApp:compileKotlinIosSimulatorArm64`

All three must pass. If a build fails, read the error, trace it back to one of the cascade locations, and fix it there — don't paper over with a cast or `@Suppress`.

## Step 5 — Update docs

1. Edit `specs/features/<name>.md` to reflect the new API table row or schema fields. Check the `Spec synced with OpenAPI docs` status box is still valid (re-tick it if you were forced to untick during the change).
2. Add a `PLAN.md` decisions log entry if the change is non-obvious. Format:
   ```
   | YYYY-MM-DD | <resource> API — <one-line change> | <why>. <what migration steps downstream apps need>. |
   ```
3. If the change is breaking for mobile clients, note it prominently — future readers should be able to find out that a field disappeared without reading the diff.

## Step 6 — Report

End with a short summary:
- What endpoint changed
- Which files were touched (count + list)
- Verification status (3 builds ✅ / failures)
- What the user should manually smoke test (usually the affected flow on web at minimum)
- Reminder: if the mobile app is deployed, a new build is required — old clients will still see the old shape

## Files this skill touches frequently

- `web/src/lib/openapi/responses.ts` — zod schemas
- `web/src/lib/openapi/routes/<resource>.ts` — OpenAPI registration
- `web/src/app/api/v1/<resource>/**/route.ts` — server handlers
- `web/src/lib/<resource>.ts` and `<resource>-types.ts` — serializers + client types
- `web/src/app/[locale]/(app)/<name>/**` — pages and client components
- `mobile/shared/src/commonMain/kotlin/com/priorli/triplane/shared/data/remote/dto/` — DTOs
- `mobile/shared/src/commonMain/kotlin/com/priorli/triplane/shared/data/mapper/` — mappers
- `mobile/shared/src/commonMain/kotlin/com/priorli/triplane/shared/domain/model/` — domain models
- `mobile/composeApp/src/commonMain/kotlin/com/priorli/triplane/feature/<name>/` — screens + ViewModels
- `specs/features/<name>.md` — the contract
- `PLAN.md` — decisions log

## Related skills

- `/feature continue` — for implementing new feature work; `/api-change` is for evolving existing contracts
- `/scaffold` — when the change adds a whole new endpoint, you may want to scaffold the new mobile files first
- `/release-check` — run after finishing the cascade to confirm everything still builds
