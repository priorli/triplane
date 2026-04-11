# Auth

## Description

Triplane's authentication primitive: Clerk on every surface (web, API, Android, iOS). There are no project-owned `/api/v1/auth/*` endpoints — Clerk owns the sign-in/sign-up flow, session lifetime, JWT issuance, and user identity. The project owns (a) the **lazy `User` upsert** that mirrors Clerk identities into the local Postgres on first authenticated request, (b) the **`requireUser()` + `assertOwnership()` helpers** that protect every `/api/v1/*` route, (c) the **`/api/webhooks/clerk` ingestion endpoint** for Clerk → DB sync, (d) the **`<SignIn />`** marketing page on web, and (e) the **native Clerk SDK integrations** on Android (`com.clerk:clerk-android-ui`'s prebuilt `AuthView`) and iOS (Clerk iOS SDK 1.0.9 SPM via a Swift ↔ Kotlin bridge). Auth is treated as **architectural plumbing**, not a spec-driven feature — this spec is backfilled to document the contract that Phases 2 / 3 / 7 already shipped.

> **Why no `/api/v1/auth/*` endpoints?** Clerk's hosted Frontend API handles sign-in, sign-up, password reset, OAuth, MFA, and session management directly from the client. The Triplane backend never sees credentials. It only sees the Clerk-issued JWT (mobile) or session cookie (web), validated by `Clerk.auth()` inside `requireUser()`. This is principle #2: one helper, two transports.

## API

There are **no project-owned `/api/v1/auth/*` routes**. Clerk handles auth flows directly. The auth contract has two server-side touchpoints:

| Method | Path | Request | Response | Owner |
|---|---|---|---|---|
| `POST` | `/api/webhooks/clerk` | Clerk svix-signed webhook payload | `200 OK` (or `400` on bad signature) | Project (Clerk → DB sync) |
| _(implicit)_ | _every `/api/v1/*` route_ | `Authorization: Bearer <jwt>` (mobile) **or** `__session` cookie (web) | `401 { error: { code: "UNAUTHORIZED" } }` if missing/invalid | Project (`requireUser()` helper) |

### Auth contract for every protected route

Every `/api/v1/*` route handler starts with:

```ts
const { userId } = await requireUser();
```

`requireUser()` (in `web/src/lib/auth.ts`):
1. Calls Clerk's `auth()` from `@clerk/nextjs/server` — this transparently handles cookie-based sessions (web) and `Authorization: Bearer <jwt>` headers (mobile).
2. Throws a `401 UNAUTHORIZED` `Response` if no session.
3. **Lazy upserts** the user into the local `User` table: `prisma.user.upsert({ where: { id: userId }, create: { id: userId, email: \`${userId}@placeholder.clerk\` }, update: {} })`. This ensures the first authenticated request always finds a row, even if the Clerk webhook hasn't fired yet. The placeholder email is overwritten by the webhook when it lands.
4. Returns `{ userId }`.

Ownership enforcement (principle #6) is layered on top via `assertOwnership(resourceId, userId, loader)` — a generic helper that takes an async loader returning `{ userId, deletedAt }` and throws `404 NOT_FOUND` if missing, not owned, or soft-deleted.

Admin gating uses `requireSuperAdmin(userId)` (throws `403 FORBIDDEN`) and `isSuperAdmin(userId)` (boolean) — both consult `User.role === "superadmin"` in the local DB.

### Webhook payload

`POST /api/webhooks/clerk` accepts Clerk's standard svix-signed event envelope. Triplane v0.1 handles `user.created`, `user.updated`, `user.deleted` to keep `User.email` in sync with Clerk. Signature verification uses the `CLERK_WEBHOOK_SECRET` env var.

### Error codes

| Code | HTTP | When |
|---|---|---|
| `UNAUTHORIZED` | 401 | No Clerk session present on a protected route |
| `FORBIDDEN`    | 403 | Authenticated but not a superadmin (admin-only routes) |
| `NOT_FOUND`    | 404 | `assertOwnership` failed (resource missing, not owned, or soft-deleted) |

### Token transport

- **Web:** Clerk's `__session` cookie. Set automatically by `<ClerkProvider>` after sign-in. `auth()` reads it server-side.
- **Mobile:** `Authorization: Bearer <jwt>` header. JWT is fetched on demand by the `AuthTokenProvider` interface in the shared module:
  - **Android:** `ClerkAndroidAuthTokenProvider` calls `Clerk.session?.getToken()` on the Clerk Android SDK.
  - **iOS:** `ClerkBridgeAuthTokenProvider` calls `bridge.getTokenAsync(...)` which delegates to `Clerk.shared.auth.getToken()` on the Swift side (must run on `@MainActor` — see Phase 7 decisions log).
- **Token storage:** `TokenStorage` is an `expect`/`actual` interface in the shared module, but Clerk's native SDKs own the actual token storage on both platforms — `TokenStorage` exists for any future non-Clerk auth scheme and is a no-op in v0.1.

## Web Implementation (Next.js 16)

### Pages/Routes affected
- `web/src/app/[locale]/layout.tsx` — wraps the entire locale subtree in `<ClerkProvider>` (above `NextIntlClientProvider`, below the `<html>` element). Note: ClerkProvider is at the locale level, not the root `app/layout.tsx`, so the unlocalized root remains a bare shell.
- `web/src/app/[locale]/(marketing)/sign-in/page.tsx` — renders `<SignIn />` from `@clerk/nextjs` inside a centered flex layout. The `(marketing)` route group is the unauthenticated zone.
- `web/src/app/[locale]/(app)/**` — the authenticated zone. Pages here trust that Clerk middleware has already gated entry; server components inside use `auth()` directly when they need the user id.
- `web/src/app/api/webhooks/clerk/route.ts` — Clerk → DB sync webhook (svix signature verification).
- `web/src/app/api/v1/**/*.ts` — every protected API route handler calls `requireUser()` first.

### Components to create/modify
- **None project-owned.** The sign-in UI is Clerk's hosted `<SignIn />` component. The header sign-out / user menu, when added, will use `<UserButton />` from `@clerk/nextjs`. Triplane v0.1 does not ship a custom auth UI.

### Key interactions
- **Sign in flow:** unauthenticated visitor lands on `/[locale]` (marketing landing) → clicks "Sign in" → routed to `/[locale]/sign-in` → `<SignIn />` handles the entire flow (email, OAuth, MFA) → Clerk sets the `__session` cookie → redirect to `/[locale]/home`.
- **Protected page access:** Clerk's middleware (configured in `web/src/proxy.ts` alongside CORS + i18n) gates the `(app)` route group. Unauthenticated requests are redirected to `/[locale]/sign-in`.
- **API call from web client:** browser `fetch('/api/v1/...')` → `__session` cookie sent automatically → server-side `auth()` reads cookie → `requireUser()` returns `{ userId }`.
- **Webhook landing:** Clerk dashboard → POST → svix verifies → handler upserts/updates/marks-deleted on `User` row. Idempotent.

### Config / env
- `web/.env.example` — `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET`.
- `web/src/proxy.ts` — Clerk middleware combined with i18n locale rewriting and `/api/v1/*` CORS headers.
- `web/prisma/schema.prisma` — `User` model uses Clerk's user id as the PK (no separate `clerkId` column); `email` is unique; `role` is `"user" | "superadmin"`.

## Mobile Implementation (CMP)

### Screens affected
- `mobile/composeApp/src/commonMain/kotlin/com/priorli/triplane/feature/auth/AuthScreen.kt` — `expect fun AuthScreen(onAuthenticated: () -> Unit)`. The platform actuals render the native SDK's prebuilt UI. **Triplane does not ship a custom Compose login form.**
- `mobile/composeApp/src/commonMain/kotlin/com/priorli/triplane/feature/auth/AuthState.kt` — `expect @Composable fun rememberIsSignedIn(): State<Boolean>`. Drives the root nav decision (sign-in vs home) and the sign-out button.

### Composables to create/modify
- `feature/auth/AuthScreen.android.kt` — `actual fun AuthScreen` collects `Clerk.userFlow` via `collectAsStateWithLifecycle()`, calls `onAuthenticated()` on the first non-null user, and renders Clerk's prebuilt `AuthView()` from `com.clerk.ui.auth`.
- `feature/auth/AuthScreen.ios.kt` — `actual fun AuthScreen` calls `getClerkAuthBridge()?.makeAuthViewController(onAuthenticated)` and embeds the result via `UIKitViewController { ... }`.
- `feature/auth/AuthState.android.kt` — `rememberIsSignedIn` collects `Clerk.userFlow` and maps to `Boolean`.
- `feature/auth/AuthState.ios.kt` — uses `DisposableEffect` + `bridge.observeSignedIn(...)` to hook into the Swift-side polling task; cancels the subscription on dispose.
- `feature/auth/ClerkAuthBridge.kt` (iosMain) — Kotlin interface + SAM callback types + `setClerkAuthBridge()` / `getClerkAuthBridge()` top-level accessors. Public visibility (Swift consumes them). See Phase 7 decisions log entry for the rationale of using top-level functions instead of an `object`.
- `navigation/NavGraph.kt` — root composable picks start destination based on `rememberIsSignedIn().value`: `Auth` if signed out, `Home` if signed in. The `AuthScreen`'s `onAuthenticated` callback navigates to `Home` and pops `Auth` off the back stack.

### Shared module changes
- `shared/src/commonMain/kotlin/.../data/remote/AuthTokenProvider.kt` — interface: `suspend fun getToken(): String?`. Injected into `ApiClient` so every Ktor request adds `Authorization: Bearer <jwt>` (skipped for the `uploadHttpClient` used for presigned-URL PUTs — those are pre-authed via query string).
- `shared/src/commonMain/kotlin/.../data/local/TokenStorage.kt` — `expect class TokenStorage` for any future non-Clerk auth scheme. Currently a no-op; Clerk's native SDKs own real token storage.
- **No domain models, use cases, or repositories for auth.** Clerk owns the user object on each platform; the shared `User` model that exists in Triplane is the *DB-mirrored* identity used by `Item.userId` foreign keys, not an auth-flow primitive.

### Platform-specific bindings
- **Android `composeApp/src/androidMain/kotlin/.../di/PlatformModule.android.kt`** — binds `AuthTokenProvider` to a Clerk-Android-backed implementation that calls `Clerk.session?.getToken()`.
- **iOS `composeApp/src/iosMain/kotlin/.../di/PlatformModule.ios.kt`** — binds `AuthTokenProvider` to `ClerkBridgeAuthTokenProvider`, which calls `getClerkAuthBridge()?.getTokenAsync(...)` and wraps the SAM callback in a `suspendCancellableCoroutine`.
- **iOS Swift bridge `mobile/iosApp/iosApp/ClerkAuthBridgeImpl.swift`** — implements the Kotlin `ClerkAuthBridge` protocol. All Clerk calls are `@MainActor`-isolated: sync methods use `MainActor.assumeIsolated { }`, async methods use `Task { @MainActor in ... }`. Critical Swift-side gotchas (per Phase 7 decisions log):
  - `Clerk.configure(publishableKey:)` is a **static** method, not an instance method.
  - `Clerk.shared.auth.getToken()` returns `String?` directly, not a `{ jwt: String }` wrapper.
  - Sign out is `Clerk.shared.auth.signOut()`, not `Clerk.shared.signOut()`.
- **iOS app entry `mobile/iosApp/iosApp/iOSApp.swift`** — calls `Clerk.configure(publishableKey: ...)` then `setClerkAuthBridge(ClerkAuthBridgeImpl())` **before** the first Compose content renders.

### Library / SDK pins
- **Android:** `com.clerk:clerk-android-api:1.0.11` + `com.clerk:clerk-android-ui:1.0.11` (pinned in `mobile/gradle/libs.versions.toml`).
- **iOS:** `clerk-ios` SPM package, version `1.0.9`, products `ClerkKit` + `ClerkKitUI`. Pinned in `mobile/iosApp/iosApp.xcodeproj/project.pbxproj` via `XCRemoteSwiftPackageReference`.
- **Never WebView** — principle #12. Google blocks OAuth in embedded WebViews. This is non-negotiable and load-bearing.

### Config / env
- `mobile/local.properties` — `CLERK_PUBLISHABLE_KEY=pk_test_...` (Android reads via `BuildConfig`).
- `mobile/iosApp/Configuration/Config.xcconfig` — `CLERK_PUBLISHABLE_KEY = pk_test_...` (expanded into `Info.plist` at build time).

## Architectural decisions (load-bearing)

1. **No project-owned auth API endpoints.** Clerk's hosted Frontend API owns sign-in / sign-up / OAuth / MFA / session management. The backend only validates JWTs and mirrors identities into Postgres.
2. **One `requireUser()` helper, two transports.** Cookie (web) + Bearer (mobile) handled by Clerk's `auth()` under one line of code per route.
3. **Lazy `User` upsert in `requireUser()`** — first authenticated request always finds a DB row even if the webhook hasn't fired. Webhook backfills the real email later. Idempotent.
4. **Native Clerk SDKs only — never WebView.** Android: prebuilt `AuthView` from `clerk-android-ui`. iOS: Clerk iOS SDK via Swift, bridged into Kotlin/Native through `ClerkAuthBridge`. Three failed approaches in Travolp burned this rule into LESSONS.md.
5. **iOS Swift ↔ Kotlin bridge uses SAM callbacks**, not Kotlin lambdas, so the boundary is explicit and debuggable from Swift. All Clerk calls hop to `@MainActor` because the Swift `Clerk` class is `@MainActor`-isolated.
6. **`ClerkAuthBridge` accessors are top-level functions**, not an `object` — sidesteps a Kotlin/Native ObjC-exporter edge case with mutable interface-typed object fields. (See `feature/auth/ClerkAuthBridge.kt` doc comment.)
7. **`feature/auth/ClerkAuthBridge.kt` types stay public** while every other Phase-4 `composeApp/feature/items/*` type is marked `internal` to dodge the Kotlin/Native 2.3.10 ObjC exporter `ClassCastException`. Swift needs the bridge types; it doesn't need the Items screens. See Phase 7 decisions log in PLAN.md.

## Status

- [x] API <!-- requireUser/assertOwnership/isSuperAdmin/requireSuperAdmin in web/src/lib/auth.ts; every /api/v1/* route uses them; /api/webhooks/clerk wired -->
- [x] Web <!-- ClerkProvider in [locale]/layout.tsx; /[locale]/sign-in renders <SignIn />; lazy User upsert in requireUser -->
- [x] Mobile (Android) <!-- Clerk Android SDK 1.0.11; AuthScreen.android.kt uses prebuilt AuthView; ClerkAndroidAuthTokenProvider feeds ApiClient (Phase 3) -->
- [x] Mobile (iOS) <!-- Clerk iOS SDK 1.0.9 SPM; ClerkAuthBridge + ClerkAuthBridgeImpl.swift; AuthScreen.ios.kt UIKitViewController (Phase 7, 2026-04-11) -->
- [x] Spec synced with OpenAPI docs <!-- N/A — there are no project-owned /api/v1/auth/* routes; the only related route is /api/webhooks/clerk which is intentionally NOT in OpenAPI (it's a third-party callback, not a public API) -->
