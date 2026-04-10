# API Contract

> The full, up-to-date API contract lives in the OpenAPI 3.1 spec served at `/api/v1/docs` (Scalar UI) and `/api/v1/docs/openapi.json` (raw spec).
>
> This file is a pointer, not a duplicate. Avoid copying schemas here — they will drift.

## How the contract is maintained

- Each `web/src/app/api/v1/*` route imports its request and response schemas from `web/src/lib/openapi/routes/<resource>.ts`
- Response schemas live in `web/src/lib/openapi/responses.ts`
- The OpenAPI spec is built at runtime from these registrations via `@asteasolutions/zod-to-openapi`
- Mobile DTOs in `mobile/shared/src/commonMain/kotlin/com/priorli/<app>/data/remote/dto/` are derived from the same shapes

## When you change the contract

Use the `/api-change` skill (Phase 5) to walk the cascade:

1. Update the route handler in `web/src/app/api/v1/<resource>/route.ts`
2. Update the OpenAPI registration in `web/src/lib/openapi/routes/<resource>.ts`
3. Update the response schema in `web/src/lib/openapi/responses.ts` if shared
4. Update the mobile DTO in `mobile/shared/src/commonMain/kotlin/.../data/remote/dto/`
5. Update the relevant `specs/features/*.md` file's API section
6. Verify both clients build:
   - `cd web && bun run build`
   - `cd mobile && ./gradlew :composeApp:assembleDebug`

This cascade is the #1 source of subtle bugs — keep it tight.
