// Triplane OpenAPI response schemas — generic + per-feature.
//
// Add per-feature request and response schemas here as you build features.
// Each schema should call `.openapi("Name")` to register it as a named
// component in the generated spec. Request schemas are imported by the API
// route handlers for validation so the spec and the runtime parser can't
// drift.
//
// See `/api/v1/docs` for the rendered Scalar UI showing all registered schemas.

import { z } from "zod/v4";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { IMAGE_MIME_WHITELIST, MAX_ATTACHMENT_BYTES } from "@/lib/items";

// Extend zod with .openapi() so schemas defined in this file work regardless
// of whether a consumer has already imported ./registry. Idempotent.
extendZodWithOpenApi(z);

// --- Health ---
export const healthSchema = z
  .object({
    status: z.literal("ok"),
    timestamp: z.string(),
  })
  .openapi("Health");

// --- Items + Attachments ---

export const attachmentSchema = z
  .object({
    id: z.string(),
    itemId: z.string(),
    fileName: z.string(),
    fileType: z.string(),
    fileSize: z.number().int(),
    url: z
      .string()
      .describe(
        "Presigned GET URL. Transient — expires at `urlExpiresAt`. Do not cache beyond that.",
      ),
    urlExpiresAt: z.string().describe("ISO-8601 timestamp"),
    createdAt: z.string().describe("ISO-8601 timestamp"),
  })
  .openapi("Attachment");

export const itemSchema = z
  .object({
    id: z.string(),
    userId: z.string(),
    title: z.string(),
    description: z.string().nullable(),
    createdAt: z.string().describe("ISO-8601 timestamp"),
    updatedAt: z.string().describe("ISO-8601 timestamp"),
    attachments: z.array(attachmentSchema),
  })
  .openapi("Item");

export const createItemRequestSchema = z
  .object({
    title: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
  })
  .openapi("CreateItemRequest");

export const updateItemRequestSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
  })
  .openapi("UpdateItemRequest");

const imageMimeSchema = z.enum(IMAGE_MIME_WHITELIST);

export const presignRequestSchema = z
  .object({
    fileName: z.string().min(1).max(255),
    fileType: imageMimeSchema,
    fileSize: z.number().int().min(1).max(MAX_ATTACHMENT_BYTES),
  })
  .openapi("PresignRequest");

export const presignResponseSchema = z
  .object({
    uploadUrl: z.string(),
    storageKey: z.string(),
    expiresIn: z.number().int(),
  })
  .openapi("PresignResponse");

export const createAttachmentRequestSchema = z
  .object({
    itemId: z.string().min(1),
    storageKey: z.string().min(1),
    fileName: z.string().min(1).max(255),
    fileType: imageMimeSchema,
    fileSize: z.number().int().min(1).max(MAX_ATTACHMENT_BYTES),
  })
  .openapi("CreateAttachmentRequest");
