"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Item } from "@/lib/items-types";
import { uploadPhoto } from "./uploadPhoto";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (item: Item) => void;
};

export function CreateItemDialog({ open, onOpenChange, onCreated }: Props) {
  const t = useTranslations("common");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setTitle("");
    setDescription("");
    setFiles([]);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function submit() {
    if (!title.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok || body.error) {
        throw new Error(body.error?.message ?? t("items.errors.createFailed"));
      }
      const created: Item = body.data.item;

      for (const file of files) {
        try {
          await uploadPhoto(created.id, file);
        } catch (e) {
          // Continue with remaining files but surface the first error
          if (!error) {
            setError(e instanceof Error ? e.message : t("items.errors.uploadFailed"));
          }
        }
      }

      onCreated(created);
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("items.errors.createFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (!nextOpen) reset();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("items.createDialogTitle")}</DialogTitle>
          <DialogDescription>{t("items.createDialogBody")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <label htmlFor="item-title" className="text-sm font-medium">
              {t("items.fields.title")}
            </label>
            <Input
              id="item-title"
              value={title}
              onChange={(e) => setTitle(e.currentTarget.value)}
              placeholder={t("items.fields.titlePlaceholder")}
              disabled={submitting}
              maxLength={200}
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="item-desc" className="text-sm font-medium">
              {t("items.fields.description")}
            </label>
            <textarea
              id="item-desc"
              value={description}
              onChange={(e) => setDescription(e.currentTarget.value)}
              placeholder={t("items.fields.descriptionPlaceholder")}
              disabled={submitting}
              maxLength={2000}
              rows={3}
              className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="item-photos" className="text-sm font-medium">
              {t("items.fields.photos")}
            </label>
            <Input
              ref={fileInputRef}
              id="item-photos"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              disabled={submitting}
              onChange={(e) => setFiles(Array.from(e.currentTarget.files ?? []))}
            />
            {files.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {files.length} file{files.length === 1 ? "" : "s"} selected
              </p>
            )}
          </div>
          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            {t("buttons.cancel")}
          </Button>
          <Button onClick={submit} disabled={submitting || !title.trim()}>
            {submitting ? t("buttons.creating") : t("buttons.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
