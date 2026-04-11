import Anthropic from "@anthropic-ai/sdk";
import type {
  IdeateExtractRequest,
  IdeateExtractResponse,
  IdeateProposedFields,
  IdeateQuestion,
} from "./schemas";

const SYSTEM_PROMPT = `You are the Triplane Forge idea-extractor.

Triplane is a full-stack monorepo template (Next.js web + Compose Multiplatform Android/iOS) that gets customized for each product. The forge bootstraps a new project from a one-paragraph idea description.

Your job: given the user's raw prompt and any follow-up answers, decide whether you have enough information to populate the bootstrap form. Either:

- Call \`propose_fields\` when you can fully populate every field with confidence. Prefer this path — a concrete paragraph with a target user and 2+ feature ideas is usually enough.
- Call \`request_info\` with 1–3 targeted questions when key fields genuinely cannot be inferred.

Rules:
- Minimize round trips. Never ask more than 3 questions per call.
- Only ask what you truly cannot derive from the prompt. If features aren't stated but the idea strongly implies them, propose sensible defaults rather than asking.
- Never call both tools in one response. Never make multiple tool calls in one response.

Field conventions:
- productName: Title Case (e.g. "Recipe Share", "Dog Walker Log").
- displayName: usually same as productName. Only differs if the user wants a shorter marketing name.
- slug: kebab-case, derived from productName ("Recipe Share" → "recipe-share"). ASCII only, lowercase, no leading digit.
- namespace: dotted lowercase Java namespace. Default prefix "com.priorli." unless the user specifies their own org (e.g. "com.priorli.recipeshare"). No hyphens, no underscores.
- tagline: one short, punchy sentence. Not a restatement of the description.
- description: 2–4 sentences covering who it's for, what problem it solves, and how.
- targetUser: one sentence describing the primary persona.
- features: 3–5 user-facing capabilities is the sweet spot. Each has a short name and a one-line description. Never include infrastructure concerns like "authentication" or "database" — those come for free from the template.

When the prompt is very sparse (1 sentence, no user, no features), a good first question batch is:
1. "Who is the primary user?"
2. "What are the 3–4 most important things they should be able to do?"
3. "Any naming preferences, or should I pick a slug for you?"
`;

const proposeFieldsTool: Anthropic.Tool = {
  name: "propose_fields",
  description:
    "Call when you have enough information to fully populate every field of the Triplane bootstrap form.",
  input_schema: {
    type: "object",
    properties: {
      productName: { type: "string", description: "Title Case product name" },
      tagline: { type: "string", description: "One short, punchy sentence" },
      description: {
        type: "string",
        description: "2–4 sentences: who it's for, what problem, how",
      },
      targetUser: {
        type: "string",
        description: "One sentence describing the primary persona",
      },
      features: {
        type: "array",
        minItems: 1,
        maxItems: 7,
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            description: { type: "string" },
          },
          required: ["name", "description"],
        },
      },
      slug: {
        type: "string",
        description: "kebab-case, ASCII only, lowercase, no leading digit",
      },
      namespace: {
        type: "string",
        description: "Dotted lowercase Java namespace (e.g. com.priorli.recipeshare)",
      },
      displayName: { type: "string", description: "User-facing capitalized name" },
    },
    required: [
      "productName",
      "tagline",
      "description",
      "targetUser",
      "features",
      "slug",
      "namespace",
      "displayName",
    ],
  },
};

const requestInfoTool: Anthropic.Tool = {
  name: "request_info",
  description:
    "Call when you need 1–3 targeted clarifying questions before proposing fields. Only use when key fields genuinely cannot be inferred.",
  input_schema: {
    type: "object",
    properties: {
      rationale: {
        type: "string",
        description: "One sentence explaining why more info is needed",
      },
      questions: {
        type: "array",
        minItems: 1,
        maxItems: 3,
        items: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "Short kebab-case identifier (e.g. target-user, feature-list)",
            },
            label: {
              type: "string",
              description: "The question shown to the user",
            },
            hint: {
              type: "string",
              description: "Optional example or hint",
            },
            multiline: {
              type: "boolean",
              description: "True if the answer needs a textarea instead of an input",
            },
          },
          required: ["id", "label"],
        },
      },
    },
    required: ["rationale", "questions"],
  },
};

function buildUserMessage(args: IdeateExtractRequest): string {
  const parts: string[] = [];
  parts.push(`Raw idea: ${args.prompt.trim()}`);
  if (args.answers && args.answers.length > 0) {
    parts.push("");
    parts.push("Previous clarifying answers:");
    for (const qa of args.answers) {
      parts.push(`- Q: ${qa.question}`);
      parts.push(`  A: ${qa.answer}`);
    }
  }
  parts.push("");
  parts.push(
    "Decide now: either call `propose_fields` with a complete draft, or call `request_info` with 1–3 targeted questions.",
  );
  return parts.join("\n");
}

export async function extractIdeateFields(
  args: IdeateExtractRequest,
): Promise<IdeateExtractResponse> {
  const client = new Anthropic();

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    tools: [proposeFieldsTool, requestInfoTool],
    tool_choice: { type: "any" },
    messages: [{ role: "user", content: buildUserMessage(args) }],
  });

  const toolUse = response.content.find(
    (c): c is Anthropic.ToolUseBlock => c.type === "tool_use",
  );
  if (!toolUse) {
    throw new Error("extractor did not call a tool");
  }

  if (toolUse.name === "propose_fields") {
    return {
      status: "ready",
      fields: toolUse.input as IdeateProposedFields,
    };
  }

  if (toolUse.name === "request_info") {
    const input = toolUse.input as {
      rationale: string;
      questions: IdeateQuestion[];
    };
    return {
      status: "needs_info",
      rationale: input.rationale,
      questions: input.questions,
    };
  }

  throw new Error(`unexpected tool: ${toolUse.name}`);
}
