import { registry, dataResponse } from "../registry";
import { healthSchema } from "../responses";

registry.registerPath({
  method: "get",
  path: "/api/v1/health",
  tags: ["Health"],
  summary: "Health check",
  description: "Returns server status. No authentication required.",
  responses: {
    200: {
      description: "Server is healthy",
      content: {
        "application/json": {
          schema: dataResponse(healthSchema, "HealthResponse"),
        },
      },
    },
  },
});
