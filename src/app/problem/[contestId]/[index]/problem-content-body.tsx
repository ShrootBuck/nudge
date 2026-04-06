"use client";

import {
  ArrowLeft,
  ArrowUpRight,
  BookOpenText,
  Code2,
  Lightbulb,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { cfProblemUrl, cn } from "@/lib/utils";
import {
  ProblemFooterLinks,
  ProblemMetaRow,
  ReportSection,
  ReviewSection,
} from "./problem-actions-panel";
import {
  CollapsibleSection,
  HintCard,
  SectionIntro,
  SolutionCode,
} from "./problem-cards";
import { ProblemMarkdown } from "./problem-markdown";
import {
  generationState,
  type ProblemView,
  resolveProblemRunState,
  reviewState,
  solutionSectionDescription,
} from "./problem-view-types";

export function ProblemContentBody({ problem }: { problem: ProblemView }) {
  const [showEditorial, setShowEditorial] = useState(false);
  const [showSolution, setShowSolution] = useState(false);

  const cfUrl = cfProblemUrl(problem.contestId, problem.index);
  const resolvedRunState = resolveProblemRunState(problem);
  const hasContent = resolvedRunState === "SUCCEEDED";

  const state = generationState(resolvedRunState);
  const StateIcon = state.icon;

  const review = reviewState(problem.reviewStatus);
  const ReviewIcon = review.icon;

  return (
    <main className="min-h-screen pb-20">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <nav className="mb-6">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/75 px-4 py-2 text-sm text-muted-foreground shadow-sm transition hover:border-foreground/15 hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            All problems
          </Link>
        </nav>

        <section className="relative overflow-hidden rounded-[2rem] border border-border/70 bg-card/80 p-6 shadow-[0_28px_70px_-40px_rgba(15,23,42,0.45)] backdrop-blur sm:p-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.12),transparent_30%),radial-gradient(circle_at_90%_18%,rgba(245,158,11,0.14),transparent_28%)]" />

          <div className="relative">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)] lg:gap-8 xl:grid-cols-[minmax(0,1fr)_24rem]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <ProblemMetaRow problem={problem} hasContent={hasContent} />

                  {!hasContent && (
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium ${state.className}`}
                    >
                      <StateIcon
                        className={cn(
                          "size-3.5",
                          state.animate && "animate-spin",
                        )}
                      />
                      {state.label}
                    </span>
                  )}
                </div>

                <h1 className="mt-5 max-w-3xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
                  {problem.name}
                </h1>

                <p className="mt-4 max-w-2xl text-sm/7 text-muted-foreground sm:text-base/8">
                  Progressive hints first, then the full explanation and
                  implementation when you&apos;re ready to cash out.
                </p>

                {problem.tags.length > 0 && (
                  <div className="mt-6 flex flex-wrap gap-2">
                    {problem.tags.map((tag) => (
                      <Link
                        key={tag}
                        href={`/?tag=${encodeURIComponent(tag)}`}
                        className="inline-flex items-center rounded-full border border-border/60 bg-background/70 px-3 py-1.5 text-xs text-muted-foreground transition hover:border-foreground/15 hover:text-foreground"
                      >
                        {tag}
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-3 lg:pt-1">
                <a
                  href={cfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-foreground/10 bg-foreground px-4 py-2.5 text-sm font-medium text-background shadow-sm transition hover:bg-foreground/90"
                >
                  Original problem
                  <ArrowUpRight className="size-4" />
                </a>

                <div
                  className={`rounded-[1.25rem] border px-4 py-4 text-sm shadow-sm ${review.panelClassName}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="rounded-xl border border-current/15 bg-background/60 p-2">
                      <ReviewIcon className="size-4" />
                    </div>
                    <div>
                      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] opacity-65">
                        Review status
                      </p>
                      <p className="mt-2 text-sm/6 opacity-90">
                        {review.summary}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {!hasContent && (
          <section
            className={`mt-8 rounded-[1.75rem] border px-6 py-8 shadow-[0_18px_50px_-36px_rgba(15,23,42,0.45)] ${state.className}`}
          >
            <div className="flex items-start gap-4">
              <div className="rounded-2xl border border-current/15 bg-background/60 p-3">
                <StateIcon
                  className={cn("size-5", state.animate && "animate-spin")}
                />
              </div>
              <div>
                <h2 className="text-lg font-semibold tracking-tight">
                  {state.label}
                </h2>
                <p className="mt-1 max-w-2xl text-sm/7 opacity-80">
                  {state.description}
                </p>
              </div>
            </div>
          </section>
        )}

        {hasContent && problem.reviewStatus === "SOLUTION_INCORRECT" && (
          <section
            className={`mt-8 rounded-[1.75rem] border px-6 py-6 shadow-[0_18px_50px_-36px_rgba(15,23,42,0.45)] ${review.panelClassName}`}
          >
            <div className="flex items-start gap-4">
              <div className="rounded-2xl border border-current/15 bg-background/60 p-3">
                <ReviewIcon className="size-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold tracking-tight">
                  The current solution is marked incorrect
                </h2>
                <p className="mt-1 max-w-2xl text-sm/7 opacity-90">
                  Someone reviewed this output and the generated solution did
                  not pass. Use the hints, editorial, and code cautiously until
                  the content is regenerated or fixed.
                </p>
              </div>
            </div>
          </section>
        )}

        {problem.reviewStatus === "UNSOLVABLE" && (
          <section
            className={`mt-8 rounded-[1.75rem] border px-6 py-6 shadow-[0_18px_50px_-36px_rgba(15,23,42,0.45)] ${review.panelClassName}`}
          >
            <div className="flex items-start gap-4">
              <div className="rounded-2xl border border-current/15 bg-background/60 p-3">
                <ReviewIcon className="size-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold tracking-tight">
                  This problem is currently unsolvable by AI
                </h2>
                <p className="mt-1 max-w-2xl text-sm/7 opacity-90">
                  The model may generate a plausible-looking solution, but it
                  does not reliably pass. Treat all generated content with extra
                  skepticism.
                </p>
              </div>
            </div>
          </section>
        )}

        {hasContent && (
          <div className="mt-8 space-y-8">
            {problem.hints.length > 0 && (
              <section className="rounded-[1.75rem] border border-border/70 bg-card/75 p-5 shadow-[0_18px_50px_-36px_rgba(15,23,42,0.45)] sm:p-6">
                <SectionIntro
                  eyebrow="Hints"
                  title="Progressive nudges"
                  description="Open only as much as you need to keep the solve alive."
                  icon={Lightbulb}
                />

                <div className="space-y-3">
                  {problem.hints.map((hint, i) => (
                    <HintCard key={hint.id} hint={hint} index={i} />
                  ))}
                </div>
              </section>
            )}

            {problem.editorial && (
              <CollapsibleSection
                open={showEditorial}
                onToggle={() => setShowEditorial(!showEditorial)}
                eyebrow="Editorial"
                title="Full explanation"
                description="Open this when you want the whole argument, complexity included."
                icon={BookOpenText}
              >
                <ProblemMarkdown content={problem.editorial.content} />
              </CollapsibleSection>
            )}

            {problem.solution && (
              <CollapsibleSection
                open={showSolution}
                onToggle={() => setShowSolution(!showSolution)}
                eyebrow="Solution"
                title="Generated C++"
                description={solutionSectionDescription(problem.reviewStatus)}
                icon={Code2}
              >
                <SolutionCode
                  code={problem.solution.content}
                  downloadFileName={`codeforces-${problem.contestId}-${problem.index}.cpp`}
                  preHighlightedHtml={problem.solution.preHighlightedHtml}
                />
              </CollapsibleSection>
            )}
          </div>
        )}

        <ProblemFooterLinks
          contestId={problem.contestId}
          index={problem.index}
        />

        <div className="mt-8 space-y-3">
          {hasContent && problem.reviewStatus !== "VERIFIED" && (
            <ReportSection problemId={problem.id} />
          )}

          {hasContent && (
            <ReviewSection
              problemId={problem.id}
              reviewStatus={problem.reviewStatus}
            />
          )}
        </div>
      </div>
    </main>
  );
}
