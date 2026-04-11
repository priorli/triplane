import { ok, fail } from "@/lib/api-response";
import { ideateExtractRequestSchema } from "@/lib/forge/schemas";
import { extractIdeateFields } from "@/lib/forge/ideate-extract";
import { requireForgeUser } from "@/lib/forge/auth";

export async function POST(request: Request) {
  try {
    await requireForgeUser();

    const body = await request.json();
    const parsed = ideateExtractRequestSchema.safeParse(body);
    if (!parsed.success) {
      return fail("VALIDATION_ERROR", parsed.error.message, 400);
    }

    try {
      const result = await extractIdeateFields(parsed.data);
      return ok(result);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return fail("EXTRACT_FAILED", message, 502);
    }
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
