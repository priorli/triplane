"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Item } from "@/lib/items-types";
import { CreateItemDialog } from "./CreateItemDialog";

export function ItemsListClient() {
  const t = useTranslations("common");
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const loadItems = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/v1/items");
      const body = await res.json();
      if (!res.ok || body.error) {
        throw new Error(body.error?.message ?? `HTTP ${res.status}`);
      }
      setItems(body.data.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("items.errors.loadFailed"));
      setItems([]);
    }
  }, [t]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{t("items.listTitle")}</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {t("items.listSubtitle")}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          {t("items.createButton")}
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {items === null ? (
        <p className="text-sm text-muted-foreground">{t("states.loading")}</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("items.empty")}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </div>
      )}

      <CreateItemDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(_created) => {
          setCreateOpen(false);
          loadItems();
        }}
      />
    </div>
  );
}

function ItemCard({ item }: { item: Item }) {
  const cover = item.attachments[0];
  return (
    <Link href={`/items/${item.id}`}>
      <Card className="h-full transition-colors hover:bg-muted/40">
        {cover ? (
          <div className="relative aspect-video w-full overflow-hidden bg-muted">
            <Image
              src={cover.url}
              alt={item.title}
              fill
              sizes="(max-width: 768px) 100vw, 33vw"
              className="object-cover"
              unoptimized
            />
          </div>
        ) : null}
        <CardHeader>
          <CardTitle className="line-clamp-1">{item.title}</CardTitle>
        </CardHeader>
        {item.description ? (
          <CardContent>
            <p className="text-sm text-muted-foreground line-clamp-2">
              {item.description}
            </p>
          </CardContent>
        ) : null}
      </Card>
    </Link>
  );
}
