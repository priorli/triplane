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

export function ComponentShowcase() {
  const t = useTranslations("common");
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
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
    </section>
  );
}
