"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  DesignReferenceInputs,
  filesToBase64Payload,
  parseUrls,
  MAX_IMAGE_BYTES,
  MAX_IMAGES,
} from "@/components/forge/design-reference-inputs";

const MAX_TOTAL_IMAGE_BYTES = 30 * 1024 * 1024;

export function DesignStudyForm() {
  const t = useTranslations("common");
  const router = useRouter();

  const [files, setFiles] = useState<File[]>([]);
  const [urls, setUrls] = useState("");
  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  const oversizedFile = files.find((f) => f.size > MAX_IMAGE_BYTES);
  const noInputs =
    files.length === 0 && urls.trim().length === 0 && prompt.trim().length === 0;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (noInputs) {
      setError(t("forge.design.form.validation.noInputs"));
      return;
    }
    if (oversizedFile) {
      setError(t("forge.design.form.validation.tooLarge"));
      return;
    }
    if (totalSize > MAX_TOTAL_IMAGE_BYTES) {
      setError(t("forge.design.form.validation.totalTooLarge"));
      return;
    }
    if (files.length > MAX_IMAGES) {
      setError(t("forge.design.form.validation.tooManyImages"));
      return;
    }

    const parsedUrls = parseUrls(urls);
    if (parsedUrls === null) {
      setError(t("forge.design.form.validation.invalidUrl"));
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const images = await filesToBase64Payload(files);
      const res = await fetch("/api/v1/forge/design-studies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images, urls: parsedUrls, prompt: prompt.trim() }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.error?.message ?? `HTTP ${res.status}`);
        setSubmitting(false);
        return;
      }
      const sessionId = body.data.sessionId as string;
      router.push(`/forge/sessions/${sessionId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <DesignReferenceInputs
        files={files}
        urls={urls}
        prompt={prompt}
        onFilesChange={setFiles}
        onUrlsChange={setUrls}
        onPromptChange={setPrompt}
        disabled={submitting}
      />

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-3">
        <Button type="submit" disabled={submitting || noInputs}>
          {submitting
            ? t("forge.design.form.submitting")
            : t("forge.design.form.submit")}
        </Button>
      </div>
    </form>
  );
}
