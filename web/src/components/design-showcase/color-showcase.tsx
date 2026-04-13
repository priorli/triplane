"use client";

import { useTranslations } from "next-intl";

const COLOR_TOKENS = [
  "brand",
  "brand-foreground",
  "background",
  "foreground",
  "card",
  "card-foreground",
  "muted",
  "muted-foreground",
  "border",
  "destructive",
  "destructive-foreground",
] as const;

export function ColorShowcase() {
  const t = useTranslations("common");
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">{t("design.colorsHeading")}</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {COLOR_TOKENS.map((token) => (
          <div
            key={token}
            className="rounded-lg border overflow-hidden bg-card text-card-foreground"
          >
            <div
              className="h-20 w-full"
              style={{ backgroundColor: `var(--${token})` }}
            />
            <div className="p-3 space-y-0.5">
              <div className="font-mono text-sm">{token}</div>
              <div className="font-mono text-xs text-muted-foreground">
                var(--{token})
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
