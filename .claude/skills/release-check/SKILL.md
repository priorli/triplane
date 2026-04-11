---
name: release-check
description: Use this skill before shipping or tagging a release, or any time the user wants a one-command "is everything green" verification of the full monorepo. Triggers on phrases like "release check", "pre-release", "verify everything", "full build", "run all builds", "ready to ship", "is the repo clean", "green-light check". Runs the three build verifications (web, Android, iOS) in parallel, then cross-checks drift via `/audit`. Reports pass/fail with actionable next steps. Does not run unit tests (there aren't any in v0.1) and does not run manual smoke tests.
invocable: true
---

# Pre-release verification

Bundles the three build commands listed in `CLAUDE.md` § "Build verification" plus a drift audit into a single invocation. If you're about to tag `v0.1` or push `main`, run this first.

## What it does

1. **Runs three builds in parallel** (single message with parallel Bash calls):
   - `cd web && bun run build` — Next.js production build, TypeScript check
   - `cd mobile && ./gradlew :composeApp:assembleDebug` — Android APK build (full Kotlin compile + R8)
   - `cd mobile && ./gradlew :composeApp:linkDebugFrameworkIosSimulatorArm64` — iOS framework link (catches `String.format`, JVM-only patterns, AND the ObjC exporter). **Must be `link`, not `compile`** — `compileKotlinIosSimulatorArm64` only runs source-level compile and skips the ObjC header exporter, which can silently green while the framework link task fails (Phase 4 shipped a regression that way and it took until Phase 7 to find).

2. **Invokes `/audit`** to detect spec/matrix/code drift.

3. **Reports a single summary**:
   ```
   Release check — <timestamp>
   ✅ Web build        (bun run build)
   ✅ Android build    (:composeApp:assembleDebug)
   ✅ iOS framework    (:composeApp:linkDebugFrameworkIosSimulatorArm64)
   ✅ Drift audit      (no drift detected)

   Status: READY TO SHIP
   ```
   Or, if anything is red:
   ```
   Release check — <timestamp>
   ✅ Web build
   ❌ Android build    (:composeApp:assembleDebug — see error below)
   ⏸️  iOS framework   (skipped — Android failed)
   ⏸️  Drift audit     (skipped — build failed)

   Status: NOT READY
   Failures:
     <error excerpt with file:line>

   Next: fix the Android build, then re-run `/release-check`.
   ```

## Invariants

1. **Parallel by default.** Always launch the three builds in a single message with multiple Bash tool calls — never sequentially. Sequential wastes minutes on a clean repo and is indistinguishable from "cautious" to the user.
2. **Fail fast, but show all failures.** If any one of the three fails, report all three results (don't abort the others). The user wants to see whether "build A is broken and B is fine" or "everything is broken".
3. **Do not fix anything.** This skill is read-only except for the build's own side effects (`.next/`, `composeApp/build/`, etc.). Reporting is the whole job.
4. **Always run `/audit` after the builds**, unless the user explicitly asked for builds-only. Drift is the second-most common reason a "ready to ship" claim is wrong.
5. **iOS compile failures are load-bearing.** Do not skip iOS if Android passed — `LESSONS.md` § "Pain: Pre-existing iOS-incompat code discovered late" explains why. `String.format` and JVM-only stdlib calls are invisible on Android.

## Step 1 — Preconditions

1. Confirm the repo is at `main` (or ask the user to confirm) — release checks on a feature branch are useful but should be noted.
2. Check for uncommitted changes via `git status --short`. Warn the user if there are any, but do not block the check — local changes are sometimes the whole reason for running this.
3. Don't rely on any specific CI or environment config — this skill runs local builds only.

## Step 2 — Run all three builds in parallel

In a single assistant turn, call three Bash tools:

```
Bash: cd /Users/haibui/others/triplane/web && bun run build
Bash: cd /Users/haibui/others/triplane/mobile && ./gradlew :composeApp:assembleDebug
Bash: cd /Users/haibui/others/triplane/mobile && ./gradlew :composeApp:compileKotlinIosSimulatorArm64
```

Collect all three results before reporting.

## Step 3 — Run drift audit

After the builds complete (pass or fail), invoke the `/audit` skill's workflow from `.claude/skills/audit/SKILL.md`:
1. Glob `specs/features/*.md`
2. Verify each against code + PLAN.md matrix
3. Report drift

Do NOT duplicate the audit skill's logic — re-read its instructions and apply them. Better: when the `/loop` or `/release-check` skill is actually available as a command, delegate to `/audit` directly.

## Step 4 — Compose the summary

Format:

```
## Release check — <YYYY-MM-DD HH:MM>

### Builds
- [✅|❌] Web build          — cd web && bun run build
- [✅|❌] Android build      — :composeApp:assembleDebug
- [✅|❌] iOS compile        — :composeApp:compileKotlinIosSimulatorArm64

### Drift
- [✅|⚠️] No drift detected / <N> drift items (see below)

### Status
READY TO SHIP / NOT READY

### Failures (if any)
<one block per failure with error excerpt and file:line>

### Not verified
- Manual web smoke test (sign in → Home → Items → create → upload → delete)
- Manual Android smoke test on device/emulator
- iOS runtime (gated on Phase 7 — all iOS features are 🔲 until then)
```

Keep each section under 10 lines unless there are real failures to explain.

## Step 5 — Actionable follow-ups

Regardless of outcome, end with a short "next steps" line:
- If green: "Ready to tag. Don't forget to run the manual smoke test on web."
- If red: "Fix <specific failing task>, then re-run `/release-check`."
- If drift: "Run `/feature check <name>` or `/feature continue <name>` for drifting features, then re-run `/release-check`."

## Files this skill touches

- **Read-only for source:** `specs/features/*.md`, `PLAN.md`, anything the audit reads
- **Writes build artifacts:** `web/.next/`, `mobile/composeApp/build/`, `mobile/shared/build/`, `mobile/.gradle/` — these are build-tool side effects, not source modifications
- **Never modifies:** any source file, `PLAN.md`, `specs/**`, or `.claude/skills/**`

## Related skills

- `/audit` — drift detector, invoked as part of this skill
- `/upgrade-deps` — run before this if you're bumping versions; a release check after the bump is the canonical verification
- `/api-change` — run before this if the API contract changed; this skill catches the common case where the mobile side wasn't updated
- `/feature continue` — to close any drift this skill surfaces

## When not to use this skill

- Mid-development on a feature branch — individual builds are faster and give more focused feedback
- When manual smoke-testing is what's actually needed — this skill does not exercise runtime behavior
- Right after `/release-check` already passed — re-running it without changes is waste
