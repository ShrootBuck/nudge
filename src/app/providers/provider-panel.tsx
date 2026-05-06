"use client";

import {
  Check,
  ChevronDown,
  CircleDot,
  LoaderCircle,
  Plus,
  Power,
} from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getEffortOptions } from "@/lib/ai/effort";
import { cn } from "@/lib/utils";
import { addModelConfig, type ProviderModel, setActiveModel } from "./actions";

const PROVIDER_OPTIONS = ["anthropic", "moonshot", "openai", "xai"] as const;

function getEffortLabel(
  effort: string | null | undefined,
  provider?: string,
): string {
  if (!effort) return "default";
  if (provider === "moonshot") {
    if (effort === "enabled") return "reasoning";
    if (effort === "disabled") return "non-reasoning";
  }
  return effort;
}

type Feedback =
  | { kind: "error"; message: string }
  | { kind: "success"; message: string }
  | null;

export function ProviderPanel({ initial }: { initial: ProviderModel[] }) {
  const [configs, setConfigs] = useState(initial);
  const [password, setPassword] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);

  function showSuccess(message: string) {
    setFeedback({ kind: "success", message });
  }

  function showError(message: string) {
    setFeedback({ kind: "error", message });
  }

  return (
    <div className="space-y-6">
      <div className="rounded-[1.75rem] border border-border/70 bg-card/75 p-5 shadow-sm backdrop-blur sm:p-6">
        <label
          htmlFor="provider-password"
          className="mb-2 block text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase"
        >
          Admin password
        </label>
        <Input
          id="provider-password"
          type="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (feedback?.kind === "error") {
              setFeedback(null);
            }
          }}
          placeholder="Enter password to make changes"
          className="h-10 max-w-sm rounded-xl border-border/50 bg-background/65 px-4 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] placeholder:text-muted-foreground/70 focus-visible:border-foreground/15 focus-visible:ring-0 focus-visible:outline-none"
        />
      </div>

      {feedback && (
        <p
          role={feedback.kind === "error" ? "alert" : "status"}
          className={cn(
            "rounded-xl px-4 py-2.5 text-sm",
            feedback.kind === "error"
              ? "border border-rose-500/20 bg-rose-500/10 text-rose-200"
              : "border border-emerald-500/20 bg-emerald-500/10 text-emerald-200",
          )}
        >
          {feedback.message}
        </p>
      )}

      <div className="rounded-[1.75rem] border border-border/60 bg-card/50 p-4 backdrop-blur">
        <p className="text-xs text-muted-foreground">
          Adding a config with the same provider and model ID will overwrite the
          existing one — no need to delete. Configurations are never truly
          deleted to preserve display names on existing problems.
        </p>
      </div>

      <div className="space-y-3">
        {configs.map((cfg) => (
          <ConfigCard
            key={cfg.id}
            config={cfg}
            password={password}
            onError={showError}
            onActivated={(id) => {
              setConfigs((prev) =>
                prev.map((c) => ({ ...c, isActive: c.id === id })),
              );
              showSuccess("Active model updated");
            }}
          />
        ))}

        {configs.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No model configurations yet. Add one below.
          </p>
        )}
      </div>

      <AddConfigForm
        password={password}
        onError={showError}
        onAdded={(cfg, overwrote) => {
          if (overwrote) {
            setConfigs((prev) =>
              prev.map((c) =>
                c.provider === cfg.provider && c.modelId === cfg.modelId
                  ? cfg
                  : c,
              ),
            );
            showSuccess("Configuration updated");
          } else {
            setConfigs((prev) => [...prev, cfg]);
            showSuccess("Configuration added");
          }
        }}
      />
    </div>
  );
}

function ConfigCard({
  config,
  password,
  onError,
  onActivated,
}: {
  config: ProviderModel;
  password: string;
  onError: (msg: string) => void;
  onActivated: (id: string) => void;
}) {
  const [isPending, startTransition] = useTransition();

  function handleActivate() {
    if (!password) {
      onError("Enter the admin password first");
      return;
    }
    startTransition(() => {
      void (async () => {
        try {
          const result = await setActiveModel(password, config.id);
          if (result.success) {
            onActivated(config.id);
          } else {
            onError(result.error);
          }
        } catch {
          onError("Failed to activate the model");
        }
      })();
    });
  }

  return (
    <div
      className={cn(
        "relative rounded-[1.75rem] border bg-card/75 p-5 shadow-sm backdrop-blur transition sm:p-6",
        config.isActive
          ? "border-emerald-500/30 ring-1 ring-emerald-500/10"
          : "border-border/60",
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3.5">
          <span
            className={cn(
              "mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-2xl border shadow-sm",
              config.isActive
                ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-400"
                : "border-border/70 bg-background/80 text-muted-foreground",
            )}
          >
            {config.isActive ? (
              <Check className="size-4" />
            ) : (
              <CircleDot className="size-4" />
            )}
          </span>

          <div className="min-w-0">
            <p className="text-base font-semibold tracking-tight">
              {config.displayName}
            </p>
            <p className="mt-0.5 font-mono text-xs text-muted-foreground">
              {config.provider}/{config.modelId}
            </p>
            {config.effort && (
              <p className="mt-1 font-mono text-[10px] text-muted-foreground/70">
                effort: {getEffortLabel(config.effort, config.provider)}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {config.isActive ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-300">
              <Power className="size-3" />
              Active
            </span>
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled={isPending || !password}
              onClick={handleActivate}
              className="h-9 rounded-xl border-emerald-500/20 bg-emerald-500/10 px-3.5 text-xs text-emerald-200 shadow-sm hover:bg-emerald-500/15 hover:text-emerald-100 disabled:border-emerald-500/10 disabled:bg-emerald-500/10 disabled:text-emerald-200/55"
            >
              {isPending ? (
                <LoaderCircle className="mr-1.5 size-3 animate-spin" />
              ) : null}
              Make active
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function AddConfigForm({
  password,
  onError,
  onAdded,
}: {
  password: string;
  onError: (msg: string) => void;
  onAdded: (cfg: ProviderModel, overwrote: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState<string>("anthropic");
  const [modelId, setModelId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [effort, setEffort] = useState(
    getEffortOptions("anthropic")?.[0] ?? "",
  );
  const [isPending, startTransition] = useTransition();

  const effortOptions = getEffortOptions(provider);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!password) {
      onError("Enter the admin password first");
      return;
    }

    startTransition(() => {
      void (async () => {
        try {
          const result = await addModelConfig(password, {
            provider,
            modelId,
            displayName,
            effort,
          });

          if (result.success) {
            onAdded(
              {
                id: result.id,
                provider: provider.trim().toLowerCase(),
                modelId: modelId.trim(),
                displayName: displayName.trim(),
                isActive: result.isActive,
                effort: effort || null,
              },
              result.overwrote,
            );
            setProvider("anthropic");
            setModelId("");
            setDisplayName("");
            setEffort(getEffortOptions("anthropic")?.[0] ?? "");
            setOpen(false);
          } else {
            onError(result.error);
          }
        } catch {
          onError("Failed to add the configuration");
        }
      })();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-[1.75rem] border border-dashed border-border/60 bg-card/40 py-4 text-sm text-muted-foreground transition hover:border-foreground/15 hover:text-foreground"
      >
        <Plus className="size-4" />
        Add model configuration
      </button>
    );
  }

  const inputClass =
    "h-10 w-full rounded-xl border-border/50 bg-background/65 px-4 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] placeholder:text-muted-foreground/70 focus-visible:border-foreground/15 focus-visible:ring-0 focus-visible:outline-none";

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-[1.75rem] border border-border/70 bg-card/75 p-5 shadow-sm backdrop-blur sm:p-6"
    >
      <p className="mb-4 text-sm font-semibold tracking-tight">
        New model configuration
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="new-provider"
            className="mb-1.5 block text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase"
          >
            Provider
          </label>
          <div className="relative">
            <select
              id="new-provider"
              value={provider}
              onChange={(e) => {
                setProvider(e.target.value);
                setEffort(getEffortOptions(e.target.value)?.[0] ?? "");
              }}
              className={`${inputClass} appearance-none pr-10`}
            >
              {PROVIDER_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          </div>
        </div>

        <div>
          <label
            htmlFor="new-model-id"
            className="mb-1.5 block text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase"
          >
            Model ID
          </label>
          <Input
            id="new-model-id"
            value={modelId}
            onChange={(e) => setModelId(e.target.value)}
            placeholder="kimi-k2.6"
            className={inputClass}
          />
        </div>

        <div>
          <label
            htmlFor="new-display-name"
            className="mb-1.5 block text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase"
          >
            Display name
          </label>
          <Input
            id="new-display-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Kimi K2.6"
            className={inputClass}
          />
        </div>
        {effortOptions && (
          <div>
            <label
              htmlFor="new-effort"
              className="mb-1.5 block text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase"
            >
              Effort
            </label>
            <div className="relative">
              <select
                id="new-effort"
                value={effort}
                onChange={(e) => setEffort(e.target.value)}
                className={`${inputClass} appearance-none pr-10`}
              >
                {effortOptions.map((option) => (
                  <option key={option} value={option}>
                    {getEffortLabel(option, provider)}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            </div>
          </div>
        )}
      </div>

      <div className="mt-5 flex items-center gap-2">
        <Button
          type="submit"
          size="sm"
          variant="outline"
          disabled={
            isPending ||
            !password ||
            !provider ||
            !modelId ||
            !displayName ||
            !effort
          }
          className="h-9 rounded-xl border-border/60 bg-background/55 px-4 text-xs shadow-sm hover:bg-background/75 disabled:bg-background/40"
        >
          {isPending ? (
            <LoaderCircle className="mr-1.5 size-3 animate-spin" />
          ) : (
            <Plus className="mr-1.5 size-3" />
          )}
          Add
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setOpen(false)}
          className="h-9 rounded-xl border-border/60 bg-background/55 px-4 text-xs shadow-sm hover:bg-background/75"
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
