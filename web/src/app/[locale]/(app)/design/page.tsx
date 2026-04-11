"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

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

const TYPE_SCALES = [
  { name: "displayLarge", className: "text-displayLarge" },
  { name: "headlineLarge", className: "text-headlineLarge" },
  { name: "titleLarge", className: "text-titleLarge" },
  { name: "bodyLarge", className: "text-bodyLarge" },
  { name: "bodyMedium", className: "text-bodyMedium" },
  { name: "labelMedium", className: "text-labelMedium" },
] as const;

const RADII = [
  { name: "sm", className: "rounded-sm" },
  { name: "md", className: "rounded-md" },
  { name: "lg", className: "rounded-lg" },
  { name: "xl", className: "rounded-xl" },
] as const;

export default function DesignShowcasePage() {
  const t = useTranslations("common");
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="space-y-10 pb-16">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">{t("design.title")}</h1>
        <p className="text-muted-foreground max-w-2xl">{t("design.subtitle")}</p>
      </header>

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

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{t("design.componentsHeading")}</h2>
        <Card>
          <CardHeader>
            <CardTitle>Card</CardTitle>
            <CardDescription>
              Consumes `bg-card`, `text-card-foreground`, and the `border` token.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <Button>{t("design.sampleButtonDefault")}</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">{t("design.sampleButtonDestructive")}</Button>
            <Input
              className="max-w-xs"
              placeholder={t("design.sampleInputPlaceholder")}
            />
            <Button onClick={() => setDialogOpen(true)} variant="outline">
              {t("design.sampleDialogOpen")}
            </Button>
          </CardContent>
        </Card>
      </section>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("design.sampleDialogTitle")}</DialogTitle>
            <DialogDescription>{t("design.sampleDialogBody")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t("design.sampleDialogClose")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
