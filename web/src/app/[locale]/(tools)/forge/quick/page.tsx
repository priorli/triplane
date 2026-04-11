import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { QuickForm } from "./_components/QuickForm";

export default async function ForgeQuickPage() {
  const t = await getTranslations("common");

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold">{t("forge.quick.title")}</h1>
        <p className="text-muted-foreground">{t("forge.quick.subtitle")}</p>
        <p className="text-xs text-muted-foreground">
          <Link href="/forge/new" className="underline underline-offset-2">
            {t("forge.quick.switchToFullForm")}
          </Link>
        </p>
      </div>
      <QuickForm />
    </div>
  );
}
