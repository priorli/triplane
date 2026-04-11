"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface FeatureRow {
  name: string;
  description: string;
}

const EMPTY_FEATURE: FeatureRow = { name: "", description: "" };

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function deriveNamespace(slug: string): string {
  const clean = slug.replace(/-/g, "");
  return clean ? `com.myorg.${clean}` : "";
}

export function NewProjectForm() {
  const t = useTranslations("common");
  const router = useRouter();

  const [productName, setProductName] = useState("");
  const [tagline, setTagline] = useState("");
  const [description, setDescription] = useState("");
  const [targetUser, setTargetUser] = useState("");
  const [features, setFeatures] = useState<FeatureRow[]>([
    { ...EMPTY_FEATURE },
    { ...EMPTY_FEATURE },
    { ...EMPTY_FEATURE },
  ]);
  const [slugOverride, setSlugOverride] = useState("");
  const [namespaceOverride, setNamespaceOverride] = useState("");
  const [displayNameOverride, setDisplayNameOverride] = useState("");

  const [brandEnabled, setBrandEnabled] = useState(false);
  const [brandL, setBrandL] = useState(0.55);
  const [brandC, setBrandC] = useState(0.2);
  const [brandH, setBrandH] = useState(250);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const derivedSlug = useMemo(
    () => slugOverride || slugify(productName),
    [productName, slugOverride],
  );
  const derivedNamespace = useMemo(
    () => namespaceOverride || deriveNamespace(derivedSlug),
    [derivedSlug, namespaceOverride],
  );
  const derivedDisplayName = useMemo(
    () => displayNameOverride || productName,
    [productName, displayNameOverride],
  );

  const filledFeatures = features.filter(
    (f) => f.name.trim() && f.description.trim(),
  );

  const canSubmit =
    !submitting &&
    productName.trim().length > 0 &&
    tagline.trim().length > 0 &&
    description.trim().length > 0 &&
    targetUser.trim().length > 0 &&
    derivedSlug.length > 0 &&
    derivedNamespace.length > 0 &&
    filledFeatures.length >= 1;

  function updateFeature(index: number, patch: Partial<FeatureRow>) {
    setFeatures((prev) =>
      prev.map((f, i) => (i === index ? { ...f, ...patch } : f)),
    );
  }

  function addFeature() {
    if (features.length >= 7) return;
    setFeatures((prev) => [...prev, { ...EMPTY_FEATURE }]);
  }

  function removeFeature(index: number) {
    if (features.length <= 1) return;
    setFeatures((prev) => prev.filter((_, i) => i !== index));
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/forge/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productName: productName.trim(),
          tagline: tagline.trim(),
          description: description.trim(),
          targetUser: targetUser.trim(),
          features: filledFeatures.map((f) => ({
            name: f.name.trim(),
            description: f.description.trim(),
          })),
          slug: derivedSlug,
          namespace: derivedNamespace,
          displayName: derivedDisplayName.trim(),
          brandColor: brandEnabled
            ? { L: brandL, C: brandC, h: brandH }
            : undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok || body.error) {
        throw new Error(body.error?.message ?? "Request failed");
      }
      const sessionId = body.data.sessionId as string;
      router.push(`/forge/sessions/${sessionId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("forge.form.ideaSection")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="f-name" className="text-sm font-medium">
              {t("forge.form.productName")}
            </label>
            <Input
              id="f-name"
              value={productName}
              onChange={(e) => setProductName(e.currentTarget.value)}
              placeholder={t("forge.form.productNamePlaceholder")}
              disabled={submitting}
              maxLength={80}
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="f-tagline" className="text-sm font-medium">
              {t("forge.form.tagline")}
            </label>
            <Input
              id="f-tagline"
              value={tagline}
              onChange={(e) => setTagline(e.currentTarget.value)}
              placeholder={t("forge.form.taglinePlaceholder")}
              disabled={submitting}
              maxLength={140}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="f-desc" className="text-sm font-medium">
              {t("forge.form.description")}
            </label>
            <textarea
              id="f-desc"
              value={description}
              onChange={(e) => setDescription(e.currentTarget.value)}
              placeholder={t("forge.form.descriptionPlaceholder")}
              disabled={submitting}
              maxLength={2000}
              rows={3}
              className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="f-target" className="text-sm font-medium">
              {t("forge.form.targetUser")}
            </label>
            <textarea
              id="f-target"
              value={targetUser}
              onChange={(e) => setTargetUser(e.currentTarget.value)}
              placeholder={t("forge.form.targetUserPlaceholder")}
              disabled={submitting}
              maxLength={500}
              rows={2}
              className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("forge.form.featuresSection")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {t("forge.form.featuresHint")}
          </p>
          {features.map((f, i) => (
            <div key={i} className="grid grid-cols-[1fr_2fr_auto] gap-2 items-start">
              <Input
                placeholder={t("forge.form.featureNamePlaceholder")}
                value={f.name}
                onChange={(e) =>
                  updateFeature(i, { name: e.currentTarget.value })
                }
                disabled={submitting}
                maxLength={80}
              />
              <Input
                placeholder={t("forge.form.featureDescriptionPlaceholder")}
                value={f.description}
                onChange={(e) =>
                  updateFeature(i, { description: e.currentTarget.value })
                }
                disabled={submitting}
                maxLength={280}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => removeFeature(i)}
                disabled={submitting || features.length <= 1}
              >
                {t("forge.form.removeFeature")}
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={addFeature}
            disabled={submitting || features.length >= 7}
          >
            {t("forge.form.addFeature")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("forge.form.identitySection")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            {t("forge.form.identityHint")}
          </p>
          <div className="space-y-1">
            <label htmlFor="f-slug" className="text-sm font-medium">
              {t("forge.form.slug")}
            </label>
            <Input
              id="f-slug"
              value={derivedSlug}
              onChange={(e) => setSlugOverride(e.currentTarget.value)}
              disabled={submitting}
              maxLength={60}
              placeholder={t("forge.form.slugPlaceholder")}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="f-ns" className="text-sm font-medium">
              {t("forge.form.namespace")}
            </label>
            <Input
              id="f-ns"
              value={derivedNamespace}
              onChange={(e) => setNamespaceOverride(e.currentTarget.value)}
              disabled={submitting}
              maxLength={120}
              placeholder={t("forge.form.namespacePlaceholder")}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="f-display" className="text-sm font-medium">
              {t("forge.form.displayName")}
            </label>
            <Input
              id="f-display"
              value={derivedDisplayName}
              onChange={(e) => setDisplayNameOverride(e.currentTarget.value)}
              disabled={submitting}
              maxLength={80}
              placeholder={t("forge.form.displayNamePlaceholder")}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("forge.form.brandSection")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={brandEnabled}
              onChange={(e) => setBrandEnabled(e.currentTarget.checked)}
              disabled={submitting}
            />
            {t("forge.form.brandEnable")}
          </label>
          {brandEnabled && (
            <div className="space-y-3">
              <BrandSlider
                id="brand-L"
                label="L (lightness)"
                value={brandL}
                onChange={setBrandL}
                min={0}
                max={1}
                step={0.01}
                disabled={submitting}
              />
              <BrandSlider
                id="brand-C"
                label="C (chroma)"
                value={brandC}
                onChange={setBrandC}
                min={0}
                max={0.4}
                step={0.01}
                disabled={submitting}
              />
              <BrandSlider
                id="brand-h"
                label="h (hue)"
                value={brandH}
                onChange={setBrandH}
                min={0}
                max={360}
                step={1}
                disabled={submitting}
              />
              <div
                className="h-10 rounded-md border"
                style={{
                  backgroundColor: `oklch(${brandL} ${brandC} ${brandH})`,
                }}
                aria-label="Brand color preview"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button
          size="lg"
          onClick={submit}
          disabled={!canSubmit}
        >
          {submitting
            ? t("forge.form.submitting")
            : t("forge.form.submit")}
        </Button>
      </div>
    </div>
  );
}

interface SliderProps {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
}

function BrandSlider({
  id,
  label,
  value,
  onChange,
  min,
  max,
  step,
  disabled,
}: SliderProps) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-xs font-medium flex justify-between">
        <span>{label}</span>
        <span className="text-muted-foreground tabular-nums">
          {value.toFixed(step < 1 ? 2 : 0)}
        </span>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.currentTarget.value))}
        disabled={disabled}
        className="w-full"
      />
    </div>
  );
}
