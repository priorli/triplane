import { auth } from "@clerk/nextjs/server";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { Link } from "@/i18n/navigation";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/");

  const t = await getTranslations("common");

  return (
    <div className="flex flex-col min-h-full">
      <header className="border-b">
        <div className="container mx-auto flex items-center justify-between h-14 px-4">
          <div className="flex items-center gap-6">
            <Link href="/home" className="text-lg font-semibold">
              {t("nav.appName")}
            </Link>
            <nav className="flex items-center gap-4 text-sm text-muted-foreground">
              <Link href="/home" className="hover:text-foreground">
                {t("nav.home")}
              </Link>
              <Link href="/items" className="hover:text-foreground">
                {t("nav.items")}
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <UserButton />
          </div>
        </div>
      </header>
      <main className="flex-1 container mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
