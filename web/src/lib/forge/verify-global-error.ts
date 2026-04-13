import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CANONICAL_GLOBAL_ERROR_TSX } from "./canonical/global-error.tsx";

/**
 * Before `next build` runs in a forge session's worktree, verify that
 * `web/src/app/global-error.tsx` exists and is prerender-safe. If it's
 * missing or malformed, overwrite it with canonical content so the build
 * doesn't crash on `/_global-error`.
 *
 * Returns:
 *   { ok: true,  repaired: false }                       — file is good, no-op.
 *   { ok: true,  repaired: true,  reason: "missing" }    — file was absent, wrote canonical.
 *   { ok: true,  repaired: true,  reason: "banned …" }   — file had a context import, overwrote.
 *   { ok: false, repaired: false, reason: "<ioerror>" }  — couldn't read/write; caller should fail the session.
 *
 * Deliberately narrow scope: checks only the prerender contract (use client,
 * no banned provider imports, no useContext). Does NOT validate other aspects
 * (styling, i18n, etc.) — the template's canonical is the arbiter.
 */
export interface GlobalErrorVerifyResult {
  ok: boolean;
  repaired: boolean;
  reason?: string;
}

// Patterns that indicate a context dependency inside global-error.tsx.
// Any match triggers auto-repair. The list is intentionally restrictive —
// we'd rather auto-restore a slightly-custom file than let a broken build ship.
const BANNED_IMPORT_PATTERNS: Array<{ regex: RegExp; label: string }> = [
  { regex: /from\s+["']@clerk\//i, label: "@clerk/* provider import" },
  { regex: /from\s+["']next-intl/i, label: "next-intl provider import" },
  { regex: /from\s+["']next-themes/i, label: "next-themes provider import" },
  { regex: /from\s+["'][^"']*Provider["']/i, label: "generic *Provider import" },
];

const BANNED_CALL_PATTERNS: Array<{ regex: RegExp; label: string }> = [
  { regex: /\buseContext\s*\(/, label: "direct useContext() call" },
];

export async function ensureGlobalErrorValid(
  worktreePath: string,
): Promise<GlobalErrorVerifyResult> {
  const filePath = join(worktreePath, "web", "src", "app", "global-error.tsx");

  let current: string;
  try {
    current = await readFile(filePath, "utf8");
  } catch (e) {
    // ENOENT or other — treat as missing and restore.
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      try {
        await writeFile(filePath, CANONICAL_GLOBAL_ERROR_TSX, "utf8");
        return { ok: true, repaired: true, reason: "missing" };
      } catch (writeErr) {
        const message =
          writeErr instanceof Error ? writeErr.message : String(writeErr);
        return {
          ok: false,
          repaired: false,
          reason: `could not write canonical: ${message}`,
        };
      }
    }
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, repaired: false, reason: `could not read: ${message}` };
  }

  // Fast path: byte-for-byte match → no-op.
  if (current === CANONICAL_GLOBAL_ERROR_TSX) {
    return { ok: true, repaired: false };
  }

  // Check "use client" directive (must be first non-blank line).
  const firstNonBlank = current
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0 && !l.startsWith("//") && !l.startsWith("/*"));
  if (firstNonBlank !== '"use client";' && firstNonBlank !== "'use client';") {
    return restore(filePath, "missing 'use client' directive");
  }

  // Check for banned imports.
  for (const { regex, label } of BANNED_IMPORT_PATTERNS) {
    if (regex.test(current)) {
      return restore(filePath, `banned import: ${label}`);
    }
  }

  // Check for banned calls.
  for (const { regex, label } of BANNED_CALL_PATTERNS) {
    if (regex.test(current)) {
      return restore(filePath, `banned call: ${label}`);
    }
  }

  // File diverges from canonical but passes the contract checks. Leave it.
  // (A custom styling override is allowed as long as it's provider-free.)
  return { ok: true, repaired: false };
}

async function restore(
  filePath: string,
  reason: string,
): Promise<GlobalErrorVerifyResult> {
  try {
    await writeFile(filePath, CANONICAL_GLOBAL_ERROR_TSX, "utf8");
    return { ok: true, repaired: true, reason };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      repaired: false,
      reason: `${reason} (and could not restore: ${message})`,
    };
  }
}
