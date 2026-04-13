import { z } from "zod/v4";

const kebabCase = /^[a-z][a-z0-9-]*$/;
const javaNamespace = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

export const brandColorSchema = z.object({
  L: z.number().min(0).max(1),
  C: z.number().min(0).max(0.4),
  h: z.number().min(0).max(360),
});

export const featureEntrySchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().min(1).max(280),
});

export const designStudyImageSchema = z.object({
  name: z.string().min(1).max(120),
  mimeType: z.string().regex(/^image\/(png|jpeg|jpg|webp)$/i, "only PNG/JPEG/WebP accepted"),
  base64: z.string().min(1),
});

export const createSessionRequestSchema = z.object({
  productName: z.string().min(1).max(80),
  tagline: z.string().min(1).max(140),
  description: z.string().min(1).max(2000),
  targetUser: z.string().min(1).max(500),
  features: z.array(featureEntrySchema).min(1).max(7),
  slug: z.string().regex(kebabCase, "slug must be kebab-case"),
  namespace: z
    .string()
    .regex(javaNamespace, "namespace must be dotted lowercase (e.g. com.myorg.app)"),
  displayName: z.string().min(1).max(80),
  brandColor: brandColorSchema.optional(),
  planReview: z.boolean().optional().default(false),
  seedDemo: z.boolean().optional().default(false),
  implementFeatures: z.boolean().optional().default(true),
  verifyBuilds: z.boolean().optional().default(true),
  platformTarget: z.enum(["web", "mobile", "all"]).optional().default("all"),
  qaTest: z.boolean().optional().default(false),
  /**
   * Optional /design-study prelude inputs. When provided, the session runs
   * /design-study first in the worktree. The skill writes
   * `design-study-result.json`; the prelude reads its `brand` OKLch triplet
   * (if confidence is medium or high) and overrides `brandColor` before
   * /init-app runs. Images override sliders.
   */
  designStudyInputs: z
    .object({
      images: z.array(designStudyImageSchema).max(10).optional().default([]),
      urls: z.array(z.string().url()).max(10).optional().default([]),
      prompt: z.string().max(4000).optional().default(""),
    })
    .optional(),
});

export type CreateSessionRequest = z.infer<typeof createSessionRequestSchema>;

export const sessionResponseSchema = z.object({
  sessionId: z.string(),
  status: z.string(),
  worktreePath: z.string(),
  eventsUrl: z.string(),
  createdAt: z.string(),
});

export type SessionResponse = z.infer<typeof sessionResponseSchema>;

export const approvalDecisionSchema = z.object({
  approvalId: z.string(),
  decision: z.enum(["approved", "rejected"]),
  note: z.string().max(500).optional(),
});

export type ApprovalDecision = z.infer<typeof approvalDecisionSchema>;

export const ideateExtractRequestSchema = z.object({
  prompt: z.string().min(1).max(50000),
  answers: z
    .array(
      z.object({
        question: z.string().min(1).max(500),
        answer: z.string().min(1).max(1000),
      }),
    )
    .max(20)
    .optional()
    .default([]),
  brandColor: brandColorSchema.optional(),
});

export type IdeateExtractRequest = z.infer<typeof ideateExtractRequestSchema>;

export const ideateQuestionSchema = z.object({
  id: z.string(),
  label: z.string(),
  hint: z.string().optional(),
  multiline: z.boolean().optional(),
});

export type IdeateQuestion = z.infer<typeof ideateQuestionSchema>;

export const ideateProposedFieldsSchema = z.object({
  productName: z.string(),
  tagline: z.string(),
  description: z.string(),
  targetUser: z.string(),
  features: z
    .array(z.object({ name: z.string(), description: z.string() }))
    .min(1)
    .max(7),
  slug: z.string(),
  namespace: z.string(),
  displayName: z.string(),
});

export type IdeateProposedFields = z.infer<typeof ideateProposedFieldsSchema>;

export const ideateExtractResponseSchema = z.union([
  z.object({
    status: z.literal("ready"),
    fields: ideateProposedFieldsSchema,
  }),
  z.object({
    status: z.literal("needs_info"),
    rationale: z.string(),
    questions: z.array(ideateQuestionSchema).min(1).max(3),
  }),
]);

export type IdeateExtractResponse = z.infer<typeof ideateExtractResponseSchema>;

// --- Design study request -------------------------------------------------

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MiB per image
const MAX_TOTAL_IMAGE_BYTES = 30 * 1024 * 1024; // 30 MiB aggregate
const MAX_IMAGES = 10;

export const designStudyRequestSchema = z
  .object({
    images: z
      .array(designStudyImageSchema)
      .max(MAX_IMAGES, `at most ${MAX_IMAGES} images per study`)
      .optional()
      .default([]),
    urls: z
      .array(z.string().url("URLs must be absolute http(s) URLs"))
      .max(10)
      .optional()
      .default([]),
    prompt: z.string().max(4000).optional().default(""),
  })
  .refine(
    (v) => v.images.length > 0 || v.urls.length > 0 || v.prompt.trim().length > 0,
    { message: "Provide at least one of: images, urls, prompt" },
  )
  .refine(
    (v) =>
      v.images.every((img) => approxBase64Bytes(img.base64) <= MAX_IMAGE_BYTES),
    { message: `each image must be ≤ ${MAX_IMAGE_BYTES / (1024 * 1024)} MiB` },
  )
  .refine(
    (v) =>
      v.images.reduce((sum, img) => sum + approxBase64Bytes(img.base64), 0) <=
      MAX_TOTAL_IMAGE_BYTES,
    { message: `total image payload must be ≤ ${MAX_TOTAL_IMAGE_BYTES / (1024 * 1024)} MiB` },
  );

export type DesignStudyRequest = z.infer<typeof designStudyRequestSchema>;

/** Base64 encodes ~4 characters per 3 bytes, minus padding — close enough for a size check. */
function approxBase64Bytes(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}
