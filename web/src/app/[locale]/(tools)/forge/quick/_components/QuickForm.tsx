"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  PhaseToggles,
  PHASE_TOGGLE_DEFAULTS,
} from "../../_components/PhaseToggles";
import {
  DesignReferenceInputs,
  filesToBase64Payload,
  parseUrls,
  MAX_IMAGE_BYTES,
  MAX_IMAGES,
} from "@/components/forge/design-reference-inputs";

const MAX_TOTAL_IMAGE_BYTES = 30 * 1024 * 1024;

interface Question {
  id: string;
  label: string;
  hint?: string;
  multiline?: boolean;
}

interface AnsweredQA {
  question: string;
  answer: string;
}

interface ProposedFields {
  productName: string;
  tagline: string;
  description: string;
  targetUser: string;
  features: Array<{ name: string; description: string }>;
  slug: string;
  namespace: string;
  displayName: string;
}

type ExtractResult =
  | { status: "ready"; fields: ProposedFields }
  | { status: "needs_info"; rationale: string; questions: Question[] };

export function QuickForm() {
  const t = useTranslations("common");
  const router = useRouter();

  const [prompt, setPrompt] = useState("");
  const [brandEnabled, setBrandEnabled] = useState(false);
  const [brandL, setBrandL] = useState(0.55);
  const [brandC, setBrandC] = useState(0.2);
  const [brandH, setBrandH] = useState(250);

  const [planReview, setPlanReview] = useState<boolean>(
    PHASE_TOGGLE_DEFAULTS.planReview,
  );
  const [seedDemo, setSeedDemo] = useState<boolean>(
    PHASE_TOGGLE_DEFAULTS.seedDemo,
  );
  const [implementFeatures, setImplementFeatures] = useState<boolean>(
    PHASE_TOGGLE_DEFAULTS.implementFeatures,
  );
  const [verifyBuilds, setVerifyBuilds] = useState<boolean>(
    PHASE_TOGGLE_DEFAULTS.verifyBuilds,
  );
  const [platformTarget, setPlatformTarget] = useState<"web" | "mobile" | "all">(
    PHASE_TOGGLE_DEFAULTS.platformTarget,
  );
  const [qaTest, setQaTest] = useState<boolean>(
    PHASE_TOGGLE_DEFAULTS.qaTest,
  );

  const [answers, setAnswers] = useState<AnsweredQA[]>([]);
  const [pendingQuestions, setPendingQuestions] = useState<Question[] | null>(null);
  const [pendingAnswers, setPendingAnswers] = useState<Record<string, string>>({});
  const [rationale, setRationale] = useState<string | null>(null);

  const [designFiles, setDesignFiles] = useState<File[]>([]);
  const [designUrls, setDesignUrls] = useState("");
  const [designPrompt, setDesignPrompt] = useState("");

  const [busyStage, setBusyStage] = useState<null | "extracting" | "submitting">(null);
  const [error, setError] = useState<string | null>(null);
  const [proposed, setProposed] = useState<ProposedFields | null>(null);

  const brandColor = brandEnabled ? { L: brandL, C: brandC, h: brandH } : undefined;

  async function callExtract(accumulated: AnsweredQA[]): Promise<void> {
    setBusyStage("extracting");
    setError(null);
    try {
      const res = await fetch("/api/v1/forge/ideate/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          answers: accumulated,
          brandColor,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
      }
      const { data } = (await res.json()) as { data: ExtractResult };

      if (data.status === "needs_info") {
        setPendingQuestions(data.questions);
        setPendingAnswers({});
        setRationale(data.rationale);
        setProposed(null);
      } else {
        setPendingQuestions(null);
        setRationale(null);
        setProposed(data.fields);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "extract failed");
    } finally {
      setBusyStage(null);
    }
  }

  async function submitToSessions(fields: ProposedFields): Promise<void> {
    setBusyStage("submitting");
    setError(null);
    try {
      if (designFiles.some((f) => f.size > MAX_IMAGE_BYTES)) {
        throw new Error(t("forge.design.form.validation.tooLarge"));
      }
      const totalDesignBytes = designFiles.reduce((sum, f) => sum + f.size, 0);
      if (totalDesignBytes > MAX_TOTAL_IMAGE_BYTES) {
        throw new Error(t("forge.design.form.validation.totalTooLarge"));
      }
      if (designFiles.length > MAX_IMAGES) {
        throw new Error(t("forge.design.form.validation.tooManyImages"));
      }

      const parsedDesignUrls = parseUrls(designUrls);
      if (parsedDesignUrls === null) {
        throw new Error(t("forge.design.form.validation.invalidUrl"));
      }

      const hasDesignReferences =
        designFiles.length > 0 ||
        parsedDesignUrls.length > 0 ||
        designPrompt.trim().length > 0;

      const designStudyInputs = hasDesignReferences
        ? {
            images: await filesToBase64Payload(designFiles),
            urls: parsedDesignUrls,
            prompt: designPrompt.trim(),
          }
        : undefined;

      const res = await fetch("/api/v1/forge/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...fields,
          brandColor,
          planReview,
          seedDemo,
          implementFeatures,
          verifyBuilds,
          platformTarget,
          qaTest,
          designStudyInputs,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
      }
      const { data } = (await res.json()) as { data: { sessionId: string } };
      router.push(`/forge/sessions/${data.sessionId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "session create failed");
      setBusyStage(null);
    }
  }

  function handlePromptSubmit(e: FormEvent) {
    e.preventDefault();
    if (!prompt.trim() || busyStage) return;
    setAnswers([]);
    void callExtract([]);
  }

  function handleAnswersSubmit(e: FormEvent) {
    e.preventDefault();
    if (!pendingQuestions || busyStage) return;
    const newAnswers: AnsweredQA[] = pendingQuestions
      .filter((q) => (pendingAnswers[q.id] ?? "").trim().length > 0)
      .map((q) => ({
        question: q.label,
        answer: pendingAnswers[q.id].trim(),
      }));
    if (newAnswers.length === 0) return;
    const combined = [...answers, ...newAnswers];
    setAnswers(combined);
    void callExtract(combined);
  }

  function handleConfirmProposed() {
    if (!proposed) return;
    void submitToSessions(proposed);
  }

  function handleStartOver() {
    setPrompt("");
    setAnswers([]);
    setPendingQuestions(null);
    setPendingAnswers({});
    setRationale(null);
    setProposed(null);
    setError(null);
  }

  const showInitialForm = pendingQuestions === null && proposed === null;

  const phaseToggles = (
    <PhaseToggles
      planReview={planReview}
      setPlanReview={setPlanReview}
      seedDemo={seedDemo}
      setSeedDemo={setSeedDemo}
      implementFeatures={implementFeatures}
      setImplementFeatures={setImplementFeatures}
      verifyBuilds={verifyBuilds}
      setVerifyBuilds={setVerifyBuilds}
      platformTarget={platformTarget}
      setPlatformTarget={setPlatformTarget}
      qaTest={qaTest}
      setQaTest={setQaTest}
      disabled={busyStage !== null}
    />
  );

  return (
    <div className="space-y-6">
      {showInitialForm && (
        <form onSubmit={handlePromptSubmit} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("forge.quick.promptCardTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="quick-prompt" className="text-sm font-medium">
                  {t("forge.quick.promptLabel")}
                </label>
                <textarea
                  id="quick-prompt"
                  value={prompt}
                  onChange={(e) => setPrompt(e.currentTarget.value)}
                  placeholder={t("forge.quick.promptPlaceholder")}
                  className="w-full min-h-[24rem] rounded-md border border-input bg-background px-3 py-2 font-mono text-sm"
                  maxLength={50000}
                  disabled={busyStage !== null}
                />
                <p className="text-xs text-muted-foreground">
                  {t("forge.quick.promptHint")}
                </p>
              </div>

              <BrandColorPicker
                enabled={brandEnabled}
                setEnabled={setBrandEnabled}
                L={brandL}
                setL={setBrandL}
                C={brandC}
                setC={setBrandC}
                h={brandH}
                setH={setBrandH}
                disabled={busyStage !== null}
                labels={{
                  enable: t("forge.form.brandEnable"),
                  section: t("forge.form.brandSection"),
                }}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("forge.form.designReferencesSection")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {t("forge.form.designReferencesHint")}
              </p>
              <DesignReferenceInputs
                files={designFiles}
                urls={designUrls}
                prompt={designPrompt}
                onFilesChange={setDesignFiles}
                onUrlsChange={setDesignUrls}
                onPromptChange={setDesignPrompt}
                disabled={busyStage !== null}
              />
            </CardContent>
          </Card>

          {phaseToggles}

          <div className="flex items-center justify-end">
            <Button
              type="submit"
              size="lg"
              disabled={!prompt.trim() || busyStage !== null}
            >
              {busyStage === "extracting"
                ? t("forge.quick.submitting")
                : t("forge.quick.submit")}
            </Button>
          </div>
        </form>
      )}

      {pendingQuestions && (
        <Card>
          <CardHeader>
            <CardTitle>{t("forge.quick.questionsCardTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            {rationale && (
              <p className="text-sm text-muted-foreground mb-4">{rationale}</p>
            )}
            <form onSubmit={handleAnswersSubmit} className="space-y-4">
              {pendingQuestions.map((q) => (
                <div key={q.id} className="space-y-1.5">
                  <label htmlFor={`q-${q.id}`} className="text-sm font-medium">
                    {q.label}
                  </label>
                  {q.multiline ? (
                    <textarea
                      id={`q-${q.id}`}
                      value={pendingAnswers[q.id] ?? ""}
                      onChange={(e) =>
                        setPendingAnswers((prev) => ({
                          ...prev,
                          [q.id]: e.currentTarget.value,
                        }))
                      }
                      placeholder={q.hint}
                      className="w-full min-h-[4rem] rounded-md border border-input bg-background px-3 py-2 text-sm"
                      maxLength={1000}
                      disabled={busyStage !== null}
                    />
                  ) : (
                    <Input
                      id={`q-${q.id}`}
                      value={pendingAnswers[q.id] ?? ""}
                      onChange={(e) =>
                        setPendingAnswers((prev) => ({
                          ...prev,
                          [q.id]: e.currentTarget.value,
                        }))
                      }
                      placeholder={q.hint}
                      maxLength={1000}
                      disabled={busyStage !== null}
                    />
                  )}
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={busyStage !== null}>
                  {busyStage === "extracting"
                    ? t("forge.quick.submitting")
                    : t("forge.quick.continue")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleStartOver}
                  disabled={busyStage !== null}
                >
                  {t("forge.quick.startOver")}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {proposed && (
        <Card>
          <CardHeader>
            <CardTitle>{t("forge.quick.proposedCardTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <p className="text-muted-foreground">
              {t("forge.quick.proposedBody")}
            </p>
            <dl className="grid gap-2 sm:grid-cols-[max-content,1fr] sm:gap-x-4">
              <dt className="text-muted-foreground">Product name</dt>
              <dd>{proposed.productName}</dd>
              <dt className="text-muted-foreground">Tagline</dt>
              <dd>{proposed.tagline}</dd>
              <dt className="text-muted-foreground">Target user</dt>
              <dd>{proposed.targetUser}</dd>
              <dt className="text-muted-foreground">Slug</dt>
              <dd className="font-mono">{proposed.slug}</dd>
              <dt className="text-muted-foreground">Namespace</dt>
              <dd className="font-mono">{proposed.namespace}</dd>
              <dt className="text-muted-foreground">Display name</dt>
              <dd>{proposed.displayName}</dd>
            </dl>
            <div className="space-y-1">
              <p className="text-muted-foreground">Description</p>
              <p className="whitespace-pre-wrap">{proposed.description}</p>
            </div>
            <div className="space-y-1">
              <p className="text-muted-foreground">Features</p>
              {Array.isArray(proposed.features) ? (
                <ul className="list-disc pl-5 space-y-1">
                  {proposed.features.map((f, i) => (
                    <li key={i}>
                      <span className="font-medium">{f.name}</span> — {f.description}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-destructive text-xs font-mono">
                  (extractor returned malformed features — re-run the extract
                  or use the full form)
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                type="button"
                onClick={handleConfirmProposed}
                disabled={busyStage !== null}
              >
                {busyStage === "submitting"
                  ? t("forge.quick.bootstrapping")
                  : t("forge.quick.bootstrap")}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleStartOver}
                disabled={busyStage !== null}
              >
                {t("forge.quick.startOver")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {error && (
        <Card>
          <CardContent className="pt-4">
            <p className="text-destructive text-sm">{error}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

interface BrandPickerProps {
  enabled: boolean;
  setEnabled: (next: boolean) => void;
  L: number;
  setL: (next: number) => void;
  C: number;
  setC: (next: number) => void;
  h: number;
  setH: (next: number) => void;
  disabled: boolean;
  labels: { enable: string; section: string };
}

function BrandColorPicker(props: BrandPickerProps) {
  const swatchStyle = props.enabled
    ? { background: `oklch(${props.L} ${props.C} ${props.h})` }
    : { background: "var(--muted)" };

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{props.labels.section}</p>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={props.enabled}
          onChange={(e) => props.setEnabled(e.currentTarget.checked)}
          disabled={props.disabled}
        />
        {props.labels.enable}
      </label>
      {props.enabled && (
        <div className="flex items-center gap-3">
          <div
            className="h-10 w-10 rounded-md border"
            style={swatchStyle}
            aria-hidden
          />
          <div className="grid grid-cols-3 gap-2 flex-1 text-xs">
            <label className="space-y-1">
              <span className="text-muted-foreground">L</span>
              <Input
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={props.L}
                onChange={(e) => props.setL(Number(e.currentTarget.value))}
                disabled={props.disabled}
              />
            </label>
            <label className="space-y-1">
              <span className="text-muted-foreground">C</span>
              <Input
                type="number"
                min={0}
                max={0.4}
                step={0.01}
                value={props.C}
                onChange={(e) => props.setC(Number(e.currentTarget.value))}
                disabled={props.disabled}
              />
            </label>
            <label className="space-y-1">
              <span className="text-muted-foreground">h</span>
              <Input
                type="number"
                min={0}
                max={360}
                step={1}
                value={props.h}
                onChange={(e) => props.setH(Number(e.currentTarget.value))}
                disabled={props.disabled}
              />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
