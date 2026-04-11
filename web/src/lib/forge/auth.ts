/**
 * Forge-local auth helper.
 *
 * For the v1 MVP (localhost, single-user dev tool), the forge does NOT require
 * a Clerk sign-in. Requiring full auth just to bootstrap a new project on
 * localhost would be friction with no benefit — there's only one user, there's
 * no shared state, and the dev already trusts their own machine.
 *
 * All forge API routes call `requireForgeUser()` in place of `requireUser()`.
 * It returns a fixed local-dev identity so the existing session-store plumbing
 * (which stores `userId` as metadata) keeps working unchanged.
 *
 * **v2 upgrade path:** when the forge graduates to a hosted multi-user SaaS,
 * replace the body of this function with the real `requireUser()` call from
 * `@/lib/auth`. That's a one-file change — no forge route or component code
 * needs to move.
 */
export const FORGE_LOCAL_USER_ID = "local-dev";

export async function requireForgeUser(): Promise<{ userId: string }> {
  return { userId: FORGE_LOCAL_USER_ID };
}
