# Triplane Mobile

> Phase 3 — Compose Multiplatform scaffold extracted from Travolp.
>
> This directory is a placeholder until Phase 3 ships. See [`../mobile_plan.md`](../mobile_plan.md) for the detailed phase tracker.

## What will go here

- **Compose Multiplatform 1.10+** with Kotlin 2.3.10
- **KMM shared module** (`shared/`) — domain models, use cases, repository interfaces, Ktor API client, Koin DI
- **Compose UI** (`composeApp/`) — shared screens, ViewModels, navigation, theme; ~95% of code in commonMain
- **Native auth** via Clerk Android SDK (Android) and Clerk iOS SDK (iOS, Phase 7)
- **2D maps** via `com.swmansion.kmpmaps:core` — Google Maps on Android, Apple Maps on iOS, all composition shared
- **Image picker** via Peekaboo (no expect/actual needed)
- **Image loading** via Coil 3 (multiplatform)
- **Clean Architecture** — Domain → Data → Presentation
- **Feature-based folders** — `feature/items/`, `feature/auth/`, etc.

The full structure, pinned versions, and platform-specific seam list are documented in [`../mobile_plan.md`](../mobile_plan.md).

## Build verification (once Phase 3 ships)

```bash
cd mobile && ./gradlew :composeApp:assembleDebug                              # Android
cd mobile && ./gradlew :composeApp:compileKotlinIosSimulatorArm64             # iOS
```

**Always run BOTH.** Android-green doesn't mean iOS-green — see `LESSONS.md` § Pre-existing iOS-incompat code.

## Required local config

`mobile/local.properties` (gitignored — copy from `local.properties.example` once Phase 3 ships):

```
sdk.dir=/path/to/Android/sdk
CLERK_PUBLISHABLE_KEY=pk_test_...
GOOGLE_MAPS_API_KEY=AIza...
```
