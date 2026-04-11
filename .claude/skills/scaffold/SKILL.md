---
name: scaffold
description: Use this skill when the user wants to create the empty file structure for a new feature — the source files that a spec describes, but not the real logic. Triggers on phrases like "scaffold stubs for X", "create file structure for Y", "stub out the Z feature files", "generate the skeleton for the notes feature". Refuses to run unless `specs/features/<name>.md` already exists — spec-first is non-negotiable. Use `/feature` add mode first to draft and approve the spec, then `/scaffold` to generate the skeleton.
invocable: true
---

# Feature file scaffolder

Creates the canonical file skeleton for a new feature across `web/`, `mobile/shared/`, and `mobile/composeApp/`. Treats `specs/features/items.md` as the structural reference — every new feature starts looking like a simplified Items + Photos example and diverges from there.

This skill **complements** `/feature` add mode, it doesn't replace it:
- `/feature add <name>` → drafts `specs/features/<name>.md`, gets user approval, registers the row in `PLAN.md`
- `/scaffold <name>` → reads the approved spec and generates placeholder source files
- `/feature continue <name>` → the user fills in the real logic layer by layer

## Invariants

1. **Refuse without a spec.** If `specs/features/<slug>.md` doesn't exist, stop immediately: "Run `/feature` add mode first — every feature needs an approved spec before code."
2. **Present before writing.** List every file this skill will create, wait for the user's "approved", then write them in one batch.
3. **Stubs only.** Placeholder files compile but do nothing meaningful. They contain `TODO:` markers and return canned values. The user fills in real behavior via `/feature continue`.
4. **No new dependencies.** If the feature needs Peekaboo-style new libraries, that's `/upgrade-deps` work, not this skill's.
5. **Update DI and nav.** Scaffolding a feature that isn't wired into Koin and the nav graph is worse than useless — the user has to find the stubs later. Always register the stub ViewModel in `AppModule.kt` and add the route to `NavGraph.kt`.

## Step 1 — Gather inputs

1. Ask the user for the feature slug if not provided (lowercase, kebab-case — e.g., `notes`, `workouts`, `recipes`).
2. Verify `specs/features/<slug>.md` exists. Refuse if not.
3. Read the spec to derive:
   - Feature display name (first heading, e.g., "Notes")
   - Resource path for API routes (usually the slug, e.g., `notes` → `/api/v1/notes`)
   - Domain model name (PascalCase singular, e.g., "Note")
   - Whether the feature has sub-entities that need their own repos (like Attachment) — if so, ask the user to confirm before scaffolding each one
4. Read `web/src/lib/openapi/index.ts` to determine where to add the new route registration import.

## Step 2 — Present the file list

Present an ordered list of files the skill will create. Mark each as **new** or **modified**. Example:

```
About to scaffold the `notes` feature:

Web API (new):
  web/src/app/api/v1/notes/route.ts
  web/src/app/api/v1/notes/[id]/route.ts

Web OpenAPI (new + modified):
  web/src/lib/openapi/routes/notes.ts                    (new)
  web/src/lib/openapi/responses.ts                       (modified — add noteSchema stub)
  web/src/lib/openapi/index.ts                           (modified — add import)

Web UI (new):
  web/src/app/[locale]/(app)/notes/page.tsx
  web/src/app/[locale]/(app)/notes/_components/NotesListClient.tsx

Mobile shared (new):
  mobile/shared/.../domain/model/Note.kt
  mobile/shared/.../domain/repository/NoteRepository.kt
  mobile/shared/.../domain/usecase/notes/GetNotesUseCase.kt
  mobile/shared/.../data/remote/dto/NoteDto.kt
  mobile/shared/.../data/remote/api/NoteApi.kt
  mobile/shared/.../data/mapper/NoteMapper.kt
  mobile/shared/.../data/repository/NoteRepositoryImpl.kt

Mobile shared (modified):
  mobile/shared/.../di/SharedModule.kt                   (add bindings)

Mobile Compose (new):
  mobile/composeApp/.../feature/notes/NotesListScreen.kt
  mobile/composeApp/.../feature/notes/NotesViewModel.kt

Mobile Compose (modified):
  mobile/composeApp/.../di/AppModule.kt                  (register ViewModel)
  mobile/composeApp/.../navigation/Routes.kt             (add @Serializable object NotesList)
  mobile/composeApp/.../navigation/NavGraph.kt           (add composable entry)

Reply "approved" to write, or tell me what to change.
```

Wait for the user to approve. Do not write files until they do.

## Step 3 — Write the files

Use the Items + Photos feature as the structural template for each file type:

### Web API route stub

```ts
import { ok, fail } from "@/lib/api-response";
import { requireUser } from "@/lib/auth";

export async function GET() {
  try {
    const { userId } = await requireUser();
    // TODO: query prisma.<model> and serialize
    return ok({ <resource>: [] });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await requireUser();
    const body = await request.json();
    // TODO: validate with zod, create record
    return ok({ todo: "implement POST /api/v1/<resource>" }, 201);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
```

The `[id]/route.ts` file uses the Next.js 16 `params: Promise<...>` pattern:

```ts
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  // ...
}
```

### Web OpenAPI stub
Add a minimal `<name>Schema` to `responses.ts`, a stub `routes/<name>.ts` with one placeholder `registry.registerPath({ ... })` call, and the side-effect import in `openapi/index.ts`. Follow the items/attachments pattern exactly.

### Web UI stub
`page.tsx` delegates to a `'use client'` list component that fetches `/api/v1/<resource>` and renders a placeholder. Match the `ItemsListClient.tsx` shape.

### Mobile shared stubs
Domain model is a data class with a single id field and a TODO. Repository interface has a single `list<Name>s(): List<Name>` method. Impl calls the API, maps through `ItemMapper`-style pattern but much smaller. DTOs mirror the domain model shape.

### Mobile Compose stubs
`<Name>sListScreen.kt` uses `Scaffold` + `Text("TODO: implement <name>s list")`. `<Name>sViewModel.kt` is a no-op ViewModel that satisfies the Koin binding.

### DI + Nav updates

Add to `SharedModule.kt`:
```kotlin
singleOf(::<Name>Api)
singleOf(::<Name>Mapper)
singleOf(::<Name>RepositoryImpl) bind <Name>Repository::class
factoryOf(::Get<Name>sUseCase)
```

Add to `AppModule.kt`:
```kotlin
viewModelOf(::<Name>sViewModel)
```

Add to `Routes.kt`:
```kotlin
@Serializable
object <Name>sList
```

Add to `NavGraph.kt`:
```kotlin
composable<<Name>sList> {
    <Name>sListScreen(onBack = { navController.navigateUp() })
}
```

And wire a link from `HomeScreen.kt` or another existing entry point if the user asks — otherwise leave navigation-from-nowhere as a TODO.

## Step 4 — Verify

After writing, run the three build commands:
- `cd web && bun run build`
- `cd mobile && ./gradlew :composeApp:assembleDebug`
- `cd mobile && ./gradlew :composeApp:compileKotlinIosSimulatorArm64`

If any fail, do not roll back automatically — fix the stubs so they compile. The most likely failures are missing imports, parameterized ViewModels needing explicit factories, or the OpenAPI extension order issue (see `PLAN.md` decisions log entry for Phase 4).

## Step 5 — Tell the user what's next

Report:
- Files created + count
- That builds pass (or what's broken)
- Next step: "Run `/feature continue <name>` to replace the TODOs with real implementations, or open the files directly."

## Files this skill touches

- Reads: `specs/features/<slug>.md`, `PLAN.md`, `web/src/lib/openapi/index.ts`, Items + Photos reference files
- Writes: the list in Step 2 (approximately 12–16 files for a basic feature)
- **Does not** touch `PLAN.md` itself — `/feature` add mode already registered the matrix row

## Related skills

- `/feature` add mode — must run first to produce the spec
- `/feature continue` — fills in the real logic after scaffolding
- `/api-change` — use this after scaffolding if the spec's API shape evolves
