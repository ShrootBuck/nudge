"use client";

import { Check, KeyRound, LoaderCircle, RadioTower } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { OpenRouterPreset } from "@/lib/ai/openrouter-presets";
import { cn } from "@/lib/utils";
import { type ProviderActionState, selectGenerationPreset } from "./actions";

type ProviderSwitcherProps = {
  presets: OpenRouterPreset[];
  activePresetSlug: string;
  activePresetLabel: string | null;
  configError: string | null;
};

export function ProviderSwitcher({
  presets,
  activePresetSlug,
  activePresetLabel,
  configError,
}: ProviderSwitcherProps) {
  const router = useRouter();
  const [selectedSlug, setSelectedSlug] = useState(activePresetSlug);
  const [state, formAction, pending] = useActionState<
    ProviderActionState | null,
    FormData
  >(selectGenerationPreset, null);

  useEffect(() => {
    setSelectedSlug(state?.activePresetSlug ?? activePresetSlug);
  }, [activePresetSlug, state?.activePresetSlug]);

  useEffect(() => {
    if (state?.success) {
      router.refresh();
    }
  }, [router, state?.success]);

  return (
    <div className="rounded-[1.75rem] border border-border/70 bg-card/75 p-6 shadow-[0_18px_50px_-36px_rgba(15,23,42,0.45)] backdrop-blur sm:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex size-9 items-center justify-center rounded-xl border border-border/70 bg-background/80 text-muted-foreground">
              <RadioTower className="size-4" />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                Provider preset
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Future generations use the selected OpenRouter preset.
              </p>
            </div>
          </div>
        </div>

        <Badge variant={configError ? "destructive" : "secondary"}>
          {configError
            ? "Config needs attention"
            : `Active: ${activePresetLabel ?? activePresetSlug}`}
        </Badge>
      </div>

      <form action={formAction} className="mt-8 flex flex-col gap-6">
        <fieldset className="flex flex-col gap-3">
          <legend className="text-sm font-medium text-foreground">
            OpenRouter presets
          </legend>

          <div className="grid gap-3">
            {presets.map((preset) => {
              const isSelected = selectedSlug === preset.slug;
              const isActive = activePresetSlug === preset.slug && !configError;

              return (
                <label
                  key={preset.slug}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-2xl border bg-background/55 p-4 transition",
                    isSelected
                      ? "border-foreground/20 shadow-sm"
                      : "border-border/60 hover:border-foreground/15",
                  )}
                >
                  <input
                    type="radio"
                    name="presetSlug"
                    value={preset.slug}
                    checked={isSelected}
                    onChange={() => setSelectedSlug(preset.slug)}
                    className="mt-1 size-4 accent-foreground"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{preset.label}</span>
                      {isActive ? (
                        <Badge variant="secondary">
                          <Check data-icon="inline-start" />
                          Active
                        </Badge>
                      ) : null}
                    </span>
                    <span className="mt-1 block text-sm text-muted-foreground">
                      {preset.description}
                    </span>
                    <code className="mt-2 inline-block rounded-md border border-border/60 bg-muted px-2 py-1 text-xs text-muted-foreground">
                      @preset/{preset.slug}
                    </code>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div>
            <label
              htmlFor="provider-password"
              className="mb-1.5 block text-sm font-medium text-foreground"
            >
              Admin password
            </label>
            <Input
              id="provider-password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="VERIFY_PASSWORD"
              required
            />
          </div>

          <Button type="submit" disabled={pending} className="h-9">
            {pending ? (
              <LoaderCircle data-icon="inline-start" className="animate-spin" />
            ) : (
              <KeyRound data-icon="inline-start" />
            )}
            {pending ? "Switching..." : "Switch preset"}
          </Button>
        </div>

        {configError ? (
          <p
            role="alert"
            className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            {configError}
          </p>
        ) : null}

        {state?.error ? (
          <p
            role="alert"
            className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            {state.error}
          </p>
        ) : null}

        {state?.message ? (
          <output
            aria-live="polite"
            className="rounded-xl border border-border/70 bg-muted px-4 py-3 text-sm text-foreground"
          >
            {state.message}
          </output>
        ) : null}
      </form>
    </div>
  );
}
