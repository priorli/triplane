import { getTranslations } from "next-intl/server";
import { DesignShowcase } from "@/components/design-showcase";
import { DesignStudyForm } from "./_components/DesignStudyForm";

export default async function ForgeDesignPage() {
  const t = await getTranslations("common");

  return (
    <div className="max-w-4xl mx-auto space-y-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">{t("forge.design.title")}</h1>
        <p className="text-sm text-muted-foreground max-w-2xl">
          {t("forge.design.subtitle")}
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">
          {t("forge.design.previewHeading")}
        </h2>
        <DesignShowcase />
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">
          {t("forge.design.studyHeading")}
        </h2>
        <p className="text-sm text-muted-foreground max-w-2xl">
          {t("forge.design.studySubtitle")}
        </p>
        <DesignStudyForm />
      </section>
    </div>
  );
}
