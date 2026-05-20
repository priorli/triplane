# CI/CD setup — Triplane

End-to-end setup for the release pipeline a Triplane downstream inherits. Two paths run the same artifacts:

| Path | When | Cost | Trigger |
|------|------|------|---------|
| **GitHub Actions** | push to main / tag / `workflow_dispatch` | Linux runner cheap; macOS runner ~20× | automatic on push |
| **Local `release.sh`** | from a developer Mac | free (your laptop minutes) | manual |

Both invoke the same gradle tasks (`bundle<Tenant>Release` / `assemble<Tenant>Release`) and the same fastlane lanes (`tenant_release` for iOS, `android_release` for Android). The pipeline is Fastfile-first by design — the workflows are thin wrappers, so if Actions costs become a problem you can move iOS local without rewriting anything.

This doc is the rationale-free walkthrough. The *why* lives in [LESSONS.md §14](./LESSONS.md#cicd-pipeline-lessons-travolp-2026-05-11) and [§16](./LESSONS.md#local-release-orchestrator--ops-gotchas-travolp-2026-05-11).

---

## Table of contents

1. [What ships when you push](#1-what-ships-when-you-push)
2. [Prerequisites](#2-prerequisites)
3. [One-time setup](#3-one-time-setup)
   - 3.1 [Fly (web)](#31-fly-web)
   - 3.2 [Android signing keystore](#32-android-signing-keystore)
   - 3.3 [Google Play Console](#33-google-play-console)
   - 3.4 [App Store Connect API key](#34-app-store-connect-api-key)
   - 3.5 [fastlane match repo](#35-fastlane-match-repo)
   - 3.6 [Firebase App Distribution (optional)](#36-firebase-app-distribution-optional)
4. [The `mobile/keys/.env.release` file](#4-the-mobilekeysenvrelease-file)
5. [Daily ops — `./release.sh`](#5-daily-ops--releasesh)
6. [GitHub Actions setup](#6-github-actions-setup)
7. [Troubleshooting](#7-troubleshooting)

---

## 1. What ships when you push

The default flow is:

```
push to main
    │
    ├── deploy-web.yml          → fly deploy with NEXT_PUBLIC_* build args
    ├── release-android.yml     → gradle bundle/assemble → Play Internal (AAB) + Firebase (APK)
    └── release-ios.yml         → fastlane tenant_release → TestFlight + Firebase
```

For a pull request, `deploy-web-preview.yml` deploys the PR to a shared `<app>-preview` Fly app with its own database.

`release.sh` (local) does the same three legs sequentially, single-tenant by default.

---

## 2. Prerequisites

Before any setup steps:

- **Apple Developer Program** membership (Account Holder or Admin for the team).
- **Google Play developer account** (one-time $25 fee, app published or at minimum drafted).
- **Fly.io account** with the app created (`fly launch` or `fly apps create <name>`).
- **GitHub repo** with admin access (to set secrets).
- A **private git repo** you can create for fastlane match (e.g. `your-org/<project>-match`).
- A **Google Cloud Project** (free, used for service accounts).
- **Tools on PATH:** `bun`, `fly`, `gh`, `jq`, `bundle` (Ruby), `java` 17, Xcode latest stable.

You also need the *app* registered in both stores before any API uploads work:

- **Google Play Console** → Create app → fill metadata → **upload one signed AAB by hand** (Play API rejects all uploads until the app has at least one release published, even a draft).
- **App Store Connect** → My Apps → New App → fill bundle id + SKU.

---

## 3. One-time setup

### 3.1 Fly (web)

1. **Create the FLY_API_TOKEN.** From any machine with `fly` installed and logged in:
   ```bash
   fly tokens create deploy -x 8760h --name "ci-deploy" -a <your-fly-app>
   ```
   Strip the leading `FlyV1 ` prefix if you see one — the value should start with `fm2_…`.
2. **Set runtime secrets on Fly** (NOT in GitHub):
   ```bash
   fly secrets set DATABASE_URL=postgres://... CLERK_SECRET_KEY=sk_... ...
   ```
   These are runtime — Fly injects them at container start. **Don't mirror them to GitHub.**
3. **Set GitHub Actions secrets** for the values that Next.js inlines at *build* time only:
   - `FLY_API_TOKEN` (from step 1)
   - `NEXT_PUBLIC_MAPBOX_TOKEN`
   - `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
   - `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`
   - `NEXT_PUBLIC_UPLOAD_STRATEGY`
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`

   The boundary: **GitHub owns build args, Fly owns runtime secrets.** Anything readable from the client bundle is a build arg; anything that should never leave the server is a runtime secret.
4. **Local `web/.env.prod`** holds the same six `NEXT_PUBLIC_*` values, gitignored. `deploy.sh --env-file web/.env.prod` reads them and forwards as `--build-arg` on `fly deploy`.

### 3.2 Android signing keystore

1. Generate (once per project, never lose):
   ```bash
   keytool -genkey -v -keystore mobile/keys/key.jks \
     -keyalg RSA -keysize 2048 -validity 10000 \
     -alias <your-org>
   ```
   Pick a strong storepass and keypass (usually the same). Back the `.jks` up — losing it means losing publish rights for every app signed with it.
2. Add to `mobile/local.properties` (IDE / Android Studio reads from here):
   ```
   RELEASE_KEYSTORE_PATH=/abs/path/to/repo/mobile/keys/key.jks
   RELEASE_KEYSTORE_PASSWORD=<storepass>
   RELEASE_KEY_ALIAS=<alias>
   RELEASE_KEY_PASSWORD=<keypass>
   ```
3. Add the **same** values to `mobile/keys/.env.release` (release.sh / fastlane reads from here). The path must be identical — drift between the two files silently produces unsigned APKs ([LESSONS §16.5](./LESSONS.md#5-signing-path-drift-silently-produces-unsigned-artifacts)).
4. For GitHub Actions, base64-encode the keystore and set as secret `RELEASE_KEYSTORE_BASE64`:
   ```bash
   base64 -i mobile/keys/key.jks | pbcopy   # macOS — paste into GH secret
   ```
   Workflow decodes it to `$RUNNER_TEMP/release.jks` at run time. Set the password/alias/keypass secrets too: `RELEASE_KEYSTORE_PASSWORD`, `RELEASE_KEY_ALIAS`, `RELEASE_KEY_PASSWORD`.

### 3.3 Google Play Console

The flow changed in 2025 — the standalone "API access" page is gone. Service accounts are now invited through the regular "Users and permissions" page.

1. **GCP side — create the service account.**
   - <https://console.cloud.google.com> → pick a project (any project works; doesn't need to be "linked" to Play anymore).
   - APIs & Services → Library → enable **Google Play Android Developer API**.
   - IAM & Admin → Service Accounts → Create. Name it (e.g. `play-release-bot`). No GCP roles needed.
   - On the new SA → **Keys** → Add key → JSON → download. Save as `mobile/keys/play-service-account.json`.
2. **Play Console side — invite the SA.**
   - <https://play.google.com/console> → select your developer account (top-left).
   - **Users and permissions** (sidebar).
   - **Invite new users** → paste the SA's `client_email` (visible in the JSON: `jq -r .client_email mobile/keys/play-service-account.json`).
   - **App permissions** tab → **Add app** → select your app(s).
   - Tick at minimum: **Manage testing tracks and edit tester lists**, **Release apps to testing tracks**, **View app information**. (Or the Admin preset for testing, tighten later.)
   - **Invite user** → **Send invite**.
3. **Wait up to 24h** for permissions to propagate on a brand-new SA. Usually it's minutes; if `caller does not have permission` persists after 30 min, the manual-first-upload step is the likely cause:
4. **Manually upload one signed AAB through the Play Console UI** before the first API upload. App → Internal testing → Create release → upload `composeApp-<tenant>-release.aab` → save as draft is fine. This ceremony unlocks API uploads for that package name.

### 3.4 App Store Connect API key

The one true Apple auth path for CI/CD. Skip app-specific passwords — they don't work for `fastlane match` ([LESSONS §16.2](./LESSONS.md#2-app-specific-passwords-dont-authenticate-to-apple-developer-portal)).

1. <https://appstoreconnect.apple.com> → **Users and Access** → **Integrations** tab → **App Store Connect API** → **Keys** sub-tab.
2. **+** → generate a key. Name it (e.g. "CI release"). Role: **App Manager** (sufficient for TestFlight + match). Download the `.p8` — **you can only download once**. Save as `mobile/keys/AuthKey_<KEYID>.p8`.
3. From that page also copy:
   - **Key ID** (10-char string, e.g. `ABC1234DEF`).
   - **Issuer ID** (UUID at the top of the page).
4. Build the JSON file `fastlane match` wants (NOT a hand-rolled heredoc — use jq):
   ```bash
   KID="<key id>"
   ISS="<issuer id>"
   jq -n \
     --arg key_id    "$KID" \
     --arg issuer_id "$ISS" \
     --rawfile key   "mobile/keys/AuthKey_${KID}.p8" \
     '{key_id: $key_id, issuer_id: $issuer_id, key: $key, in_house: false}' \
     > mobile/keys/asc-api-key.json
   chmod 600 mobile/keys/asc-api-key.json
   ```
   Verify: `jq empty mobile/keys/asc-api-key.json` (silent = valid).

### 3.5 fastlane match repo

Match keeps signing certificates and provisioning profiles in an encrypted private git repo so every team member (and CI) can fetch the same identity.

1. **Create an empty private repo** for the match material. SSH URL goes in `MATCH_GIT_URL` (e.g. `git@github.com:your-org/<project>-match.git`).
2. **Initialize match** (once):
   ```bash
   cd mobile/iosApp
   bundle install
   bundle exec fastlane match init
   ```
   Answer `git`, paste the URL. Writes `fastlane/Matchfile`.
3. **Seed certs + profiles per tenant bundle id** using the API key path (not Apple ID):
   ```bash
   bundle exec fastlane match appstore \
     --app_identifier com.your-org.<app> \
     --api_key_path ../keys/asc-api-key.json
   ```
   It prompts: *"Passphrase for Match storage:"* — pick a strong one. **That's `MATCH_PASSWORD`.** Save it in your password manager; lose it and you `match nuke` and re-issue everything.
4. **Add a deploy key** for CI access. The match repo needs read access from GitHub Actions. Generate an SSH key pair, add the public half as a **deploy key** on the match repo, set the private half as GitHub secret `MATCH_REPO_DEPLOY_KEY` for the main repo.

### 3.6 Firebase App Distribution (optional)

Used for non-store builds shared with internal-qa testers. Each platform needs its own Firebase app + a service account JSON.

1. <https://console.firebase.google.com> → project → Apps → Add Android / Add iOS, register both bundle ids.
2. **Onboard each app to App Distribution.** Left rail → App Distribution → use the app selector at the top, pick each platform, click *Get started*. Without this one-time click the upload API returns `Invalid request` even though core Firebase is wired up. Per-platform — the Android click does not onboard the iOS app.
3. Project settings → Service accounts → **Generate new private key** → save as `mobile/keys/firebase-service-account.json`. IAM role: **Firebase App Distribution Admin** (the generic "Firebase Admin" role is not sufficient on newer projects).
4. (Optional) App Distribution → Testers and Groups → create one or more tester groups. The Fastfile reads `FIREBASE_TESTER_GROUPS` (comma-separated aliases); if unset, the upload still happens and testers can be added from the dashboard.
5. Note the **App ID** for each platform (format `1:NNN:android:HASH` / `1:NNN:ios:HASH`). Goes in `mobile/keys/.env.release` as `FIREBASE_APP_ID_ANDROID` / `FIREBASE_APP_ID_IOS`.

Skip this whole section if you don't need a Firebase mirror. Leave the `FIREBASE_APP_ID_*` lines empty in `.env.release` and the lanes no-op the Firebase step.

---

## 4. The `mobile/keys/.env.release` file

Gitignored; one file, all mobile + distribution secrets. Lives next to the `.jks`, `.p8`, and SA JSON files for back-up parity. Template:

```bash
# ─── Android signing ────────────────────────────────────────────────
RELEASE_KEYSTORE_PATH=/abs/path/to/repo/mobile/keys/key.jks
RELEASE_KEYSTORE_PASSWORD=...
RELEASE_KEY_ALIAS=...
RELEASE_KEY_PASSWORD=...

# ─── Mobile build-time secrets (shared by Android + iOS) ────────────
MAPBOX_PUBLIC_TOKEN=pk....
CLERK_PUBLISHABLE_KEY=pk_live_...
GOOGLE_MAPS_API_KEY=AIza...                       # Android only

# ─── Google Play Console ────────────────────────────────────────────
PLAY_SERVICE_ACCOUNT_JSON_PATH=/abs/path/to/repo/mobile/keys/play-service-account.json

# ─── App Store Connect (iOS) ────────────────────────────────────────
APP_STORE_CONNECT_API_KEY_ID=ABCD1234
APP_STORE_CONNECT_ISSUER_ID=00000000-0000-0000-0000-000000000000
APP_STORE_CONNECT_API_KEY_P8_PATH=/abs/path/to/repo/mobile/keys/AuthKey_ABCD1234.p8

# ─── fastlane match (iOS certs + profiles) ──────────────────────────
MATCH_PASSWORD=...
MATCH_GIT_URL=git@github.com:your-org/<project>-match.git

# ─── Firebase App Distribution (optional) ───────────────────────────
FIREBASE_APP_ID_ANDROID=1:NNN:android:HASH
FIREBASE_APP_ID_IOS=1:NNN:ios:HASH
FIREBASE_SERVICE_ACCOUNT_JSON_PATH=/abs/path/to/repo/mobile/keys/firebase-service-account.json
# FIREBASE_TESTER_GROUPS=internal-qa                # optional; comma-separated; omit to skip group distribution
```

`chmod 600 mobile/keys/.env.release` after first save. **Web is intentionally not in this file** — web secrets live in `web/.env.prod` because they have a different trust model (NEXT_PUBLIC_* values ship in the client bundle; mobile signing secrets don't).

---

## 5. Daily ops — `./release.sh`

The orchestrator at the repo root.

```bash
./release.sh                                 # all three targets, default tenant
./release.sh --web                           # web → Fly only
./release.sh --android                       # Android only
./release.sh --ios                           # iOS only
./release.sh --tenant <slug>                 # pick tenant (default: project default)
./release.sh --all-tenants                   # loop branding/tenants/*.json
./release.sh --play-track production         # default is internal
./release.sh --dry-run                       # print commands without executing
./release.sh --skip-distribute               # build but don't upload
```

First-run UX: if `mobile/keys/.env.release` doesn't exist, the script prompts for every required value for the selected targets and offers to save them back with `chmod 600`.

Under the hood:

- **Web**: calls `./deploy.sh --env-file web/.env.prod`. No fastlane involvement.
- **Android**: `gradle :composeApp:bundle<Tenant>Release :composeApp:assemble<Tenant>Release` with env-injected signing creds → `fastlane android android_release tenant:<slug>` for Play + Firebase upload.
- **iOS**: `fastlane ios tenant_release tenant:<slug>` — handles match → build → TestFlight → optional Firebase mirror.

`versionCode` defaults to `$(date +%s)` (unix epoch seconds). Strictly monotonic, fits int32 through 2038, well above any hand-uploaded values. Override with `--version-code N` if you need a specific number.

---

## 6. GitHub Actions setup

The four workflows are in `.github/workflows/`. They're thin — most logic lives in `deploy.sh`, `release.sh`, the Fastfile, and `gradle`. Required secrets (organized by what they're used for):

| Secret | Workflows | Notes |
|--------|-----------|-------|
| `FLY_API_TOKEN` | web | created with `fly tokens create deploy` |
| `NEXT_PUBLIC_*` (six of them) | web | identical to `web/.env.prod` contents |
| `RELEASE_KEYSTORE_BASE64` | android | `base64 -i mobile/keys/key.jks` |
| `RELEASE_KEYSTORE_PASSWORD`, `RELEASE_KEY_ALIAS`, `RELEASE_KEY_PASSWORD` | android | from local.properties |
| `PLAY_SERVICE_ACCOUNT_JSON` | android | full JSON content, not a path |
| `APP_STORE_CONNECT_API_KEY_ID`, `APP_STORE_CONNECT_ISSUER_ID` | ios | |
| `APP_STORE_CONNECT_API_KEY_P8` | ios | base64-encoded `.p8` content |
| `MATCH_PASSWORD`, `MATCH_GIT_URL` | ios | |
| `MATCH_REPO_DEPLOY_KEY` | ios | private SSH key with read access on match repo |
| `MAPBOX_PUBLIC_TOKEN`, `CLERK_PUBLISHABLE_KEY`, `GOOGLE_MAPS_API_KEY` | mobile | |
| `FIREBASE_APP_ID_ANDROID`, `FIREBASE_APP_ID_IOS`, `FIREBASE_SERVICE_ACCOUNT_JSON` | mobile | optional; omit to skip Firebase mirror |

**iOS runner cost considerations.** macOS Actions minutes are ~20× the Linux rate. Three escape hatches for when costs become a problem, all reusing the same Fastfile:

- `runs-on: self-hosted` on a Mac mini.
- Restrict iOS to `workflow_dispatch` (only build on demand).
- Use `release.sh --ios` from a developer Mac and disable the iOS workflow entirely.

The Fastfile is the load-bearing artifact — the workflow is one `runs-on:` line away from being local-only. Don't bake iOS-specific build steps into YAML.

---

## 7. Troubleshooting

### `Google Api Error: Invalid request - The caller does not have permission`

- Service account not invited in Play Console. See [3.3](#33-google-play-console). The standalone "API access" page is gone — use **Users and permissions**.
- Service account permissions just changed; wait up to 24h.
- App hasn't had its first manual UI upload yet. Required even with a valid SA.

### `Google Api Error: All uploaded bundles must be signed. Please sign the bundle using jarsigner.`

The AAB was produced unsigned. Look at the artifact filename — if it ends in `-unsigned.apk` you've confirmed it. Causes:

- `RELEASE_KEYSTORE_PATH` in `local.properties` points at a file that doesn't exist (gradle reads `local.properties` first; drift with `.env.release` is invisible).
- Keystore file actually missing.
- One of the four signing env vars empty.

Fix the path, then `rm -rf mobile/composeApp/build/outputs/{bundle,apk}/<flavor>Release` to wipe the stale unsigned artifact before re-running.

### `Could not find lane 'ios android_release'. Available lanes: ios tenant_release, android android_release`

Default platform is iOS; the Android lane lives under `platform :android`. Invoke with the platform: `bundle exec fastlane android android_release tenant:<slug> track:internal`.

### `JSON::ParserError` / "format error" reading the ASC API key JSON

The `.p8` contents have real newlines that aren't escaped to `\n` in the JSON. Rebuild with `jq --rawfile` (see [3.4](#34-app-store-connect-api-key)). Never hand-edit.

### `Your password is wrong` from fastlane match

You're trying to use an Apple app-specific password. They don't work for the Apple Developer Portal (which is what match talks to). Either:

- Use your real Apple ID password and respond to the 2FA prompt on a trusted device, or
- Switch to the API key path: `fastlane match appstore --api_key_path mobile/keys/asc-api-key.json` (recommended — same path CI uses).

### Versioning conflicts on second upload

- Play: `Version code N has already been used`. Bump `ANDROID_VERSION_CODE` env (default in `release.sh` is `$(date +%s)`, but you may have overridden it).
- TestFlight: `Build N already exists`. `tenant_release` lane increments to `latest_testflight_build_number + 1` automatically — only fails if you supplied a manual override that collides.

### `Action 'upload_to_play_store' isn't known to support operating system 'ios'`

Lane is misplaced inside `platform :ios do`. Move it to `platform :android do`. Warning is non-fatal but indicates the wrong platform context.

### CI workflow times out / costs spike

iOS jobs on `macos-14`. See [§6 cost considerations](#6-github-actions-setup) for escape hatches.

---

## Appendix — file layout this doc assumes

```
<repo>/
├── deploy.sh                          # web → Fly
├── release.sh                         # local orchestrator
├── web/
│   ├── .env.prod                      # gitignored — NEXT_PUBLIC_* for Fly build args
│   └── ...
├── mobile/
│   ├── keys/                          # entire dir gitignored
│   │   ├── .env.release               # gitignored
│   │   ├── key.jks
│   │   ├── AuthKey_<KID>.p8
│   │   ├── asc-api-key.json           # generated from .p8 via jq
│   │   ├── play-service-account.json
│   │   └── firebase-service-account.json
│   ├── local.properties               # gitignored — IDE + gradle
│   └── iosApp/
│       ├── Gemfile + Gemfile.lock
│       └── fastlane/
│           ├── Fastfile
│           ├── Matchfile
│           └── Pluginfile
├── branding/
│   └── tenants/
│       ├── <tenant>.json              # androidAppId, iosBundleId, displayName, …
│       └── ...
└── .github/workflows/
    ├── deploy-web.yml
    ├── deploy-web-preview.yml
    ├── release-android.yml
    └── release-ios.yml
```
