import { NextResponse } from "next/server";
import { generateOpenAPIDocument } from "@/lib/openapi";

export async function GET() {
  const doc = generateOpenAPIDocument();

  return NextResponse.json(doc, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=60",
    },
  });
}
