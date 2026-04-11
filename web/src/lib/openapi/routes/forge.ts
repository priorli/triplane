import { z } from "zod/v4";
import { registry, dataResponse, errorResponseSchema } from "../registry";
import {
  createSessionRequestSchema,
  sessionResponseSchema,
  ideateExtractRequestSchema,
  ideateProposedFieldsSchema,
  ideateQuestionSchema,
} from "@/lib/forge/schemas";

const sessionMetadataSchema = z
  .object({
    sessionId: z.string(),
    status: z.string(),
    worktreePath: z.string(),
    worktreeExists: z.boolean(),
    eventCount: z.number(),
    pendingApprovalCount: z.number(),
    errorMessage: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
    inputs: z.object({
      slug: z.string(),
      displayName: z.string(),
      productName: z.string(),
    }),
  })
  .openapi("ForgeSessionMetadata");

const sessionDiscardSchema = z
  .object({
    sessionId: z.string(),
    discarded: z.boolean(),
    wasRunning: z.boolean(),
  })
  .openapi("ForgeSessionDiscard");

const ideateExtractResponseData = z
  .union([
    z.object({
      status: z.literal("ready"),
      fields: ideateProposedFieldsSchema,
    }),
    z.object({
      status: z.literal("needs_info"),
      rationale: z.string(),
      questions: z.array(ideateQuestionSchema),
    }),
  ])
  .openapi("ForgeIdeateExtractResponse");

const sessionListData = z
  .object({
    sessions: z.array(sessionResponseSchema.omit({ eventsUrl: true })),
  })
  .openapi("ForgeSessionsList");

const sessionData = z.object({ ...sessionResponseSchema.shape });

registry.registerPath({
  method: "post",
  path: "/api/v1/forge/sessions",
  tags: ["Forge"],
  summary: "Create a new forge session",
  description:
    "Creates a git worktree of main under the session ID, writes IDEA.md with " +
    "frontmatter (suggested_slug + features) and prose (name, tagline, description, " +
    "target user, MVP feature backlog) from the form input. Does NOT start the worker " +
    "yet — that's a separate action in sub-phase 9.4.",
  security: [{ ClerkAuth: [] }],
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: createSessionRequestSchema } },
    },
  },
  responses: {
    201: {
      description: "Session created",
      content: {
        "application/json": {
          schema: dataResponse(sessionData, "CreateForgeSessionResponse"),
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
    500: {
      description: "Worktree or IDEA.md creation failed",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/forge/sessions",
  tags: ["Forge"],
  summary: "List forge sessions",
  description: "Returns all in-memory sessions (resets on dev server restart).",
  security: [{ ClerkAuth: [] }],
  responses: {
    200: {
      description: "OK",
      content: {
        "application/json": {
          schema: dataResponse(sessionListData, "ForgeSessionsListResponse"),
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
  method: "get",
  path: "/api/v1/forge/sessions/{id}",
  tags: ["Forge"],
  summary: "Get forge session metadata",
  description:
    "Returns a snapshot of the session (status, event count, worktree path). " +
    "The SSE events stream at /events is the real-time feed; this endpoint is " +
    "for server components and polling fallbacks.",
  security: [{ ClerkAuth: [] }],
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: {
      description: "OK",
      content: {
        "application/json": {
          schema: dataResponse(sessionMetadataSchema, "ForgeSessionMetadataResponse"),
        },
      },
    },
    404: {
      description: "Session not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
});

registry.registerPath({
  method: "delete",
  path: "/api/v1/forge/sessions/{id}",
  tags: ["Forge"],
  summary: "Discard a forge session (abort worker + remove worktree)",
  description:
    "Aborts the agent run if still in-flight, removes the git worktree + branch, " +
    "and drops the in-memory session row. Idempotent up to a point — once the " +
    "session is gone subsequent calls return 404.",
  security: [{ ClerkAuth: [] }],
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: {
      description: "Discarded",
      content: {
        "application/json": {
          schema: dataResponse(sessionDiscardSchema, "ForgeSessionDiscardResponse"),
        },
      },
    },
    404: {
      description: "Session not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    500: {
      description: "Worktree removal failed",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/forge/ideate/extract",
  tags: ["Forge"],
  summary: "Extract structured form fields from a raw idea prompt (quick mode)",
  description:
    "Takes a plain-language idea prompt and optional follow-up answers, calls Claude with two " +
    "tools (`propose_fields` vs `request_info`), and returns either a fully populated form ready " +
    "to POST to /api/v1/forge/sessions OR 1–3 clarifying questions the client should surface and " +
    "resubmit with the accumulated answers. Stateless — the client holds the conversation.",
  security: [{ ClerkAuth: [] }],
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: ideateExtractRequestSchema } },
    },
  },
  responses: {
    200: {
      description: "OK — either ready with fields or needs_info with questions",
      content: {
        "application/json": {
          schema: dataResponse(
            ideateExtractResponseData,
            "ForgeIdeateExtractEnvelope",
          ),
        },
      },
    },
    400: {
      description: "Validation error",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    502: {
      description: "Upstream extractor call failed",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/forge/sessions/{id}/download",
  tags: ["Forge"],
  summary: "Download the session worktree as a tar.gz archive",
  description:
    "Streams a gzipped tar of the session worktree. Excludes .git/, node_modules/, " +
    ".next/, build/, .gradle/, .kotlin/, dist/, and generated/ to keep the archive " +
    "small. The archive contains the downstream project source ready to `cd` into.",
  security: [{ ClerkAuth: [] }],
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: {
      description: "OK — streamed tar.gz",
      content: {
        "application/gzip": {
          schema: z.string().describe("Binary tar.gz archive (streamed)"),
        },
      },
    },
    404: {
      description: "Session not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    410: {
      description: "Worktree no longer exists (already discarded)",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
});
