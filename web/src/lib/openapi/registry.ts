import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
  extendZodWithOpenApi,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod/v4";

extendZodWithOpenApi(z);

export const registry = new OpenAPIRegistry();

// Security scheme
registry.registerComponent("securitySchemes", "ClerkAuth", {
  type: "http",
  scheme: "bearer",
  bearerFormat: "JWT",
  description:
    "Clerk-issued JWT. Web clients send via cookie (automatic). " +
    "Mobile/API clients send via `Authorization: Bearer <token>` header.",
});

// Common error response schema
export const errorResponseSchema = z
  .object({
    error: z.object({
      code: z.string().openapi({ example: "VALIDATION_ERROR" }),
      message: z.string().openapi({ example: "Invalid input" }),
    }),
  })
  .openapi("ErrorResponse");

// Soft-delete response
export const deletedResponseSchema = z
  .object({
    data: z.object({
      deleted: z.literal(true),
    }),
  })
  .openapi("DeletedResponse");

// Helper to wrap data in { data: T }
export function dataResponse(schema: z.ZodType, name: string) {
  return z
    .object({ data: schema })
    .openapi(name);
}

// Paginated wrapper
export function paginatedResponse(
  itemSchema: z.ZodType,
  itemsKey: string,
  name: string,
) {
  return z
    .object({
      data: z.object({
        [itemsKey]: z.array(itemSchema),
        total: z.number().int(),
        page: z.number().int(),
        pages: z.number().int(),
      }),
    })
    .openapi(name);
}

export function createGenerator() {
  return new OpenApiGeneratorV31(registry.definitions);
}
