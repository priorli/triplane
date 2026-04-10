# Triplane Mobile — Plan

> Mobile-specific architecture and phase tracker. Read alongside `PLAN.md`. **This is the template's plan.** When you create an app from Triplane, replace this content with your app's mobile plan (the structure stays).

## Overview

Mobile client architecture: **Compose Multiplatform 1.10+** with **Clean Architecture** in a KMM shared module. Single Compose UI codebase for both Android and iOS (~95% code sharing). The web app's `/api/v1/*` routes (44+ endpoints in a real app) serve as the backend.

## Key architectural decisions

- **Compose Multiplatform** — iOS stable since May 2025 (v1.8.0). Single UI codebase across platforms.
- **Clean Architecture in KMM shared module** — Domain (models, use cases, repository interfaces) → Data (DTOs, API client, repository implementations, mappers) → Presentation (ViewModels + Compose UI). Domain depends on nothing.
- **Feature-based folder structure** — `feature/items/`, `feature/auth/`, etc. Each contains screens, viewmodels, and components together. Shared components in `common/`.
- **Native Clerk SDKs for auth** — Clerk Android SDK on Android (`clerk-android-api` + `clerk-android-ui`). Clerk iOS SDK on iOS (Phase 7). Google sign-in via Android Credential Manager / Sign in with Apple. No WebView.
- **commonMain by default, expect/actual at platform seams only.** The list of platform-specific files should be short and audit-able.
- **2D maps via `com.swmansion.kmpmaps:core`** — Google Maps on Android, Apple Maps on iOS, all map composition shared in commonMain. Only `openExternalMap()` is platform-specific.
- **Per-platform matrix columns from day 1** — `Mobile (Android)` and `Mobile (iOS)` are separate. Coarse "Mobile" columns hide platform gaps.
- **Error handling** — `ApiException` for structured API errors, Ktor `HttpResponseValidator` intercepts non-2xx, logging via `println` (Logcat / Xcode).
- **Build environments** — Debug points at staging API, Release points at production API, both via Android `BuildConfig`.

---

## Project structure (mobile/)

```
mobile/
├── shared/                            # KMM shared module (domain + data)
│   └── src/
│       ├── commonMain/kotlin/com/priorli/<app>/
│       │   ├── domain/
│       │   │   ├── model/             # Trip, Item, Stop, etc.
│       │   │   ├── usecase/           # GetItemsUseCase, CreateItemUseCase, ...
│       │   │   └── repository/        # ItemRepository (interface)
│       │   ├── data/
│       │   │   ├── remote/api/        # ApiClient (Ktor), ApiException
│       │   │   ├── remote/dto/        # Request/response DTOs (kotlinx-serialization)
│       │   │   ├── mapper/            # DTO ↔ domain
│       │   │   ├── repository/        # ItemRepositoryImpl
│       │   │   └── auth/              # AuthTokenProvider (interface)
│       │   ├── di/                    # SharedModule (Koin)
│       │   └── util/                  # PolylineDecoder, formatters, ...
│       ├── androidMain/               # Ktor OkHttp engine
│       └── iosMain/                   # Ktor Darwin engine
├── composeApp/                        # Shared Compose UI
│   └── src/
│       ├── commonMain/kotlin/com/priorli/<app>/
│       │   ├── App.kt                 # Root composable
│       │   ├── common/
│       │   │   ├── UiState.kt         # Loading / Success<T> / Error
│       │   │   ├── TokenStorage.kt    # expect — platform-specific token persistence
│       │   │   ├── MapColors.kt       # DAY_COLORS + MODE_COLORS (mirrors web)
│       │   │   └── theme/Theme.kt     # Material 3
│       │   ├── feature/
│       │   │   ├── auth/
│       │   │   │   ├── AuthScreen.kt  # expect — platform-native auth
│       │   │   │   └── AuthState.kt   # expect — rememberIsSignedIn(), signOut()
│       │   │   ├── items/             # Phase 4 — items + photos example
│       │   │   │   ├── ItemsListScreen.kt
│       │   │   │   ├── ItemDetailScreen.kt
│       │   │   │   ├── ItemsViewModel.kt
│       │   │   │   ├── ItemDetailViewModel.kt
│       │   │   │   └── components/    # ItemCard, PhotoGallery, ImagePickerSheet, ...
│       │   │   └── maps/              # Maps utilities (kmp-maps wrapper helpers)
│       │   │       ├── MapCameraUtils.kt
│       │   │       └── ExternalMap.kt # expect — open in native maps app
│       │   ├── navigation/
│       │   │   ├── Routes.kt          # @Serializable route classes
│       │   │   └── NavGraph.kt
│       │   └── di/
│       │       ├── AppModule.kt       # ViewModels + Compose-side services
│       │       └── PlatformModule.kt  # expect — platform DI (auth, base URL)
│       ├── androidMain/               # MainActivity, Clerk Android, openExternalMap (Intent)
│       │   └── kotlin/com/priorli/<app>/
│       │       ├── MainActivity.kt
│       │       ├── feature/auth/
│       │       │   ├── AuthScreen.android.kt   # Clerk AuthView
│       │       │   └── AuthState.android.kt
│       │       ├── feature/maps/ExternalMap.android.kt
│       │       ├── di/PlatformModule.android.kt
│       │       └── common/TokenStorage.android.kt
│       ├── iosMain/                   # MainViewController, Clerk iOS (Phase 7)
│       │   └── kotlin/com/priorli/<app>/
│       │       ├── MainViewController.kt
│       │       ├── feature/auth/
│       │       │   ├── AuthScreen.ios.kt       # Stub until Phase 7
│       │       │   └── AuthState.ios.kt
│       │       ├── feature/maps/ExternalMap.ios.kt
│       │       ├── di/PlatformModule.ios.kt
│       │       └── common/TokenStorage.ios.kt
│       └── debug/                     # Debug-only AndroidManifest (cleartext HTTP for emulator)
├── iosApp/                            # iOS Xcode wrapper (Phase 3)
│   └── iosApp.xcodeproj
├── gradle/libs.versions.toml          # Pinned versions
├── local.properties.example
├── build.gradle.kts
├── settings.gradle.kts
└── gradle.properties                  # JVM heap (-Xmx4096M required for Clerk SDK)
```

---

## Pinned dependencies

```toml
[versions]
kotlin = "2.3.10"
compose-multiplatform = "1.10.3"
agp = "8.9.1"
ktor = "3.1.1"
kotlinx-serialization = "1.7.3"
kotlinx-coroutines = "1.9.0"
kotlinx-datetime = "0.6.2"
koin = "4.0.4"
navigation-compose = "2.9.2"
lifecycle = "2.10.0"
clerk-android = "1.0.11"
kmp-maps = "0.9.1"
android-compileSdk = "36"
android-minSdk = "26"
android-targetSdk = "35"
```

The `/upgrade-deps` skill (Phase 5) handles cascades when bumping any of these.

---

## Build requirements

- Kotlin 2.3.10+
- Compose Multiplatform 1.10+
- Android Gradle Plugin 8.9.1+
- compileSdk 36
- Gradle JVM heap 4GB+ (`-Xmx4096M -XX:MaxMetaspaceSize=1024m` in `gradle.properties`)

These are the floor versions required by Clerk Android SDK 1.0.11. Bumping any one of them can trigger a cascade — see `LESSONS.md` § Cascading version bumps.

### `local.properties` (gitignored)

```
sdk.dir=/path/to/Android/sdk
CLERK_PUBLISHABLE_KEY=pk_test_...   # Clerk Dashboard
GOOGLE_MAPS_API_KEY=AIza...         # Google Cloud → Maps SDK for Android
```

- `CLERK_PUBLISHABLE_KEY` → `BuildConfig.CLERK_PUBLISHABLE_KEY` (passed to `Clerk.initialize()` in `MainActivity`)
- `GOOGLE_MAPS_API_KEY` → `manifestPlaceholders["googleMapsApiKey"]` → `<meta-data android:name="com.google.android.geo.API_KEY" .../>` in AndroidManifest. Apple Maps on iOS needs no key.

---

## Mobile phase tracker

| Sub-phase | Goal | Status |
|---|---|---|
| **3.0** | Mobile extraction from Travolp — clean CMP + KMM scaffold, Clerk Android auth, navigation, DI, Ktor API client | 🔲 |
| **3.1** | Verify `:composeApp:assembleDebug` and `:composeApp:compileKotlinIosSimulatorArm64` both green | 🔲 |
| **4.0** | Items + photos feature — list/detail/create/edit/delete + photo upload via Peekaboo + Coil 3 image loading | 🔲 |
| **4.1** | Verify items feature on Android end-to-end (sign in → list → create → upload photo → view detail → delete) | 🔲 |
| **7.0** | Clerk iOS SDK integration — replaces `AuthScreen.ios.kt` stub | 🔲 |
| **7.1** | Verify items feature on iOS end-to-end (same flow) | 🔲 |

(Triplane phases 1, 2, 5, 6 are documentation/skills/web/polish — not in this mobile-specific tracker.)

---

## Mobile parity gaps (until Phase 7)

- **iOS** — `AuthScreen.ios.kt` is a stub (`Text("Phase 7")`). `rememberIsSignedIn()` hardcoded to `false`. `TokenStorageAuthProvider` reads from an empty store. All commonMain code compiles for iOS but no feature runs end-to-end. Phase 7 unblocks every feature on iOS at once.

---

## What's shared vs platform-specific

| Layer | Shared (commonMain) | Platform-specific (expect/actual) |
|---|---|---|
| Domain models | ✅ | — |
| Use cases | ✅ | — |
| Repository interfaces | ✅ | — |
| Repository implementations | ✅ | — |
| API client (Ktor) | ✅ (engine factory in platform) | OkHttp / Darwin engine |
| DI definitions | ✅ commonMain | PlatformModule actuals |
| ViewModels | ✅ commonMain | — |
| UI screens | ✅ commonMain (Compose) | — |
| Navigation | ✅ commonMain | — |
| Theme | ✅ commonMain | — |
| Auth UI | expect | Clerk Android / Clerk iOS |
| Token storage | expect | SharedPreferences / NSUserDefaults |
| Maps 2D | ✅ commonMain (kmp-maps) | — |
| External map intent | expect | `geo:` Intent / `comgooglemaps://` URL |
| Image picker | ✅ commonMain (Peekaboo) | — |
| Image loading | ✅ commonMain (Coil 3) | — |

**Estimated sharing: ~95%** — only auth SDK (until Phase 7), token storage, and external intents are platform-specific.
