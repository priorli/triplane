import { z } from "zod/v4";
import { registry, dataResponse, deletedResponseSchema, errorResponseSchema } from "../registry";
import {
  attachmentSchema,
  createAttachmentRequestSchema,
  presignRequestSchema,
  presignResponseSchema,
} from "../responses";

const presignData = presignResponseSchema;
const attachmentData = z.object({ attachment: attachmentSchema });

registry.registerPath({
  method: "post",
  path: "/api/v1/attachments/presign",
  tags: ["Attachments"],
  summary: "Get a presigned upload URL",
  description:
    "Returns a short-lived (15 minute) presigned PUT URL bound to the file's ContentType and ContentLength. " +
    "The client uploads the bytes directly to Tigris, then calls POST /api/v1/attachments with the same storageKey to persist metadata.",
  security: [{ ClerkAuth: [] }],
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: presignRequestSchema } },
    },
  },
  responses: {
    200: {
      description: "Presigned URL issued",
      content: {
        "application/json": {
          schema: dataResponse(presignData, "PresignUploadResponse"),
        },
      },
    },
    400: {
      description: "Validation error (bad MIME type, size limit, etc.)",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/attachments",
  tags: ["Attachments"],
  summary: "Save uploaded attachment metadata",
  description:
    "Call this after PUT'ing the bytes to the presigned URL. Verifies item ownership and persists the attachment row.",
  security: [{ ClerkAuth: [] }],
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: createAttachmentRequestSchema } },
    },
  },
  responses: {
    201: {
      description: "Created",
      content: {
        "application/json": {
          schema: dataResponse(attachmentData, "CreateAttachmentResponse"),
        },
      },
    },
    400: {
      description: "Validation error",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Parent item not found or not owned",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
});

registry.registerPath({
  method: "delete",
  path: "/api/v1/attachments/{id}",
  tags: ["Attachments"],
  summary: "Soft-delete attachment",
  description:
    "Sets `deletedAt` on the row. The Tigris object is preserved so undo remains possible; a separate cleanup job would handle real eviction.",
  security: [{ ClerkAuth: [] }],
  request: {
    params: z.object({ id: z.string() }),
  },
  responses: {
    200: {
      description: "Deleted",
      content: { "application/json": { schema: deletedResponseSchema } },
    },
    404: {
      description: "Not found or not owned",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
});
