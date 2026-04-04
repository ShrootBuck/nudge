"use client";

import {
  ArrowLeft,
  ArrowUpRight,
  BadgeCheck,
  BookOpenText,
  Code2,
  Lightbulb,
  LoaderCircle,
  RotateCw,
  ShieldAlert,
  ShieldCheck,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ComponentType, useState, useTransition } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import { CodeBlock } from "@/components/code-block";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseSolutionContent } from "@/lib/problem-solution";
import { cn } from "@/lib/utils";
import { queueRegeneration, setProblemReviewStatus } from "./actions";

type ReviewStatus = "UNREVIEWED" | "VERIFIED" | "SOLUTION_INCORRECT";
type ReviewOutcome = Exclude<ReviewStatus, "UNREVIEWED">;

type Problem = {
  id: string;
  contestId: number;
  index: string;
  name: string;
  rating: number | null;
  tags: string[];
  reviewStatus: ReviewStatus;
  generationStatus: string;
  hints: { id: string; order: number; content: string }[];
  editorial: { id: string; content: string } | null;
  solution: {
    id: string;
    content: string;
    preHighlightedHtml?: { light: string; dark: string } | null;
  } | null;
};

const HINT_LABELS = [
  "A gentle nudge",
  "Getting warmer",
  "On the right track",
  "Almost there",
  "The key insight",
];

function ratingTone(rating: number | null): string {
  if (!rating) {
    return "border-border/70 bg-background/80 text-muted-foreground";
  }
  if (rating < 1200) {
    return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300 dark:text-emerald-200";
  }
  if (rating < 1600) {
    return "border-sky-500/20 bg-sky-500/10 text-sky-300 dark:text-sky-200";
  }
  if (rating < 1900) {
    return "border-violet-500/20 bg-violet-500/10 text-violet-300 dark:text-violet-200";
  }
  if (rating < 2200) {
    return "border-amber-500/20 bg-amber-500/10 text-amber-400 dark:text-amber-200";
  }
  if (rating < 2400) {
    return "border-orange-500/20 bg-orange-500/10 text-orange-400 dark:text-orange-200";
  }
  return "border-rose-500/20 bg-rose-500/10 text-rose-400 dark:text-rose-200";
}

function generationState(status: string) {
  switch (status) {
    case "PROCESSING":
      return {
        icon: LoaderCircle,
        label: "Generation in progress",
        description:
          "The batch is still cooking. Hints, editorial, and solution will appear after collection completes.",
        className:
          "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-200",
        animate: true,
      };
    case "FAILED":
      return {
        icon: ShieldAlert,
        label: "Generation failed",
        description:
          "This problem did not finish successfully. It should be retried before readers rely on it.",
        className:
          "border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-200",
        animate: false,
      };
    default:
      return {
        icon: ShieldAlert,
        label: "No content yet",
        description:
          "This problem exists in the catalog, but the AI content has not been generated yet.",
        className: "border-border/70 bg-background/80 text-muted-foreground",
        animate: false,
      };
  }
}

function reviewState(status: ReviewStatus) {
  switch (status) {
    case "VERIFIED":
      return {
        icon: BadgeCheck,
        label: "Verified",
        badgeClassName:
          "border-emerald-500/20 bg-emerald-500/10 text-emerald-300 dark:text-emerald-200",
        panelClassName:
          "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200",
        summary: "Marked verified and safer to trust heavily.",
      };
    case "SOLUTION_INCORRECT":
      return {
        icon: X,
        label: "Solution incorrect",
        badgeClassName:
          "border-rose-500/20 bg-rose-500/10 text-rose-300 dark:text-rose-200",
        panelClassName:
          "border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-200",
        summary:
          "The generated solution was reviewed and does not currently pass. Treat the write-up as suspect until it is fixed.",
      };
    default:
      return {
        icon: ShieldAlert,
        label: "Unreviewed",
        badgeClassName:
          "border-border/60 bg-background/80 text-muted-foreground shadow-sm",
        panelClassName:
          "border-border/60 bg-background/75 text-muted-foreground",
        summary:
          "AI-generated and still unreviewed. Double-check the details before internalizing them.",
      };
  }
}

function solutionSectionDescription(reviewStatus: ReviewStatus) {
  switch (reviewStatus) {
    case "VERIFIED":
      return "This is the full implementation that was manually checked.";
    case "SOLUTION_INCORRECT":
      return "This implementation is currently marked incorrect. Open it if you want to inspect what went wrong.";
    default:
      return "This is the full implementation the model produced for the problem.";
  }
}

function Markdown({ content }: { content: string }) {
  return (
    <div className="prose prose-neutral max-w-none text-[0.98rem] leading-7 dark:prose-invert prose-headings:font-semibold prose-headings:tracking-tight prose-p:text-foreground/80 prose-li:text-foreground/80 prose-strong:text-foreground prose-a:font-medium prose-a:text-foreground prose-a:underline prose-code:rounded-md prose-code:bg-muted/70 prose-code:px-1.5 prose-code:py-0.5 prose-code:font-mono prose-code:text-[0.9em] prose-code:before:content-none prose-code:after:content-none prose-pre:bg-transparent prose-pre:p-0 prose-pre:shadow-none prose-blockquote:border-l-2 prose-blockquote:border-border prose-blockquote:text-muted-foreground">
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          pre({ children }) {
            return <>{children}</>;
          },
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || "");
            const code = String(children).replace(/\n$/, "");

            if (match) {
              return <CodeBlock code={code} language={match[1]} />;
            }

            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
          a({ href, children, ...props }) {
            const isExternal = href?.startsWith("http");

            return (
              <a
                href={href}
                target={isExternal ? "_blank" : undefined}
                rel={isExternal ? "noreferrer noopener" : undefined}
                {...props}
              >
                {children}
              </a>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function AnimatedCollapse({
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

function ChevronIcon({ open }: { open: boolean }) {
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

function HintCard({
  hint,
  index,
}: {
  hint: Problem["hints"][0];
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
          <Markdown content={hint.content} />
        </div>
      </AnimatedCollapse>
    </div>
  );
}

function SolutionCode({
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
    return <Markdown content={parsedSolution.content} />;
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

export function ProblemContent({ problem }: { problem: Problem }) {
  const [showEditorial, setShowEditorial] = useState(false);
  const [showSolution, setShowSolution] = useState(false);
  const cfUrl = `https://codeforces.com/contest/${problem.contestId}/problem/${problem.index}`;
  const hasContent = problem.generationStatus === "COMPLETED";
  const state = generationState(problem.generationStatus);
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
                  <a
                    href={cfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center rounded-full border border-border/70 bg-background/80 px-3 py-1.5 font-mono text-sm text-muted-foreground shadow-sm transition hover:text-foreground"
                  >
                    {problem.contestId}
                    {problem.index}
                  </a>

                  <span
                    className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium ${review.badgeClassName}`}
                  >
                    <ReviewIcon className="size-3.5" />
                    {review.label}
                  </span>

                  <span
                    className={`inline-flex items-center rounded-full border px-3 py-1.5 font-mono text-xs font-semibold ${ratingTone(problem.rating)}`}
                  >
                    {problem.rating ?? "unrated"}
                  </span>

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
                <Markdown content={problem.editorial.content} />
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

        <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <a
            href={cfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"
          >
            <ArrowUpRight className="size-4" />
            View on Codeforces
          </a>
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Back to the list
          </Link>
        </div>

        {hasContent && (
          <ReviewSection
            problemId={problem.id}
            reviewStatus={problem.reviewStatus}
          />
        )}
      </div>
    </main>
  );
}

function SectionIntro({
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

function CollapsibleSection({
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

function ReviewSection({
  problemId,
  reviewStatus,
}: {
  problemId: string;
  reviewStatus: ReviewStatus;
}) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingStatus, setPendingStatus] = useState<
    ReviewOutcome | "REGENERATE" | null
  >(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const review = reviewState(reviewStatus);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    handleReview("VERIFIED");
  }

  function handleReview(nextStatus: ReviewOutcome) {
    setError(null);
    setPendingStatus(nextStatus);

    startTransition(() => {
      void (async () => {
        try {
          const result = await setProblemReviewStatus(
            problemId,
            password,
            nextStatus,
          );

          if (result.success) {
            setPassword("");
            setOpen(false);
            router.refresh();
          } else {
            setError(result.error);
          }
        } catch {
          setError("Review update failed");
        } finally {
          setPendingStatus(null);
        }
      })();
    });
  }

  function handleRegenerate() {
    setError(null);
    setPendingStatus("REGENERATE");

    startTransition(() => {
      void (async () => {
        try {
          const result = await queueRegeneration(problemId, password);

          if (result.success) {
            setPassword("");
            setOpen(false);
            router.refresh();
          } else {
            setError(result.error);
          }
        } catch {
          setError("Regeneration request failed");
        } finally {
          setPendingStatus(null);
        }
      })();
    });
  }

  return (
    <div
      className={cn(
        "mt-12 overflow-hidden rounded-[1.75rem] border bg-card/75 shadow-sm transition duration-200",
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
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-background/80 text-muted-foreground shadow-sm">
            <ShieldCheck className="size-4" />
          </span>

          <div className="min-w-0">
            <p className="text-base font-semibold tracking-tight">
              Review this problem
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Update the review status for this problem
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span
            className={cn(
              "hidden items-center rounded-full border px-2.5 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.16em] sm:inline-flex",
              review.badgeClassName,
            )}
          >
            {review.label}
          </span>
          <ChevronIcon open={open} />
        </div>
      </button>

      <AnimatedCollapse open={open}>
        <div className="border-t border-border/60 px-5 pb-5 pt-4 sm:px-6">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4 sm:flex-row sm:items-end sm:flex-wrap">
            <div className="w-full sm:w-56">
              <label
                htmlFor="review-password"
                className="mb-2 block text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase"
              >
                Shared password
              </label>
              <Input
                id="review-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Review password"
                className="h-10 rounded-xl border-border/50 bg-background/65 px-4 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] placeholder:text-muted-foreground/70 focus-visible:border-foreground/15 focus-visible:ring-0 focus-visible:outline-none"
              />
            </div>

            <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center">
              <Button
                type="submit"
                size="sm"
                variant="outline"
                disabled={isPending || !password}
                className="h-10 w-full rounded-xl border-emerald-500/20 bg-emerald-500/10 px-4 text-emerald-200 shadow-sm hover:bg-emerald-500/15 hover:text-emerald-100 disabled:border-emerald-500/10 disabled:bg-emerald-500/10 disabled:text-emerald-200/55 sm:w-auto"
              >
                {pendingStatus === "VERIFIED"
                  ? "Verifying..."
                  : "Mark verified"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isPending || !password}
                className="h-10 w-full rounded-xl border-rose-500/20 bg-rose-500/10 px-4 text-rose-200 shadow-sm hover:bg-rose-500/15 hover:text-rose-100 disabled:border-rose-500/10 disabled:bg-rose-500/10 disabled:text-rose-200/55 sm:w-auto"
                onClick={() => handleReview("SOLUTION_INCORRECT")}
              >
                {pendingStatus === "SOLUTION_INCORRECT"
                  ? "Marking..."
                  : "Mark incorrect"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isPending || !password}
                className="h-10 w-full rounded-xl border-border/60 bg-background/55 px-4 text-foreground/80 shadow-sm hover:bg-background/75 hover:text-foreground disabled:bg-background/40 sm:w-auto"
                onClick={handleRegenerate}
              >
                <RotateCw
                  className={cn(
                    "mr-2 size-3.5",
                    pendingStatus === "REGENERATE" && "animate-spin",
                  )}
                />
                {pendingStatus === "REGENERATE" ? "Queuing..." : "Regenerate"}
              </Button>
            </div>
          </form>

          {error && (
            <p className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
              {error}
            </p>
          )}
        </div>
      </AnimatedCollapse>
    </div>
  );
}
