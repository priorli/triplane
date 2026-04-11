"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Attachment, Item } from "@/lib/items-types";
import { uploadPhoto } from "../../_components/uploadPhoto";
import { DeleteConfirmDialog } from "../../_components/DeleteConfirmDialog";

export function ItemDetailClient({ itemId }: { itemId: string }) {
  const t = useTranslations("common");
  const router = useRouter();
  const [item, setItem] = useState<Item | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [confirmDeleteItem, setConfirmDeleteItem] = useState(false);
  const [confirmDeleteAttachment, setConfirmDeleteAttachment] =
    useState<Attachment | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadItem = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/v1/items/${itemId}`);
      const body = await res.json();
      if (!res.ok || body.error) {
        throw new Error(body.error?.message ?? `HTTP ${res.status}`);
      }
      setItem(body.data.item);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("items.errors.loadFailed"));
    }
  }, [itemId, t]);

  useEffect(() => {
    loadItem();
  }, [loadItem]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0 || !item) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        await uploadPhoto(item.id, file);
      }
      await loadItem();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("items.errors.uploadFailed"));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function deleteItem() {
    const res = await fetch(`/api/v1/items/${itemId}`, { method: "DELETE" });
    const body = await res.json();
    if (!res.ok || body.error) {
      throw new Error(body.error?.message ?? t("items.errors.deleteFailed"));
    }
    router.push("/items");
  }

  async function deleteAttachment(attachmentId: string) {
    const res = await fetch(`/api/v1/attachments/${attachmentId}`, {
      method: "DELETE",
    });
    const body = await res.json();
    if (!res.ok || body.error) {
      throw new Error(body.error?.message ?? t("items.errors.deleteFailed"));
    }
    await loadItem();
  }

  if (error && !item) {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  if (!item) {
    return <p className="text-sm text-muted-foreground">{t("states.loading")}</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/items"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← {t("items.detail.back")}
        </Link>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold">{item.title}</h1>
          {item.description && (
            <p className="text-muted-foreground mt-2 whitespace-pre-wrap">
              {item.description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="destructive"
            onClick={() => setConfirmDeleteItem(true)}
          >
            {t("buttons.delete")}
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle>{t("items.fields.photos")}</CardTitle>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="hidden"
                onChange={(e) => handleFiles(e.currentTarget.files)}
              />
              <Button
                variant="outline"
                size="sm"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? t("buttons.uploading") : t("items.detail.addPhotos")}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {item.attachments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("items.detail.noPhotos")}
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {item.attachments.map((attachment) => (
                <div
                  key={attachment.id}
                  className="relative aspect-square overflow-hidden rounded-lg bg-muted group"
                >
                  <Image
                    src={attachment.url}
                    alt={attachment.fileName}
                    fill
                    sizes="(max-width: 768px) 50vw, 25vw"
                    className="object-cover"
                    unoptimized
                  />
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteAttachment(attachment)}
                    className="absolute top-1 right-1 rounded bg-background/90 px-2 py-1 text-xs text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    {t("buttons.delete")}
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <DeleteConfirmDialog
        open={confirmDeleteItem}
        onOpenChange={setConfirmDeleteItem}
        title={t("items.deleteDialogTitle")}
        body={t("items.deleteDialogBody")}
        onConfirm={deleteItem}
      />

      <DeleteConfirmDialog
        open={confirmDeleteAttachment !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDeleteAttachment(null);
        }}
        title={t("items.deleteAttachmentDialogTitle")}
        body={t("items.deleteAttachmentDialogBody")}
        onConfirm={async () => {
          if (confirmDeleteAttachment) {
            await deleteAttachment(confirmDeleteAttachment.id);
            setConfirmDeleteAttachment(null);
          }
        }}
      />
    </div>
  );
}
