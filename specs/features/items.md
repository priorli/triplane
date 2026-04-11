# Items + Photos

## Description

The canonical example feature for Triplane v0.1: user-owned **Items** (title + optional description) each with zero-or-more photo **Attachments** stored in Tigris S3. Demonstrates CRUD, soft-delete, ownership enforcement, presigned-URL file uploads, and cross-platform image display. Downstream projects should copy this shape for any "entity with attached files" feature. Orphan attachments are not allowed — every attachment has a required `itemId` foreign key, so the client creates the item first and then uploads photos.

## API

All routes under `/api/v1/`. Every route uses Clerk `auth()` via `requireUser()` and enforces ownership via `assertOwnership()`. Request bodies validated with `zod/v4`. Responses use `{ data: T }` / `{ error: { code, message } }` shape.

| Method | Path | Request | Response |
|---|---|---|---|
| `GET`    | `/api/v1/items`                        | —                                                              | `{ data: { items: Item[] } }`       |
| `POST`   | `/api/v1/items`                        | `CreateItemRequest`                                            | `{ data: { item: Item } }`          |
| `GET`    | `/api/v1/items/{id}`                   | —                                                              | `{ data: { item: Item } }`          |
| `PATCH`  | `/api/v1/items/{id}`                   | `UpdateItemRequest` (partial)                                  | `{ data: { item: Item } }`          |
| `DELETE` | `/api/v1/items/{id}`                   | —                                                              | `{ data: { deleted: true } }`       |
| `POST`   | `/api/v1/attachments/presign`          | `PresignRequest`                                               | `{ data: { uploadUrl, storageKey, expiresIn } }` |
| `POST`   | `/api/v1/attachments`                  | `CreateAttachmentRequest`                                      | `{ data: { attachment: Attachment } }` |
| `DELETE` | `/api/v1/attachments/{id}`             | —                                                              | `{ data: { deleted: true } }`       |

### Request/Response Schemas

**`Item`**
```ts
{
  id: string                    // cuid
  userId: string                // Clerk user id
  title: string                 // 1..200 chars
  description: string | null    // 0..2000 chars
  createdAt: string             // ISO-8601
  updatedAt: string             // ISO-8601
  attachments: Attachment[]     // filtered to non-deleted only
}
```

**`Attachment`**
```ts
{
  id: string                    // cuid
  itemId: string                // required FK
  fileName: string
  fileType: string              // MIME, whitelisted: image/jpeg|png|webp
  fileSize: number              // bytes
  url: string                   // presigned GET URL, transient
  urlExpiresAt: string          // ISO-8601, ~1hr from response time
  createdAt: string
}
```

> The `url` field is a **server-generated presigned GET URL**. Do not cache it beyond `urlExpiresAt`. The Tigris bucket is private; all reads go through server-issued URLs so ownership stays enforced (principle #6).

**`CreateItemRequest`**
```ts
{ title: string (1..200), description?: string (0..2000) }
```

**`UpdateItemRequest`** — any subset of:
```ts
{ title?: string (1..200), description?: string (0..2000) }
```

**`PresignRequest`**
```ts
{
  fileName: string              // 1..255 chars
  fileType: "image/jpeg" | "image/png" | "image/webp"
  fileSize: number              // 1..10_485_760 (10MB)
}
```

**`PresignResponse.data`**
```ts
{
  uploadUrl: string             // presigned PUT URL
  storageKey: string            // attachments/<userId>/<cuid>.<ext>
  expiresIn: number             // seconds (900 = 15 min)
}
```

**`CreateAttachmentRequest`**
```ts
{
  itemId: string                // required — no orphan attachments
  storageKey: string            // from presign response
  fileName: string
  fileType: string              // MIME, same whitelist as presign
  fileSize: number
}
```

### Error codes

| Code | HTTP | When |
|---|---|---|
| `UNAUTHORIZED`      | 401 | No Clerk session |
| `NOT_FOUND`         | 404 | Item/attachment missing, soft-deleted, or owned by someone else |
| `VALIDATION_ERROR`  | 400 | Zod validation failed |
| `UNSUPPORTED_MEDIA` | 415 | File type not in whitelist |
| `PAYLOAD_TOO_LARGE` | 413 | File size > 10MB |

### Soft-delete semantics

- `DELETE /api/v1/items/{id}` — sets `Item.deletedAt`. Does NOT cascade-delete attachments (their rows remain intact so undo is possible later). List queries filter `deletedAt: null`.
- `DELETE /api/v1/attachments/{id}` — sets `Attachment.deletedAt`. The Tigris object is preserved.
- `GET /api/v1/items/{id}` filters `deletedAt: null` on **both** the Item AND the nested Attachments — soft-deleted attachments stop being served even while the parent Item is still live.

## Web Implementation (Next.js 16)

### Pages/Routes affected
- `web/src/app/[locale]/(app)/items/page.tsx` — list (Server Component; `await params`)
- `web/src/app/[locale]/(app)/items/[id]/page.tsx` — detail (Server Component; `await params`)
- `web/src/app/[locale]/(app)/layout.tsx` — add "Items" nav link
- `web/src/app/[locale]/(app)/home/page.tsx` — add "View items" card linking to `/items`

### Components to create
- `items/_components/ItemsListClient.tsx` — `'use client'`, `useAuth()` + `fetch('/api/v1/items')`, grid of cards
- `items/[id]/_components/ItemDetailClient.tsx` — `'use client'`, photo gallery + edit/delete
- `items/_components/CreateItemDialog.tsx` — shadcn Dialog: title/description + optional initial photos
- `items/_components/PhotoUploader.tsx` — presign → PUT → save metadata flow
- `items/_components/DeleteConfirmDialog.tsx` — confirm destructive action

### Key interactions
- Create item: dialog → POST `/items` → get id → for each picked photo, presign → PUT → POST `/attachments`
- Detail page shows photo gallery via `next/image` (needs `remotePatterns` for Tigris host with `search: ''` to tolerate presigned-URL query strings)
- All data access via `fetch('/api/v1/...')` — never direct Prisma from pages (principle #3)

### Config changes
- `web/next.config.ts` — add `images.remotePatterns` for Tigris host
- `web/.env.example` — **remove** leftover `NEXT_PUBLIC_UPLOAD_STRATEGY` (presign is the only strategy)
- `web/src/messages/en-US/common.json` — add `items.*` i18n keys

## Mobile Implementation (CMP — Android now, iOS gated on Phase 7)

### Screens affected
- `mobile/composeApp/src/commonMain/kotlin/com/priorli/triplane/feature/items/` (new)
  - `ItemsListScreen.kt`, `ItemsViewModel.kt`
  - `ItemDetailScreen.kt`, `ItemDetailViewModel.kt`
  - `components/ItemCard.kt`
  - `components/PhotoGallery.kt`
  - `components/CreateItemSheet.kt` — ModalBottomSheet
  - `components/ImagePickerButton.kt` — wraps Peekaboo `rememberImagePickerLauncher`
  - `components/EditItemDialog.kt`
- `feature/home/HomeScreen.kt` — add "View items" Card linking to `ItemsList`. **Home stays as post-auth landing** so Phase 7's iOS smoke test has a non-feature destination to prove auth works before Items gets brought up.

### Composables to create/modify
- `navigation/Routes.kt` — add `object ItemsList` and `data class ItemDetail(val itemId: String)`
- `navigation/NavGraph.kt` — add composables; start destination stays `Home`
- `di/AppModule.kt` — register `ItemsViewModel` and parameterized `ItemDetailViewModel(itemId)`

### Shared module changes
`mobile/shared/src/commonMain/kotlin/com/priorli/triplane/shared/`:
- `domain/model/Item.kt`, `Attachment.kt` — data classes (`urlExpiresAt: kotlinx.datetime.Instant`)
- `domain/repository/ItemRepository.kt`, `AttachmentRepository.kt` — separate interfaces (Clean Architecture, one aggregate per repo)
- `domain/usecase/items/` — `GetItemsUseCase`, `GetItemUseCase`, `CreateItemUseCase`, `UpdateItemUseCase`, `DeleteItemUseCase`
- `domain/usecase/attachments/` — `UploadAttachmentUseCase`, `DeleteAttachmentUseCase`
- `data/remote/dto/` — `ItemDto`, `AttachmentDto`, `CreateItemRequestDto`, `UpdateItemRequestDto`, `PresignRequestDto`, `PresignResponseDto`, `CreateAttachmentRequestDto`
- `data/remote/api/ItemApi.kt`, `AttachmentApi.kt` — Ktor wrappers, unwrap `ApiDataWrapper<T>`
- `data/mapper/ItemMapper.kt` — DTO ↔ domain, `Instant.parse` for timestamps (**no `String.format`, no JVM-only stdlib**)
- `data/repository/ItemRepositoryImpl.kt`, `AttachmentRepositoryImpl.kt`
- `di/SharedModule.kt` — bind repos + register use cases

### Library additions
- **Peekaboo 0.5.2** (`io.github.onseok:peekaboo-image-picker`) — image picker, returns `ByteArray`, works from commonMain with no expect/actual
- **Coil 3.4.0** (`io.coil-kt.coil3:coil-compose` + `coil-network-okhttp`) — `AsyncImage` for HTTPS URLs and ByteArray previews; zero setup
- **iOS `Info.plist`** — add `NSPhotoLibraryUsageDescription` + `NSCameraUsageDescription` (harmless to add now; needed when Phase 7 unblocks iOS)

### Upload flow on mobile
1. Peekaboo → `ByteArray`
2. `AttachmentApi.presign(fileName, fileType, fileSize)` → `{ uploadUrl, storageKey, expiresIn }`
3. `httpClient.put(uploadUrl) { setBody(ByteArray); contentType(ContentType.parse(fileType)) }` — **use full URL to bypass baseUrl defaults**, don't re-attach the Authorization header (presigned URL is pre-authed)
4. `AttachmentApi.saveAttachmentMetadata({ itemId, storageKey, ... })` → persistent Attachment row
5. Refresh detail screen state → new attachment renders via Coil `AsyncImage(model = attachment.url)`

## Architectural decisions (pressure-tested)

1. `Attachment.itemId` is **NOT NULL**. Two-phase create (item first → photos second). No orphan-cleanup job in v0.1.
2. **Presign-only** upload strategy. `NEXT_PUBLIC_UPLOAD_STRATEGY` scaffolding removed.
3. Private bucket + server-generated **presigned GET** URLs with `urlExpiresAt` (principle #6 — ownership enforced in every route).
4. Separate `AttachmentRepository` — matches Clean Architecture (principle #10); future features (avatars, documents) can reuse.
5. `HomeScreen` kept as minimal post-auth landing — Phase 7 iOS auth bring-up needs a non-feature destination to smoke-test in isolation.

## Status
- [x] API
- [x] Web
- [x] Mobile (Android)
- [x] Mobile (iOS)  <!-- Phase 7 shipped — `xcodebuild build` green. Interactive sign-in verification is a user step with a real Clerk key. -->
- [x] Spec synced with OpenAPI docs
