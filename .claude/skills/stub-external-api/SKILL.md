---
name: stub-external-api
description: Use this skill to scaffold a stub/real client pair for an external HTTP service from its OpenAPI spec, so a downstream Triplane project can build and demo against a realistic fake until the real API key arrives. Triggers on phrases like "stub the weather API", "fake external API responses", "I don't have a Stripe key yet", "mock the GitHub API", "generate a client from OpenAPI", "stub external service", "fake it until we ship". Takes an OpenAPI spec URL (JSON or YAML), downloads it, uses `openapi-typescript` to generate typed definitions, then generates six files under `web/src/lib/<service>/`: `schema.d.ts` (generated types), `client.ts` (interface + re-exports), `stub-client.ts` (Faker-powered fake responses), `http-client.ts` (real `fetch()` implementation), `factory.ts` (env-var switch), and `index.ts` (public entry point). Also appends a new `<SERVICE>_API_KEY` entry to `web/.env.example`. Deterministic stubs — `faker.seed(hashOfRequestParams)` means the same request always returns the same fake payload so the UI feels stable during a demo. Lets you pick a subset of endpoints (2–5) rather than scaffolding all 500 endpoints of a huge spec. **Never creates API routes under `web/src/app/api/v1/*`** — only the client pair under `web/src/lib/`. The user wires routes up themselves or via `/api-change`. Pairs cleanly with `/seed-demo` (database layer) and `/feature add` (spec layer): three orthogonal skills, one per layer of the "fake it until you ship it" stack.
invocable: true
---

# /stub-external-api — generate a fake client from an OpenAPI spec

You are scaffolding a stub/real client pair for an external HTTP service that a downstream Triplane project wants to integrate with *eventually*, but can't integrate with *right now* — usually because the API key isn't available yet, or the vendor hasn't finished onboarding, or the team is prototyping before committing to the vendor at all. Your output lets the downstream app build, deploy, and demo against realistic fake data while the real integration is pending.

The pattern is **two implementations behind one interface**: a `StubXxxClient` (Faker-powered) and an `HttpXxxClient` (real `fetch()` calls), with a `factory` that returns the stub when `<SERVICE>_API_KEY` is unset and the real client when it is. API routes and business logic import the factory and never know which impl they're using. When the real key arrives, you set one env var and the stub disappears — no code changes.

You are not the skill that writes the API routes that *expose* this client to the mobile app. That's `/api-change` or `/feature add`. You write the HTTP-boundary layer only, in `web/src/lib/<service>/`. Stay in your lane.

## Invariants

1. **Never creates or modifies anything under `web/src/app/api/v1/*`.** Route creation is `/api-change` and `/feature add` territory. If the user needs a route that calls your stub, point them at `/api-change` after you're done.
2. **Never creates or modifies anything under `mobile/`.** Mobile clients hit Triplane's own `/api/v1/*` routes, not external services directly (per `PLAN.md § Architecture principles` #2 and #3). The stub lives server-side only. This matches the "web-side only" carve-out from the external-API stub convention.
3. **Only writes under `web/src/lib/<service>/` and `web/.env.example`.** Nothing else. Not `web/package.json`-patching beyond the `openapi-typescript` devDep install, not source files, not tests, not OpenAPI docs. If the service name collides with an existing directory, ask before overwriting.
4. **Service name is a kebab-case slug.** Either the user supplies it explicitly (e.g., `openweather`, `stripe-billing`) or it's derived from the OpenAPI `info.title` field via slugification. The slug drives the directory name and the `<SERVICE>_API_KEY` env var name (which is the slug SCREAMING_SNAKE_CASE: `openweather` → `OPENWEATHER_API_KEY`, `stripe-billing` → `STRIPE_BILLING_API_KEY`).
5. **Pick a subset of endpoints, not the whole spec.** Real-world OpenAPI specs are huge (Stripe's spec is ~100k lines, ~500 endpoints). The user almost never wants stubs for all of them. Ask which 2–5 endpoints they need, and stub only those. If the user insists on "all of them" for a tiny spec, cap at 20 and say so.
6. **Deterministic stubs.** Every stub method uses `faker.seed(hashOfRequestParams)` before generating its response, so repeated calls with the same input return byte-identical fake payloads. Random noise makes demos feel broken ("wait, it just said 72°F a second ago, now it says 41°F").
7. **Never ships real API keys or tokens in generated files.** The `http-client.ts` reads keys from `process.env.<SERVICE>_API_KEY` at call time. Hardcoded tokens are a security failure — refuse to write them even if the user pastes one in.
8. **Idempotent-ish.** Re-running with the same spec URL regenerates `schema.d.ts` (no-op if the spec hasn't changed), and **asks the user** before overwriting `stub-client.ts` / `http-client.ts` / `factory.ts` / `index.ts` if they exist — hand-edits to the stub are valuable and silent clobbering is forbidden. The check is "does the file exist AND does its top-line header match the one this skill writes" — if yes, safe to overwrite; if no (user has hand-edited), ask.
9. **Requires `@faker-js/faker`.** The stub client uses Faker for fake responses. If `/seed-demo` has already run (Faker is already installed), skip the install. Otherwise, add `@faker-js/faker` as a `devDependency` via `bun add -D @faker-js/faker` from `web/`.
10. **Requires `openapi-typescript`.** Added as a `devDependency` on first run. Run via `bunx` so it doesn't pollute `node_modules/.bin` at runtime — it's a one-shot codegen tool.
11. **Refuses on Triplane's pristine template.** Same guard as `/seed-demo` and `/init-app` — if `com.priorli.triplane` is still present in `web/` or `mobile/`, halt and point at `/init-app`. The template itself should never ship stubs for external services it doesn't use.

## Step 1 — Pre-flight checks

Run in parallel; halt on any failure:

1. **Repo root detection.** Locate the repo root (has `web/`, `PLAN.md`). Halt if not in a Triplane repo.
2. **Template freshness check.** Grep for `com.priorli.triplane` in `web/` and `mobile/`. If present, halt with a one-line pointer at `/init-app`.
3. **OpenAPI spec URL or path provided.** The user should have invoked the skill like `/stub-external-api <url-or-path>` or equivalent. If the URL/path is missing, ask for it once, then halt if still absent. Examples you can offer the user:
   - Petstore demo: `https://petstore3.swagger.io/api/v3/openapi.json`
   - Stripe: `https://raw.githubusercontent.com/stripe/openapi/master/openapi/spec3.json`
   - GitHub: `https://raw.githubusercontent.com/github/rest-api-description/main/descriptions/api.github.com/api.github.com.json`
4. **Service slug.** Either the user supplied one as an argument, or you need to derive it. If deriving, you'll get the `info.title` from the spec in Step 2 and slugify it — but confirm with the user before settling on the slug, because vendor-published titles are often verbose ("Stripe API" → should the slug be `stripe`, `stripe-api`, or `stripe-billing`?).

## Step 2 — Fetch and validate the OpenAPI spec

Download the spec. Use `curl -sSL <url> -o /tmp/triplane-stub-spec.json` from a Bash call, or the `WebFetch` tool if the URL is web-reachable. Handle both JSON and YAML specs — `openapi-typescript` accepts both natively, but you need to peek at the spec to extract the `info.title`, `info.version`, `servers[0].url`, and `paths` map.

**Validate the spec basics:**
- Has a top-level `openapi` or `swagger` version field. Reject Swagger 2.x (the `openapi-typescript` tool supports OpenAPI 3.x best; for Swagger 2 the user should run `swagger2openapi` first).
- Has an `info.title`. If missing, fall back to the user-supplied slug.
- Has a `paths` map with at least one endpoint. Empty specs are an error.
- Has a `servers` entry (OpenAPI 3.x). If missing, you can't generate the real `http-client.ts` correctly — ask the user for the base URL.

**Derive or confirm the service slug.** From `info.title`: lowercase, replace spaces with hyphens, strip punctuation. "Stripe API" → `stripe-api`; "OpenWeather One Call 3.0" → `openweather-one-call-3-0`. Show the derived slug to the user and ask if they want to override it — the dir name and env var name both flow from this.

**Check for directory collision.** Does `web/src/lib/<slug>/` already exist? If yes, ask: overwrite (re-run), pick a different slug (user renames), or abort.

## Step 3 — Ask which endpoints to stub

Parse the `paths` map. Enumerate every `<path, method>` pair (e.g., `GET /weather`, `POST /charges`). Count them. Show the user the list:

- **If the count is ≤ 5:** offer to stub all of them and ask for confirmation.
- **If the count is 6–20:** show the full list grouped by path, ask the user to pick the 2–5 they want stubbed first. Say "re-run the skill later to add more."
- **If the count is > 20:** show only the paths (not the methods), ask the user to pick 2–3 paths they care about, then for each picked path show the methods and confirm.

For each picked endpoint, record:
- The path (`/weather/{city}`)
- The method (`GET`, `POST`, etc.)
- The parameters (query / path / body)
- The response schema reference (`responses.200.content['application/json'].schema`, either inline or a `$ref`)

These become the methods on your stub and real clients. Don't stub endpoints the user didn't pick. They can re-run the skill to add more later — the skill is re-runnable and will merge new endpoints into the existing client files.

## Step 4 — Plan the devDep installs

Read `web/package.json`. Record whether each of these is present:

1. **`@faker-js/faker` in `devDependencies`.** Needed by `stub-client.ts`. If missing, plan `bun add -D @faker-js/faker` from `web/`. If `/seed-demo` already ran, this is already installed — skip.
2. **`openapi-typescript` in `devDependencies`.** Needed to generate `schema.d.ts`. If missing, plan `bun add -D openapi-typescript` from `web/`.

Report the plan to the user before installing. Both are small (~5MB combined) and widely-used — no ecosystem concerns.

## Step 5 — Plan the file generations

You will emit six files under `web/src/lib/<slug>/`:

### `schema.d.ts` (generated by `openapi-typescript`)

Run `bunx openapi-typescript <spec-url-or-path> -o web/src/lib/<slug>/schema.d.ts` from `web/`. This generates a `.d.ts` file with typed `paths`, `operations`, and `components` maps matching the spec. **You do not write this file by hand** — `openapi-typescript` is doing the heavy lifting.

Top of the file gets a generated-marker comment from `openapi-typescript` itself ("This file was auto-generated by openapi-typescript."). Leave it.

### `client.ts` (interface + type re-exports)

Hand-written. Defines the public interface for the external service, re-exporting convenient types from `schema.d.ts`. Example for a weather service with two endpoints:

```ts
// web/src/lib/openweather/client.ts
//
// Public interface for the OpenWeather service. Both StubOpenweatherClient
// and HttpOpenweatherClient implement this. API routes and business logic
// import `openweather` from `./index.ts` — which is the factory-resolved
// instance — and never reference the concrete classes directly.

import type { paths } from "./schema";

// Convenience aliases. Adjust these to match the endpoints your app uses.
export type CurrentWeatherResponse =
  paths["/weather"]["get"]["responses"]["200"]["content"]["application/json"];
export type ForecastResponse =
  paths["/forecast"]["get"]["responses"]["200"]["content"]["application/json"];

export interface OpenweatherClient {
  getCurrentWeather(city: string): Promise<CurrentWeatherResponse>;
  getForecast(city: string, days: number): Promise<ForecastResponse>;
}
```

The interface has one method per picked endpoint from Step 3. Method names are derived from the endpoint path: `GET /weather` → `getWeather()`, `GET /weather/{city}` → `getWeatherByCity(city: string)`, `POST /charges` → `createCharge(input: CreateChargeInput)`, etc. If the OpenAPI spec names a `operationId` on the endpoint, use that instead (it's usually cleaner).

### `stub-client.ts` (Faker-powered implementation)

Hand-written by the skill. One implementation class, one method per endpoint from Step 3, each returning a Faker-generated response matching the type from `schema.d.ts`. Example:

```ts
// web/src/lib/openweather/stub-client.ts
//
// Faker-powered stub. Returns deterministic fake data for each endpoint.
// Determinism comes from `faker.seed(hashOfRequestParams)` at the top of
// each method — the same input always yields the same fake payload so the
// UI feels stable during a demo.
//
// Generated by /stub-external-api. Safe to hand-edit; re-running the skill
// will detect hand-edits and ask before overwriting.

import { faker } from "@faker-js/faker";
import type {
  OpenweatherClient,
  CurrentWeatherResponse,
  ForecastResponse,
} from "./client";

function hashString(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = Math.imul(31, h) + input.charCodeAt(i);
  }
  return Math.abs(h);
}

export class StubOpenweatherClient implements OpenweatherClient {
  async getCurrentWeather(city: string): Promise<CurrentWeatherResponse> {
    faker.seed(hashString(`current:${city}`));
    return {
      coord: { lon: faker.location.longitude(), lat: faker.location.latitude() },
      weather: [
        {
          id: faker.number.int({ min: 200, max: 804 }),
          main: faker.helpers.arrayElement(["Clear", "Clouds", "Rain", "Snow"]),
          description: faker.lorem.words(2),
          icon: "01d",
        },
      ],
      main: {
        temp: faker.number.float({ min: 250, max: 310, fractionDigits: 2 }),
        feels_like: faker.number.float({ min: 250, max: 310, fractionDigits: 2 }),
        humidity: faker.number.int({ min: 20, max: 100 }),
      },
      name: city,
      // Note: this is a stub. Real OpenWeather responses have more fields.
      // Re-run /stub-external-api with the full spec to regenerate.
    } as CurrentWeatherResponse;
  }

  async getForecast(city: string, days: number): Promise<ForecastResponse> {
    faker.seed(hashString(`forecast:${city}:${days}`));
    // ... similar shape
    return { /* ... */ } as ForecastResponse;
  }
}
```

**Rules for Faker field population**, same as `/seed-demo`:

- Field name → Faker helper heuristics (same table as `/seed-demo`): `temp`/`temperature` → `faker.number.float`, `name` → `faker.person.fullName()` or the passed input, `email` → `faker.internet.email()`, `url` → `faker.internet.url()`, `address` → `faker.location.streetAddress()`, `lat`/`latitude` → `faker.location.latitude()`, `lon`/`longitude` → `faker.location.longitude()`, `id` → `faker.string.uuid()` or `faker.number.int()` depending on the schema type, `created_at`/`updated_at` → `faker.date.recent()`, anything else string → `faker.lorem.words(2)`, number → `faker.number.int()` or `.float()` based on schema constraints (min/max/format), boolean → `faker.datatype.boolean()`, array → `Array.from({length: 3}, () => <fake element>)`.
- **Use the type cast `as CurrentWeatherResponse`** (or equivalent) at the end of each return statement because the hand-generated stub rarely covers every optional field the spec declares. The cast silences TypeScript's excess-property check for optional fields. Add a comment explaining why.
- **Deterministic seeding:** `faker.seed(hashString(stringify(inputs)))` at the top of every method. The `hashString` helper lives at the top of the file so every method shares it.
- **No random timestamps.** Use `faker.date.recent({ refDate: new Date("2026-04-11") })` or a similar fixed reference so stubs don't drift with wall-clock time.
- **Input echoing.** If an input is a city name ("NYC"), echo it into the response's `name` field instead of generating a fake city. Users expect their inputs to appear in the output. Do the same for user IDs, account IDs, etc.

### `http-client.ts` (real `fetch()` implementation)

Hand-written by the skill. One implementation class, one method per endpoint, each making a real `fetch()` call to the base URL from `servers[0].url` with the `<SERVICE>_API_KEY` as a bearer token or header (derive from the OpenAPI `securitySchemes` — if it's an API key in a header, use that header; if it's OAuth2 bearer, use `Authorization: Bearer`).

Example:

```ts
// web/src/lib/openweather/http-client.ts
//
// Real HTTP implementation of OpenweatherClient. Uses fetch() and reads
// the API key from process.env.OPENWEATHER_API_KEY at call time (so hot
// reloads pick up env changes without a server restart).
//
// Generated by /stub-external-api.

import type {
  OpenweatherClient,
  CurrentWeatherResponse,
  ForecastResponse,
} from "./client";

const BASE_URL = "https://api.openweathermap.org/data/2.5";

export class HttpOpenweatherClient implements OpenweatherClient {
  private getApiKey(): string {
    const key = process.env.OPENWEATHER_API_KEY;
    if (!key) {
      throw new Error(
        "OPENWEATHER_API_KEY is not set. The stub client should be used " +
        "instead — check web/src/lib/openweather/factory.ts.",
      );
    }
    return key;
  }

  async getCurrentWeather(city: string): Promise<CurrentWeatherResponse> {
    const url = new URL(`${BASE_URL}/weather`);
    url.searchParams.set("q", city);
    url.searchParams.set("appid", this.getApiKey());
    const res = await fetch(url);
    if (!res.ok) throw new Error(`OpenWeather error: ${res.status}`);
    return (await res.json()) as CurrentWeatherResponse;
  }

  async getForecast(city: string, days: number): Promise<ForecastResponse> {
    const url = new URL(`${BASE_URL}/forecast/daily`);
    url.searchParams.set("q", city);
    url.searchParams.set("cnt", String(days));
    url.searchParams.set("appid", this.getApiKey());
    const res = await fetch(url);
    if (!res.ok) throw new Error(`OpenWeather error: ${res.status}`);
    return (await res.json()) as ForecastResponse;
  }
}
```

Use the OpenAPI `parameters` + `requestBody` to decide how to build the URL / headers / body. Query params go on the URL, path params get interpolated into the path, body params go in the request body as JSON.

### `factory.ts` (env-var switch)

Hand-written. Picks between the stub and real clients based on `process.env.<SERVICE_KEY>`:

```ts
// web/src/lib/openweather/factory.ts
//
// Returns the real HttpOpenweatherClient when OPENWEATHER_API_KEY is set,
// and the StubOpenweatherClient otherwise. Singleton per module — the
// returned instance is cached so repeated calls don't reinstantiate.
//
// Generated by /stub-external-api.

import type { OpenweatherClient } from "./client";
import { StubOpenweatherClient } from "./stub-client";
import { HttpOpenweatherClient } from "./http-client";

let cached: OpenweatherClient | null = null;

export function getOpenweatherClient(): OpenweatherClient {
  if (cached) return cached;
  cached = process.env.OPENWEATHER_API_KEY
    ? new HttpOpenweatherClient()
    : new StubOpenweatherClient();
  return cached;
}
```

### `index.ts` (public entry point)

Hand-written. Re-exports the factory call and the types:

```ts
// web/src/lib/openweather/index.ts
//
// Public entry point for the openweather client. API routes and business
// logic should import from here, not from concrete impl files:
//
//   import { openweather } from "@/lib/openweather";
//   const current = await openweather.getCurrentWeather("NYC");
//
// Generated by /stub-external-api.

import { getOpenweatherClient } from "./factory";

export const openweather = getOpenweatherClient();
export type {
  OpenweatherClient,
  CurrentWeatherResponse,
  ForecastResponse,
} from "./client";
```

Note the `const openweather = getOpenweatherClient()` — this resolves the factory at module-load time so callers get a ready-to-use instance, not a factory-call-per-use.

## Step 6 — Plan the `.env.example` patch

Read `web/.env.example`. Check if `<SERVICE>_API_KEY` is already present. If yes, skip. If no, plan to append a new block at the bottom:

```bash

# --- <Service name from OpenAPI info.title> ---
# Get this from https://<link to vendor dashboard or signup — derive from servers[0].url host if possible>
# Optional: if unset, the factory at web/src/lib/<slug>/factory.ts returns the
# StubOpenweatherClient with Faker-powered fake responses instead of real
# HTTP calls. Useful for local dev and demos before the real key is available.
OPENWEATHER_API_KEY="..."
```

Match the existing comment-block-per-service format at `web/.env.example` (each service has a `# --- Service name ---` header + vendor link + one or more env vars).

## Step 7 — Show the full plan and get explicit approval

Before writing any file, show the user:

1. **The service slug** (final, confirmed).
2. **The endpoints to stub** (final list from Step 3).
3. **The devDeps to install** (`@faker-js/faker`, `openapi-typescript`, or both — or neither if already present).
4. **The files to generate** with their paths (`web/src/lib/<slug>/schema.d.ts`, `client.ts`, `stub-client.ts`, `http-client.ts`, `factory.ts`, `index.ts`).
5. **The `.env.example` append.**
6. **A preview of each hand-written file** in full (short enough — 5 files, each ~30–60 lines). The `schema.d.ts` is generated by `openapi-typescript` and can be quite long — for that one, show only the first 20 lines as a preview and note the full content will land at the path.
7. **The commands you'll run:** `bun add -D <deps>` (if needed), `bunx openapi-typescript ...`.

Ask: "Ready to write these files and run the install, or want changes?"

Wait for explicit approval. "Looks good" is not approval. Only `yes` / `approved` / `go` / `proceed` counts. Common user redirects at this stage:

- "Use a different slug" — update and re-show.
- "Stub a different subset of endpoints" — re-run Step 3 with the new list, re-show.
- "The base URL should be X, not what the spec says" — override the `BASE_URL` constant in `http-client.ts` and re-show.
- "Don't add openapi-typescript — I already have it somewhere" — re-check the package.json; if genuinely missing, explain you need it; if present, skip the install.

## Step 8 — Apply changes

After approval, in order:

1. **Install devDeps.** Run `bun add -D @faker-js/faker openapi-typescript` (or just the missing subset) from `web/`. Surface the exit code. If install fails, halt.
2. **Generate `schema.d.ts`.** Run `bunx openapi-typescript <spec-url-or-path> -o web/src/lib/<slug>/schema.d.ts` from `web/`. Surface the exit code and the generated file's first 10 lines so the user sees what landed.
3. **Write the hand-generated files.** `client.ts`, `stub-client.ts`, `http-client.ts`, `factory.ts`, `index.ts` — in that order. Each write goes through the approval gate if the skill is running inside a forge session (automatic) or is shown to the user for confirmation if running standalone.
4. **Append to `.env.example`.** Use Edit (append, don't overwrite). Verify the append landed by reading the last 20 lines of the file.
5. **Run a quick type-check.** `cd web && bunx tsc --noEmit` or a subset. If the generated code has type errors, report them and halt — the user needs to see them before considering the skill successful. Common cause: the OpenAPI spec's response type doesn't match the shape the hand-written stub returns; the fix is usually adjusting the stub's return shape or adding optional fields.
6. **Do NOT run a full `bun run build`.** That's too slow for a skill step. The type check is sufficient; a full build is what `/release-check` does.

If any step fails, surface the failure and halt. Do not attempt rollback — the partial state is inspectable by the user.

## Step 9 — Final report

Print a **short** status — 5 to 8 lines, no prose paragraphs:

> stub-external-api complete.
> Service: `openweather`.
> Files written: `web/src/lib/openweather/{schema.d.ts,client.ts,stub-client.ts,http-client.ts,factory.ts,index.ts}`.
> Env var added to `web/.env.example`: `OPENWEATHER_API_KEY`.
> devDeps installed: `@faker-js/faker`, `openapi-typescript`.
> Endpoints stubbed: `GET /weather`, `GET /forecast`.
> Next: import `{ openweather }` from `@/lib/openweather` in your API route or server component. When the real key arrives, set `OPENWEATHER_API_KEY` in `.env.local` and restart the dev server — the factory auto-switches.
> Re-run `/stub-external-api` with the same spec URL to add more endpoints or refresh the types.

Do not paste the full file contents. They're on disk.

## Files this skill touches

- **Reads:** the OpenAPI spec URL/path the user provides, `web/package.json`, `web/.env.example`, `web/src/lib/<slug>/*` (to check for existing files).
- **Writes (in `web/src/lib/<slug>/`):** `schema.d.ts` (via `openapi-typescript`), `client.ts`, `stub-client.ts`, `http-client.ts`, `factory.ts`, `index.ts`.
- **Patches:** `web/package.json` (add `@faker-js/faker` + `openapi-typescript` to devDependencies if missing); `web/.env.example` (append a new `<SERVICE>_API_KEY` block).
- **Runs:** `bun add -D ...`, `bunx openapi-typescript ...`, `bunx tsc --noEmit` (or a narrower typecheck).
- **Never modifies:** anything under `web/src/app/`, anything under `mobile/`, anything under `specs/`, anything under `.claude/`, `PLAN.md`, `CLAUDE.md`, `README.md`, `mobile_plan.md`, `LESSONS.md`. No API route creation, no mobile-side code, no docs updates.

## Related skills

- `/seed-demo` — the **database-layer** counterpart. `/seed-demo` populates the DB with static records; `/stub-external-api` generates on-demand fake responses for external services. Both use Faker; both are part of the "fake it until you ship it" toolkit. They compose cleanly: seed the DB and stub the external APIs, then the whole app feels real during a demo.
- `/feature add` — the **spec-layer** counterpart. Drafts the feature spec that names the external service. Run `/feature add` first to capture the spec; then run `/stub-external-api` to generate the HTTP-boundary scaffolding for the service the spec mentions.
- `/api-change` — the route-cascade walker. If you want to *expose* your stub to the mobile app via a Triplane `/api/v1/*` endpoint, run `/api-change` after this skill to propagate the new route through zod/OpenAPI/server/client/mobile DTOs.
- `/init-app` — must run before this skill (pre-flight guard blocks the template itself).
- `/audit` — unaffected. External stubs don't touch the feature matrix.
- `/release-check` — unaffected. The generated files compile under `bun run build` but don't exercise real HTTP at build time.

## Future work (v2+)

Documented here so users know what's coming and what's not in v1.

- **Pre-built templates for the top 10 services.** OpenWeather, Stripe, Google Places, Twilio, SendGrid, OpenAI, Anthropic, Slack, GitHub, Notion. Zero-config stubs for common cases; user passes just the service name. v1 requires an OpenAPI URL.
- **Spec caching.** The `schema.d.ts` is regenerated on every skill run. For large specs (Stripe ~100k lines), this is slow. A local cache at `web/.openapi-cache/<slug>.json` with an ETag check would skip the fetch when the spec hasn't changed.
- **Response-body mocking from OpenAPI `examples`.** Many OpenAPI specs include `examples` fields with realistic sample responses. v2 could prefer those over Faker-generated values when present — even more realistic output.
- **OpenAPI request-body validation in the stub.** The stub currently accepts any input. A v2 enhancement could validate request bodies against the schema and return a 400-shaped stub response on invalid input, so downstream code paths for error handling can be demoed too.
- **Merge mode for re-runs with new endpoints.** v1 asks to overwrite the whole stub-client when re-running with a new endpoint list. v2 could merge — preserve existing methods, append new ones, keep hand-edits.
- **Non-JSON response types.** v1 assumes `application/json`. Some services return XML, protobuf, or binary. v2 could handle those via pluggable response parsers.
- **Webhook stubs.** Many services send webhooks (Stripe, GitHub). v2 could generate a `POST /api/v1/webhooks/<service>` stub route and a test harness that fires fake webhook events at it.

## When not to use this skill

- **You have a real API key and the integration is stable.** Just write the HTTP client directly. The stub/real pattern is for the "I don't have a key yet" problem, not for every external integration.
- **The external service doesn't publish an OpenAPI spec.** The skill's whole value is type-safety via `openapi-typescript`. Without a spec, you're back to hand-writing the interface — the skill can't help. (Path 1 from the original trilemma — "hand-written interface" — is a plausible v2 follow-up, but not v1.)
- **You want to mock the service at the HTTP layer via MSW or similar.** That's a different pattern — intercepting `fetch()` at runtime rather than swapping the client. MSW is great for tests; it's overkill for demos and doesn't give you server-side type safety the way the stub-client pattern does.
- **You want to generate a REAL client without the stub fallback.** Use `openapi-typescript` + a manual `http-client.ts` — skip the `stub-client.ts` and `factory.ts`. This skill isn't the right shape for that; it always generates the pair.
- **You're on the pristine Triplane template.** The skill refuses. Run `/init-app` first.
- **The OpenAPI spec is Swagger 2.x.** `openapi-typescript` supports OpenAPI 3.x best. For Swagger 2, run `swagger2openapi` to convert first, then invoke this skill with the converted URL.
