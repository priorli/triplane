import { auth } from "@clerk/nextjs/server";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

export default async function HomePage() {
  const { userId } = await auth();
  const t = await getTranslations("landing");

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-4">
      <div className="text-center space-y-4">
        <h1 className="text-5xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-lg text-muted-foreground max-w-md">
          {t("subtitle")}
        </p>
      </div>

      {userId ? (
        <Link href="/home">
          <Button size="lg">{t("dashboard")}</Button>
        </Link>
      ) : (
        <Link href="/sign-in">
          <Button size="lg">{t("getStarted")}</Button>
        </Link>
      )}
    </main>
  );
}
