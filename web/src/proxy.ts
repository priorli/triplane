import { clerkMiddleware } from "@clerk/nextjs/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/config";
import { NextResponse } from "next/server";

const intlMiddleware = createMiddleware(routing);

export const proxy = clerkMiddleware((auth, request) => {
  // CORS handling for /api/v1/* routes (needed for mobile clients)
  if (request.nextUrl.pathname.startsWith("/api/v1")) {
    const response = NextResponse.next();
    response.headers.set("Access-Control-Allow-Origin", "*");
    response.headers.set(
      "Access-Control-Allow-Methods",
      "GET, POST, PATCH, DELETE, OPTIONS"
    );
    response.headers.set(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type"
    );

    if (request.method === "OPTIONS") {
      return new NextResponse(null, {
        status: 204,
        headers: response.headers,
      });
    }

    return response;
  }

  // Skip locale handling for all API routes (webhooks, etc.)
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return;
  }

  // For page routes, run next-intl middleware (locale detection + rewrite)
  return intlMiddleware(request);
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
