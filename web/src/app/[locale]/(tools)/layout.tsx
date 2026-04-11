import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ThemeToggle } from "@/components/theme-toggle";

/**
 * Layout for the Triplane Forge dev tool.
 *
 * Deliberately does NOT require Clerk authentication — the forge is a
 * localhost-only single-user MVP and forcing a sign-in just to bootstrap a
 * new project would be friction with no benefit. When v2 ships a hosted
 * version, switch this layout to use `auth()` + redirect like (app)/layout.
 */
export default async function ToolsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = await getTranslations("common");

  return (
    <div className="flex flex-col min-h-full">
      <header className="border-b">
        <div className="container mx-auto flex items-center justify-between h-14 px-4">
          <div className="flex items-center gap-6">
            <Link href="/forge/new" className="text-lg font-semibold">
              {t("forge.brandName")}
            </Link>
            <span className="text-xs text-muted-foreground uppercase tracking-wider">
              {t("forge.devModeLabel")}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="flex-1 container mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
