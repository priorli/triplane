import { createGenerator } from "./registry";

// Import all route registrations (side-effect imports).
// Add a new line here when you register a new route file.
import "./routes/health";

export function generateOpenAPIDocument() {
  const generator = createGenerator();

  return generator.generateDocument({
    openapi: "3.1.0",
    info: {
      title: "Triplane API",
      version: "1.0.0",
      description:
        "Triplane is Priorli's full-stack monorepo template. " +
        "All endpoints are under `/api/v1/`. Authentication is via Clerk — " +
        "web clients use cookies (automatic), mobile/API clients send " +
        "`Authorization: Bearer <token>`.\n\n" +
        "**Response format:** All successful responses are wrapped in `{ data: ... }`. " +
        "Errors return `{ error: { code, message } }`.\n\n" +
        "**Soft deletes:** DELETE endpoints set a `deletedAt` timestamp rather than destroying records.",
    },
    servers: [
      { url: "http://localhost:3000", description: "Local development" },
    ],
  });
}
