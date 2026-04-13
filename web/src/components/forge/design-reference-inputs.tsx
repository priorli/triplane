"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGES = 10;
const ACCEPTED_TYPES = /^image\/(png|jpeg|jpg|webp)$/i;

export interface DesignReferenceInputsProps {
  files: File[];
  urls: string;
  prompt: string;
  onFilesChange: (files: File[]) => void;
  onUrlsChange: (urls: string) => void;
  onPromptChange: (prompt: string) => void;
  disabled?: boolean;
}

/**
 * Shared image + URL + prose-prompt input section, used both on
 * `/forge/design` (standalone study) and on `/forge/new` + `/forge/quick`
 * (prelude-to-bootstrap) so a single DX lives in one file.
 */
export function DesignReferenceInputs(props: DesignReferenceInputsProps) {
  const t = useTranslations("common");
  const [dragging, setDragging] = useState(false);

  const totalSize = props.files.reduce((sum, f) => sum + f.size, 0);

  function addFiles(incoming: FileList | File[]) {
    const accepted = Array.from(incoming).filter((f) =>
      ACCEPTED_TYPES.test(f.type),
    );
    props.onFilesChange([...props.files, ...accepted].slice(0, MAX_IMAGES));
  }

  function removeFile(index: number) {
    props.onFilesChange(props.files.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("forge.design.form.imagesLabel")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (!props.disabled && e.dataTransfer?.files)
                addFiles(e.dataTransfer.files);
            }}
            className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center text-sm transition-colors ${
              dragging
                ? "border-brand bg-muted/40"
                : "border-border text-muted-foreground"
            }`}
          >
            <p>{t("forge.design.form.imagesDropHint")}</p>
            <p className="text-xs">{t("forge.design.form.imagesHint")}</p>
            <input
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp"
              multiple
              disabled={props.disabled}
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files);
                e.target.value = "";
              }}
              className="block max-w-xs text-xs text-muted-foreground file:mr-2 file:rounded-md file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs file:text-foreground"
            />
          </div>
          {props.files.length > 0 && (
            <ul className="space-y-2">
              {props.files.map((f, idx) => (
                <li
                  key={`${f.name}-${idx}`}
                  className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                >
                  <div className="flex flex-col">
                    <span className="truncate font-mono text-xs">{f.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {(f.size / (1024 * 1024)).toFixed(2)} MiB
                      {f.size > MAX_IMAGE_BYTES ? " — too large" : ""}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={props.disabled}
                    onClick={() => removeFile(idx)}
                  >
                    {t("forge.design.removeImage")}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {props.files.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {props.files.length} image{props.files.length === 1 ? "" : "s"},{" "}
              {(totalSize / (1024 * 1024)).toFixed(2)} MiB
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("forge.design.form.urlsLabel")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <textarea
            value={props.urls}
            onChange={(e) => props.onUrlsChange(e.target.value)}
            placeholder={t("forge.design.form.urlsPlaceholder")}
            rows={3}
            disabled={props.disabled}
            className="w-full rounded-lg border border-input bg-transparent p-3 font-mono text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
          />
          <p className="text-xs text-muted-foreground">
            {t("forge.design.form.urlsHint")}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("forge.design.form.promptLabel")}</CardTitle>
        </CardHeader>
        <CardContent>
          <textarea
            value={props.prompt}
            onChange={(e) => props.onPromptChange(e.target.value)}
            placeholder={t("forge.design.form.promptPlaceholder")}
            rows={4}
            disabled={props.disabled}
            className="w-full rounded-lg border border-input bg-transparent p-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
          />
        </CardContent>
      </Card>
    </div>
  );
}

/** Convert an array of File objects to the `{ name, mimeType, base64 }` payload
 * shape accepted by `/api/v1/forge/design-studies` and the `designStudyInputs`
 * field of `/api/v1/forge/sessions`. */
export async function filesToBase64Payload(
  files: File[],
): Promise<Array<{ name: string; mimeType: string; base64: string }>> {
  return Promise.all(
    files.map(async (file) => {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = "";
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 =
        typeof btoa !== "undefined"
          ? btoa(binary)
          : Buffer.from(binary, "binary").toString("base64");
      return {
        name: file.name,
        mimeType: file.type || "image/png",
        base64,
      };
    }),
  );
}

/** Parse the URLs textarea into an array of valid http(s) URLs.
 * Returns `null` for the first invalid URL, or the array if all pass. */
export function parseUrls(raw: string): string[] | null {
  const urls = raw
    .split("\n")
    .map((u) => u.trim())
    .filter((u) => u.length > 0);
  for (const url of urls) {
    try {
      const parsed = new URL(url);
      if (!/^https?:$/.test(parsed.protocol)) return null;
    } catch {
      return null;
    }
  }
  return urls;
}

export { MAX_IMAGE_BYTES, MAX_IMAGES };
