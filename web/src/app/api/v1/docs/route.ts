import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const specUrl = new URL("/api/v1/docs/openapi.json", req.url).toString();

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Triplane API Docs</title>
  <style>body { margin: 0; }</style>
</head>
<body>
  <script id="api-reference" data-url="${specUrl}"></script>
  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
</body>
</html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
