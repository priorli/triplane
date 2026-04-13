"use client";

import { useTranslations } from "next-intl";
import { DesignShowcase } from "@/components/design-showcase";

export default function DesignShowcasePage() {
  const t = useTranslations("common");

  return (
    <div className="space-y-10 pb-16">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">{t("design.title")}</h1>
        <p className="text-muted-foreground max-w-2xl">{t("design.subtitle")}</p>
      </header>
      <DesignShowcase />
    </div>
  );
}
