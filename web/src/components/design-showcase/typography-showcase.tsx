"use client";

import { useTranslations } from "next-intl";

const TYPE_SCALES = [
  { name: "displayLarge", className: "text-displayLarge" },
  { name: "headlineLarge", className: "text-headlineLarge" },
  { name: "titleLarge", className: "text-titleLarge" },
  { name: "bodyLarge", className: "text-bodyLarge" },
  { name: "bodyMedium", className: "text-bodyMedium" },
  { name: "labelMedium", className: "text-labelMedium" },
] as const;

export function TypographyShowcase() {
  const t = useTranslations("common");
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">{t("design.typographyHeading")}</h2>
      <div className="space-y-3 rounded-lg border bg-card text-card-foreground p-6">
        {TYPE_SCALES.map((scale) => (
          <div key={scale.name} className="flex items-baseline gap-4">
            <div className="font-mono text-xs text-muted-foreground w-32 shrink-0">
              {scale.name}
            </div>
            <div className={scale.className}>
              The quick brown fox jumps over the lazy dog
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
