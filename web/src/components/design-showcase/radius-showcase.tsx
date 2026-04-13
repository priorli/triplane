"use client";

import { useTranslations } from "next-intl";

const RADII = [
  { name: "sm", className: "rounded-sm" },
  { name: "md", className: "rounded-md" },
  { name: "lg", className: "rounded-lg" },
  { name: "xl", className: "rounded-xl" },
] as const;

export function RadiusShowcase() {
  const t = useTranslations("common");
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">{t("design.radiusHeading")}</h2>
      <div className="flex flex-wrap gap-6">
        {RADII.map((r) => (
          <div key={r.name} className="flex flex-col items-center gap-2">
            <div className={`size-20 bg-muted border ${r.className}`} />
            <div className="font-mono text-xs text-muted-foreground">{r.name}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
