import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { NewProjectForm } from "./_components/NewProjectForm";

export default async function NewForgeProjectPage() {
  const t = await getTranslations("common");

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold">{t("forge.new.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("forge.new.subtitle")}
        </p>
        <p className="text-xs text-muted-foreground">
          <Link href="/forge/quick" className="underline underline-offset-2">
            {t("forge.new.switchToQuick")}
          </Link>
        </p>
      </div>
      <NewProjectForm />
    </div>
  );
}
