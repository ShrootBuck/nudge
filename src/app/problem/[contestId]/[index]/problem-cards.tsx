"use client";

import { type ComponentType, useId, useState } from "react";
import { CodeBlock } from "@/components/code-block";
import { parseSolutionContent } from "@/lib/problem-solution";
import { cn } from "@/lib/utils";
import { ProblemMarkdown } from "./problem-markdown";
import { HINT_LABELS, type ProblemView } from "./problem-view-types";

export function AnimatedCollapse({
  open,
  id,
  children,
}: {
  open: boolean;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      id={id}
      className={cn(
        "grid overflow-hidden transition-all duration-300 ease-out",
        open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
      )}
    >
      <div className="min-h-0 min-w-0 overflow-hidden">{children}</div>
    </div>
  );
}

export function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className={`text-muted-foreground/60 transition-transform duration-300 ease-out ${open ? "rotate-180" : ""}`}
    >
      <path
        d="M4 6L8 10L12 6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function HintCard({
  hint,
  index,
}: {
  hint: ProblemView["hints"][0];
  index: number;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <div
      className={cn(
        "overflow-hidden rounded-[1.15rem] border bg-card/75 shadow-sm transition duration-200 sm:rounded-[1.4rem]",
        open
          ? "border-foreground/15"
          : "border-border/60 hover:border-foreground/10",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3.5 text-left sm:gap-4 sm:px-6 sm:py-4"
      >
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-background/80 font-mono text-sm font-semibold shadow-sm sm:size-10 sm:rounded-2xl">
            {hint.order}
          </span>

          <div className="min-w-0">
            <p className="text-base font-semibold tracking-tight">
              {HINT_LABELS[index] ?? `Hint ${hint.order}`}
            </p>
          </div>
        </div>

        <ChevronIcon open={open} />
      </button>

      <AnimatedCollapse open={open} id={panelId}>
        <div className="min-w-0 border-t border-border/60 px-4 pb-4 pt-4 sm:px-6 sm:pb-5">
          <ProblemMarkdown content={hint.content} />
        </div>
      </AnimatedCollapse>
    </div>
  );
}

export function SolutionCode({
  code,
  downloadFileName,
  preHighlightedHtml,
}: {
  code: string;
  downloadFileName: string;
  preHighlightedHtml?: { light: string; dark: string } | null;
}) {
  const parsedSolution = parseSolutionContent(code);

  if (parsedSolution.kind === "markdown") {
    return <ProblemMarkdown content={parsedSolution.content} />;
  }

  return (
    <CodeBlock
      code={parsedSolution.code}
      language={parsedSolution.language}
      showActions
      downloadFileName={downloadFileName}
      preHighlightedHtml={preHighlightedHtml ?? undefined}
    />
  );
}

export function SectionIntro({
  eyebrow,
  title,
  description,
  icon: Icon,
}: {
  eyebrow: string;
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <div className="mb-4 flex min-w-0 items-start gap-3 sm:mb-5 sm:gap-4">
      <div className="rounded-xl border border-border/60 bg-background/80 p-2.5 text-muted-foreground shadow-sm sm:rounded-2xl sm:p-3">
        <Icon className="size-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold tracking-[0.24em] text-muted-foreground uppercase">
          {eyebrow}
        </p>
        <h2 className="mt-2 text-xl font-semibold tracking-tight">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

export function CollapsibleSection({
  open,
  onToggle,
  eyebrow,
  title,
  description,
  icon: Icon,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  eyebrow: string;
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  const panelId = useId();

  return (
    <section
      className={cn(
        "overflow-hidden rounded-[1.25rem] border bg-card/75 shadow-[0_18px_50px_-36px_rgba(15,23,42,0.45)] transition duration-200 sm:rounded-[1.75rem]",
        open ? "border-foreground/15" : "border-border/70",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full cursor-pointer items-center justify-between gap-3 p-4 text-left sm:gap-4 sm:p-6"
      >
        <div className="flex min-w-0 items-start gap-3 sm:gap-4">
          <div className="rounded-xl border border-border/60 bg-background/80 p-2.5 text-muted-foreground shadow-sm sm:rounded-2xl sm:p-3">
            <Icon className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-[0.24em] text-muted-foreground uppercase">
              {eyebrow}
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight">
              {title}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
        <ChevronIcon open={open} />
      </button>

      <AnimatedCollapse open={open} id={panelId}>
        <div className="min-w-0 border-t border-border/60 px-4 pb-4 pt-4 sm:px-6 sm:pb-5">
          {children}
        </div>
      </AnimatedCollapse>
    </section>
  );
}
