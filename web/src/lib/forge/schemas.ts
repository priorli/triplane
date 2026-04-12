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
