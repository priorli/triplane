// Triplane OpenAPI response schemas — generic + health only.
//
// Add per-feature response schemas here as you build features. Each schema
// should call `.openapi("Name")` to register it as a named component in the
// generated spec.
//
// See `/api/v1/docs` for the rendered Scalar UI showing all registered schemas.

import { z } from "zod/v4";
import "@asteasolutions/zod-to-openapi";

// --- Health ---
export const healthSchema = z
  .object({
    status: z.literal("ok"),
    timestamp: z.string(),
  })
  .openapi("Health");
