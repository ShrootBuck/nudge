"use client";

import {
  Check,
  ChevronDown,
  CircleDot,
  LoaderCircle,
  Plus,
  Power,
  Trash2,
} from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  addModelConfig,
  deleteModelConfig,
  type ProviderModel,
  setActiveModel,
} from "./actions";

const PROVIDER_OPTIONS = ["anthropic", "openai"] as const;

export function ProviderPanel({ initial }: { initial: ProviderModel[] }) {
  const [configs, setConfigs] = useState(initial);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function flash(msg: string) {
    setSuccess(msg);
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
            setError(null);
          }}
          placeholder="Enter password to make changes"
          className="h-10 max-w-sm rounded-xl border-border/50 bg-background/65 px-4 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] placeholder:text-muted-foreground/70 focus-visible:border-foreground/15 focus-visible:ring-0 focus-visible:outline-none"
        />
      </div>

      {error && (
        <p className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-200">
          {error}
        </p>
      )}
      {success && (
        <p className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-200">
          {success}
        </p>
      )}

      <div className="space-y-3">
        {configs.map((cfg) => (
          <ConfigCard
            key={cfg.id}
            config={cfg}
            password={password}
            onError={setError}
            onActivated={(id) => {
              setConfigs((prev) =>
                prev.map((c) => ({ ...c, isActive: c.id === id })),
              );
              flash("Active model updated");
            }}
            onDeleted={(id) => {
              setConfigs((prev) => prev.filter((c) => c.id !== id));
              flash("Configuration deleted");
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
        onError={setError}
        onAdded={(cfg) => {
          setConfigs((prev) => [...prev, cfg]);
          flash("Configuration added");
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
  onDeleted,
}: {
  config: ProviderModel;
  password: string;
  onError: (msg: string) => void;
  onActivated: (id: string) => void;
  onDeleted: (id: string) => void;
}) {
  const [isPending, startTransition] = useTransition();

  function handleActivate() {
    if (!password) {
      onError("Enter the admin password first");
      return;
    }
    startTransition(() => {
      void (async () => {
        const result = await setActiveModel(password, config.id);
        if (result.success) {
          onActivated(config.id);
        } else {
          onError(result.error);
        }
      })();
    });
  }

  function handleDelete() {
    if (!password) {
      onError("Enter the admin password first");
      return;
    }
    startTransition(() => {
      void (async () => {
        const result = await deleteModelConfig(password, config.id);
        if (result.success) {
          onDeleted(config.id);
        } else {
          onError(result.error);
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
          </div>
        </div>

        <div className="flex items-center gap-2">
          {config.isActive ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-300">
              <Power className="size-3" />
              Active
            </span>
          ) : (
            <>
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
              <Button
                size="sm"
                variant="outline"
                disabled={isPending || !password}
                onClick={handleDelete}
                className="h-9 rounded-xl border-rose-500/20 bg-rose-500/10 px-3 text-xs text-rose-200 shadow-sm hover:bg-rose-500/15 hover:text-rose-100 disabled:border-rose-500/10 disabled:bg-rose-500/10 disabled:text-rose-200/55"
              >
                <Trash2 className="size-3" />
              </Button>
            </>
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
  onAdded: (cfg: ProviderModel) => void;
}) {
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState<string>("anthropic");
  const [modelId, setModelId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!password) {
      onError("Enter the admin password first");
      return;
    }

    startTransition(() => {
      void (async () => {
        const result = await addModelConfig(password, {
          provider,
          modelId,
          displayName,
        });

        if (result.success) {
          onAdded({
            id: result.id,
            provider: provider.trim().toLowerCase(),
            modelId: modelId.trim(),
            displayName: displayName.trim(),
            isActive: result.isActive,
          });
          setProvider("anthropic");
          setModelId("");
          setDisplayName("");
          setOpen(false);
        } else {
          onError(result.error);
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
            placeholder="claude-opus-4-6"
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
            placeholder="Claude Opus 4.6"
            className={inputClass}
          />
        </div>
      </div>

      <div className="mt-5 flex items-center gap-2">
        <Button
          type="submit"
          size="sm"
          variant="outline"
          disabled={
            isPending || !password || !provider || !modelId || !displayName
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
