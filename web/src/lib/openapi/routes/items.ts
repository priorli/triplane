import { z } from "zod/v4";
import { registry, dataResponse, deletedResponseSchema, errorResponseSchema } from "../registry";
import {
  createItemRequestSchema,
  itemSchema,
  updateItemRequestSchema,
} from "../responses";

const itemsListData = z.object({ items: z.array(itemSchema) }).openapi("ItemsList");
const itemData = z.object({ item: itemSchema });

registry.registerPath({
  method: "get",
  path: "/api/v1/items",
  tags: ["Items"],
  summary: "List items",
  description: "Returns the authenticated user's non-deleted items, newest first. Each item includes its non-deleted attachments with transient presigned GET URLs.",
  security: [{ ClerkAuth: [] }],
  responses: {
    200: {
      description: "OK",
      content: {
        "application/json": {
          schema: dataResponse(itemsListData, "ItemsListResponse"),
        },
      },
    },
    401: {
      description: "Not authenticated",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/items",
  tags: ["Items"],
  summary: "Create item",
  security: [{ ClerkAuth: [] }],
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: createItemRequestSchema } },
    },
  },
  responses: {
    201: {
      description: "Created",
      content: {
        "application/json": {
          schema: dataResponse(itemData, "CreateItemResponse"),
        },
      },
    },
    400: {
      description: "Validation error",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    401: {
      description: "Not authenticated",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/items/{id}",
  tags: ["Items"],
  summary: "Get item by id",
  security: [{ ClerkAuth: [] }],
  request: {
    params: z.object({ id: z.string() }),
  },
  responses: {
    200: {
      description: "OK",
      content: {
        "application/json": {
          schema: dataResponse(itemData, "GetItemResponse"),
        },
      },
    },
    404: {
      description: "Not found or not owned",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
});

registry.registerPath({
  method: "patch",
  path: "/api/v1/items/{id}",
  tags: ["Items"],
  summary: "Update item",
  security: [{ ClerkAuth: [] }],
  request: {
    params: z.object({ id: z.string() }),
    body: {
      required: true,
      content: { "application/json": { schema: updateItemRequestSchema } },
    },
  },
  responses: {
    200: {
      description: "Updated",
      content: {
        "application/json": {
          schema: dataResponse(itemData, "UpdateItemResponse"),
        },
      },
    },
    400: {
      description: "Validation error",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Not found or not owned",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
});

registry.registerPath({
  method: "delete",
  path: "/api/v1/items/{id}",
  tags: ["Items"],
  summary: "Soft-delete item",
  description: "Sets `deletedAt`. Attachments are preserved so undo remains possible.",
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
