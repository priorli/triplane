---
name: upgrade-deps
description: Use this skill when the user wants to upgrade a mobile-side dependency — Kotlin, Compose Multiplatform, Android Gradle Plugin, compileSdk, Clerk Android SDK, Ktor, Koin, kmp-maps, Coil, Peekaboo — and any other library pinned in `mobile/gradle/libs.versions.toml`. Triggers on phrases like "upgrade Kotlin to X", "bump CMP", "upgrade clerk android", "dependency cascade", "version bump", "upgrade X to Y". Researches the target version's own pinned requirements, walks the cascade of forced upgrades, runs a clean rebuild, and captures the new coherent set in `PLAN.md`'s decisions log. **Also handles web/ dependency bumps** (Next.js, Prisma, Clerk Next.js, etc.) — same workflow, different files.
invocable: true
---

# Dependency upgrade walker

Adopting one new library can force a chain of upgrades that takes most of a session to unravel. Phase 4 hit this: Coil 3.4.0 was fine, but the research agent initially suggested `coil-network-okhttp` which is JVM-only and broke `compileKotlinIosSimulatorArm64` — the actual fix was `coil-network-ktor3`. Clerk Android SDK 1.0.11 required Kotlin 2.3.10 → CMP 1.10.3 → AGP 8.9.1 → compileSdk 36. Each upgrade exposed new errors.

This skill walks the cascade deliberately so the same library doesn't cost two sessions.

> Read `LESSONS.md` § "Pain: Cascading version bumps" and § "Library research patterns" before running this skill on a library you haven't touched before.

## Invariants

1. **Research before editing.** Never bump a version blindly. Always check what the target version itself pins for Kotlin/CMP/AGP — a single bump often drags 3–5 transitive bumps with it.
2. **Read the library's source on GitHub, not its docs site.** Dokka-generated docs 404 and lie. The ground truth is the library's own `libs.versions.toml` or `build.gradle.kts` on GitHub.
3. **Multiplatform network modules are traps.** Libraries with separate `-okhttp` / `-android` / `-jvm` / `-ktor2` / `-ktor3` modules — always verify which variant works in commonMain. Our canonical rule: **prefer the Ktor 3 variant** if available, since Ktor 3.1.1 is already in the project.
4. **Clean rebuild is not optional.** After version changes, run with `--rerun-tasks` at least once — the Kotlin cache lies.
5. **Capture the new pinned set in `PLAN.md`'s decisions log.** Every major bump is a dated row. Future sessions need to know what the current known-coherent set is without re-discovering it.

## Step 1 — Identify the starting point

Ask the user (or infer from context):
- Which library? (`kotlin`, `compose-multiplatform`, `agp`, `clerk-android`, `ktor`, `koin`, `kmp-maps`, `coil`, `peekaboo`, or a `web/package.json` entry)
- Target version? Exact pin — "latest" is not actionable without research.
- Why? (new feature that needs it? security CVE? deprecated version?)

If the user says "latest", add a research step: check the library's GitHub releases page via WebFetch, report the latest stable version, confirm with the user.

## Step 2 — Research the cascade

### Mobile libraries

Read the target version's own requirements. For each library below, the authoritative source is:

| Library | Where to look |
|---|---|
| Kotlin | kotlinlang.org releases page, or `kotlinx-*` libraries' compatibility matrices |
| Compose Multiplatform | github.com/JetBrains/compose-multiplatform release notes |
| Android Gradle Plugin | developer.android.com/build/releases/gradle-plugin |
| compileSdk / minSdk | Android SDK release notes |
| Clerk Android SDK | github.com/clerk/clerk-android `releases` tab + the target version's `build.gradle.kts` |
| Ktor | ktor.io/changelog or the release's `gradle/libs.versions.toml` on GitHub |
| Koin | github.com/InsertKoinIO/koin — check `projects/core/build.gradle.kts` for its Kotlin pin |
| kmp-maps | github.com/software-mansion/kmp-maps release notes + `gradle/libs.versions.toml` |
| Coil 3 | github.com/coil-kt/coil release notes — critically, which `coil-network-*` module to use |
| Peekaboo | github.com/onseok/peekaboo — relatively low churn but still verify |

Use WebFetch on the target version's tag page (e.g., `github.com/coil-kt/coil/releases/tag/3.4.0`) and on the `build.gradle.kts` / `libs.versions.toml` of the tag (e.g., `github.com/coil-kt/coil/blob/3.4.0/gradle/libs.versions.toml`).

### Web libraries

For `web/` bumps, read `node_modules/next/dist/docs/01-app/` (Next.js 16 ships docs locally) or the official package's GitHub release notes.

### Cascade worksheet

For each library in the cascade, record:
- Current version in `libs.versions.toml` (or `package.json`)
- Target version
- Required downstream bumps (Kotlin → CMP → AGP → compileSdk if applicable)

Present the worksheet to the user and confirm before editing any file.

## Step 3 — Apply the coherent set

Edit `mobile/gradle/libs.versions.toml` with all new pins at once. Do not commit intermediate partial-upgrade states — a half-upgraded versions file is worse than either full state.

For web dependencies, edit `web/package.json` and run `bun install` to update `bun.lock`.

## Step 4 — Clean rebuild

### Mobile
```bash
cd mobile && ./gradlew :composeApp:compileDebugKotlinAndroid --rerun-tasks
```

If this succeeds, run the full trio:
```bash
cd mobile && ./gradlew :composeApp:assembleDebug
cd mobile && ./gradlew :composeApp:compileKotlinIosSimulatorArm64
```

### Web
```bash
cd web && rm -rf .next && bun run build
```

## Step 5 — Handle breakage

When a build fails after a bump, the failure is almost always one of:

1. **JVM-only module in commonMain** — the error mentions `platform.type 'jvm'` vs `'native'`. Find the Multiplatform variant of the library (usually `-ktor3` or `-ios` suffixed) and swap.
2. **Removed/renamed API** — the library deprecated something. Web-search for the migration guide, apply the fix.
3. **Stale Gradle cache** — even with `--rerun-tasks`, sometimes `.gradle/` and `.kotlin/` hold bad state. Last resort: `./gradlew --stop && rm -rf .gradle .kotlin build/ composeApp/build/ shared/build/ && ./gradlew clean`. Warn the user before running this — it's destructive to build caches, not to source, but it wastes minutes rebuilding.
4. **Kotlin/Native incompat** — something that worked on Android broke on iOS. Usually `String.format`, JVM-only stdlib calls, or a transitive JVM-only dependency. Find the call site, replace with a multiplatform alternative.
5. **AGP / Gradle version skew** — bumping AGP may require a matching Gradle wrapper version. Check `gradle/wrapper/gradle-wrapper.properties`.

Fix each one at the source. Do not `@Suppress` warnings that came from the bump.

## Step 6 — Log the change

After all three builds pass, append a row to `PLAN.md`'s decisions log:

```
| YYYY-MM-DD | Upgraded <library> to <version> | <reason — new feature, CVE, deprecation>. Cascade: <list all versions that moved>. Gotchas: <anything surprising, e.g., "coil-network-okhttp is JVM-only, had to swap to coil-network-ktor3">. |
```

Also update the "Stack" table at the top of `PLAN.md` if one of the primary-row versions changed (Kotlin, CMP, AGP, Clerk Android, etc.).

## Step 7 — Report

Tell the user:
- What versions moved (before → after, in a table)
- Which builds passed
- Any manual follow-up they need to do (e.g., "kmp-maps changed `MapBounds` shape — any feature using it needs to re-verify")
- Reminder: if the bump is a major version, read the library's migration guide for behavioral changes that won't cause compile errors but will cause runtime differences

## Known gotchas (append new ones here as you discover them)

- **`coil-network-okhttp` is JVM-only** — never use in commonMain, use `coil-network-ktor3` instead
- **Clerk Android SDK** forces cascading Kotlin/CMP/AGP/compileSdk bumps on every minor version — factor in the cascade cost before bumping
- **KDoc on Kotlin/Native** chokes on `{...}` with unbalanced braces (interpreted as unclosed inline tags) — use `//` line comments for text containing braces, see Phase 4 decisions log entry
- **Next.js 16** route handler `params` is `Promise<...>` — old Next.js 14/15 handlers won't compile on 16
- **`extendZodWithOpenApi(z)` must be called in `responses.ts` itself**, not in `registry.ts` only, if API routes import schemas from `responses.ts` (import-order race)

## Files this skill touches frequently

- `mobile/gradle/libs.versions.toml` — primary edit target for mobile bumps
- `mobile/composeApp/build.gradle.kts` — add/remove library implementations
- `mobile/shared/build.gradle.kts` — same
- `mobile/settings.gradle.kts`, `mobile/build.gradle.kts` — plugin versions
- `mobile/gradle/wrapper/gradle-wrapper.properties` — Gradle version
- `web/package.json`, `web/bun.lock` — for web bumps
- `PLAN.md` — decisions log + stack table

## Related skills

- `/release-check` — always run after a dependency bump to verify all three builds still pass
- `/api-change` — separate concern; this skill is for library versions, that one is for API contracts
- `/audit` — safe to run after a bump to verify no feature drifted (new library versions sometimes break assumptions)
