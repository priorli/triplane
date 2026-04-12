"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type PlatformTarget = "web" | "mobile" | "all";

export interface PhaseTogglesProps {
  planReview: boolean;
  setPlanReview: (next: boolean) => void;
  seedDemo: boolean;
  setSeedDemo: (next: boolean) => void;
  implementFeatures: boolean;
  setImplementFeatures: (next: boolean) => void;
  verifyBuilds: boolean;
  setVerifyBuilds: (next: boolean) => void;
  platformTarget: PlatformTarget;
  setPlatformTarget: (next: PlatformTarget) => void;
  qaTest: boolean;
  setQaTest: (next: boolean) => void;
  disabled: boolean;
}

/**
 * Shared phase-toggle cards used by both the full (`/forge/new`) and quick
 * (`/forge/quick`) forms. Keeps the four opt-in flags and their i18n labels
 * in one place so the two entry forms can't drift.
 *
 * Phase ordering matches the worker's runtime order:
 *   1. planReview (prelude)
 *   2. seedDemo (post-init postlude)
 *   3. implementFeatures (post-init postlude)
 *   4. verifyBuilds (final postlude)
 */
export function PhaseToggles(props: PhaseTogglesProps) {
  const t = useTranslations("common");
  return (
    <>
      <ToggleCard
        title={t("forge.form.planReviewSection")}
        label={t("forge.form.planReviewLabel")}
        hint={t("forge.form.planReviewHint")}
        note={t("forge.form.planReviewDefault")}
        checked={props.planReview}
        onChange={props.setPlanReview}
        disabled={props.disabled}
      />
      <ToggleCard
        title={t("forge.form.seedDemoSection")}
        label={t("forge.form.seedDemoLabel")}
        hint={t("forge.form.seedDemoHint")}
        note={t("forge.form.seedDemoDefault")}
        checked={props.seedDemo}
        onChange={props.setSeedDemo}
        disabled={props.disabled}
      />
      <ToggleCard
        title={t("forge.form.implementSection")}
        label={t("forge.form.implementLabel")}
        hint={t("forge.form.implementHint")}
        note={t("forge.form.implementDefault")}
        checked={props.implementFeatures}
        onChange={props.setImplementFeatures}
        disabled={props.disabled}
      />
      {props.implementFeatures && (
        <Card>
          <CardHeader>
            <CardTitle>Platform target</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(
              [
                { value: "all", label: "All platforms", hint: "API + Web + Mobile (Android & iOS)" },
                { value: "web", label: "Web first", hint: "API + Web only — add mobile later" },
                { value: "mobile", label: "Mobile first", hint: "API + Mobile (Android & iOS) only — add web later" },
              ] as const
            ).map((opt) => (
              <label key={opt.value} className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="platformTarget"
                  value={opt.value}
                  checked={props.platformTarget === opt.value}
                  onChange={() => props.setPlatformTarget(opt.value)}
                  disabled={props.disabled}
                  className="mt-1"
                />
                <span>
                  <span className="font-medium">{opt.label}</span>
                  <span className="text-xs text-muted-foreground ml-2">{opt.hint}</span>
                </span>
              </label>
            ))}
          </CardContent>
        </Card>
      )}
      <ToggleCard
        title={t("forge.form.verifySection")}
        label={t("forge.form.verifyLabel")}
        hint={t("forge.form.verifyHint")}
        note={t("forge.form.verifyDefault")}
        checked={props.verifyBuilds}
        onChange={props.setVerifyBuilds}
        disabled={props.disabled}
      />
      {props.implementFeatures && (
        <ToggleCard
          title={t("forge.form.qaTestSection")}
          label={t("forge.form.qaTestLabel")}
          hint={t("forge.form.qaTestHint")}
          note={t("forge.form.qaTestDefault")}
          checked={props.qaTest}
          onChange={props.setQaTest}
          disabled={props.disabled}
        />
      )}
    </>
  );
}

interface ToggleCardProps {
  title: string;
  label: string;
  hint: string;
  note: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled: boolean;
}

function ToggleCard(props: ToggleCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{props.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={props.checked}
            onChange={(e) => props.onChange(e.currentTarget.checked)}
            disabled={props.disabled}
            className="mt-1"
          />
          <span className="font-medium">{props.label}</span>
        </label>
        <p className="text-xs text-muted-foreground pl-6">{props.hint}</p>
        <p className="text-xs text-muted-foreground pl-6">{props.note}</p>
      </CardContent>
    </Card>
  );
}

/**
 * The recommended defaults for the four phase toggles. Importable from
 * both forms so they stay in sync with the backend schema defaults in
 * `web/src/lib/forge/schemas.ts:createSessionRequestSchema`.
 */
export const PHASE_TOGGLE_DEFAULTS = {
  planReview: false,
  seedDemo: false,
  implementFeatures: true,
  verifyBuilds: true,
  platformTarget: "all" as PlatformTarget,
  qaTest: false,
};
