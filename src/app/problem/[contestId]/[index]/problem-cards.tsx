"use client";

import { type ComponentType, useState } from "react";
import { CodeBlock } from "@/components/code-block";
import { parseSolutionContent } from "@/lib/problem-solution";
import { cn } from "@/lib/utils";
import { ProblemMarkdown } from "./problem-markdown";
import { HINT_LABELS, type ProblemView } from "./problem-view-types";

export function AnimatedCollapse({
  open,
  children,
}: {
  open: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid overflow-hidden transition-all duration-300 ease-out",
        open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
      )}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
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

  return (
    <div
      className={cn(
        "overflow-hidden rounded-[1.4rem] border bg-card/75 shadow-sm transition duration-200",
        open
          ? "border-foreground/15"
          : "border-border/60 hover:border-foreground/10",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full cursor-pointer items-center justify-between gap-4 px-5 py-4 text-left sm:px-6"
      >
        <div className="flex min-w-0 items-center gap-4">
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-background/80 font-mono text-sm font-semibold shadow-sm">
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

      <AnimatedCollapse open={open}>
        <div className="border-t border-border/60 px-5 pb-5 pt-4 sm:px-6">
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
    <div className="mb-5 flex items-start gap-4">
      <div className="rounded-2xl border border-border/60 bg-background/80 p-3 text-muted-foreground shadow-sm">
        <Icon className="size-5" />
      </div>
      <div>
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
  return (
    <section
      className={cn(
        "overflow-hidden rounded-[1.75rem] border bg-card/75 shadow-[0_18px_50px_-36px_rgba(15,23,42,0.45)] transition duration-200",
        open ? "border-foreground/15" : "border-border/70",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full cursor-pointer items-center justify-between gap-4 p-5 text-left sm:p-6"
      >
        <div className="flex items-start gap-4">
          <div className="rounded-2xl border border-border/60 bg-background/80 p-3 text-muted-foreground shadow-sm">
            <Icon className="size-5" />
          </div>
          <div>
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

      <AnimatedCollapse open={open}>
        <div className="border-t border-border/60 px-5 pb-5 pt-4 sm:px-6">
          {children}
        </div>
      </AnimatedCollapse>
    </section>
  );
}
