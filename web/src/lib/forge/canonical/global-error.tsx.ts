/**
 * Canonical content for `web/src/app/global-error.tsx` in a downstream
 * bootstrapped project. This is the single source of truth used by:
 *
 *   1. `verify-global-error.ts` — auto-repair during verify-builds if the
 *      file is missing or diverged in a way that would break `next build`.
 *   2. `.claude/skills/init-app/SKILL.md` Step 7 pre-flight — the agent
 *      writes this exact content when it detects drift.
 *
 * If the template's canonical content evolves (design-token styling, i18n
 * strings), update both this string AND the committed `web/src/app/global-error.tsx`
 * on the `main` branch in the same commit. The preflight's `no-op on match`
 * check relies on byte-for-byte parity.
 *
 * **Contract:** the file must be `"use client"`, render its own `<html>`/`<body>`,
 * and import zero context providers (ClerkProvider, NextIntlClientProvider,
 * ThemeProvider, anything with a React context). Next.js 16's prerender of
 * `/_global-error` runs OUTSIDE any provider tree — a context dependency
 * crashes the build with `Cannot read properties of null (reading 'useContext')`.
 */
export const CANONICAL_GLOBAL_ERROR_TSX = `"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body>
        <div style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
          <h2>Something went wrong</h2>
          <p style={{ color: "#666" }}>{error.message}</p>
          <button
            onClick={() => reset()}
            style={{
              marginTop: "1rem",
              padding: "0.5rem 1rem",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
`;
