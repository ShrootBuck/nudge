"use client";

import {
  ArrowLeft,
  ArrowUpRight,
  BadgeCheck,
  BookOpenText,
  Code2,
  Lightbulb,
  LoaderCircle,
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
import { cn } from "@/lib/utils";
import { verifyProblem } from "./actions";

type Problem = {
  id: string;
  contestId: number;
  index: string;
  name: string;
  rating: number | null;
  tags: string[];
  verified: boolean;
  generationStatus: string;
  hints: { id: string; order: number; content: string }[];
  editorial: { id: string; content: string } | null;
  solution: { id: string; content: string } | null;
};

const HINT_LABELS = [
  "A gentle nudge",
  "Getting warmer",
  "On the right track",
  "Almost there",
  "The key insight",
];

const HINT_NOTES = [
  "Barely a spoiler. Keep your own solve alive.",
  "A cleaner direction to test.",
  "The structure should start snapping into place here.",
  "You probably only need one more push after this.",
  "This is the near-giveaway version.",
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
            <p className="mt-1 text-sm text-muted-foreground">
              {HINT_NOTES[index] ?? "A progressively less subtle hint."}
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

function SolutionCode({ code }: { code: string }) {
  if (code.trimStart().startsWith("```")) {
    return <Markdown content={code} />;
  }

  return <CodeBlock code={code} language="cpp" />;
}

export function ProblemContent({ problem }: { problem: Problem }) {
  const [showEditorial, setShowEditorial] = useState(false);
  const [showSolution, setShowSolution] = useState(false);
  const cfUrl = `https://codeforces.com/contest/${problem.contestId}/problem/${problem.index}`;
  const hasContent = problem.generationStatus === "COMPLETED";
  const state = generationState(problem.generationStatus);
  const StateIcon = state.icon;

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
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 flex-1">
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

                  {problem.verified ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300 dark:text-emerald-200">
                      <BadgeCheck className="size-3.5" />
                      Verified
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/80 px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm">
                      <ShieldAlert className="size-3.5" />
                      Unverified
                    </span>
                  )}

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
              </div>

              <div className="flex shrink-0 flex-col gap-3 sm:flex-row lg:flex-col">
                <a
                  href={cfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-foreground/10 bg-foreground px-4 py-2.5 text-sm font-medium text-background shadow-sm transition hover:bg-foreground/90"
                >
                  Original problem
                  <ArrowUpRight className="size-4" />
                </a>

                <div className="rounded-[1.25rem] border border-border/60 bg-background/75 px-4 py-3 text-sm text-muted-foreground shadow-sm">
                  {problem.verified
                    ? "Marked verified and safer to trust heavily."
                    : "AI-generated and still unverified. Double-check the details before internalizing them."}
                </div>
              </div>
            </div>

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
              <section className="rounded-[1.75rem] border border-border/70 bg-card/75 p-5 shadow-[0_18px_50px_-36px_rgba(15,23,42,0.45)] sm:p-6">
                <SectionIntro
                  eyebrow="Editorial"
                  title="Full explanation"
                  description="Open this when you want the whole argument, complexity included."
                  icon={BookOpenText}
                />

                {!showEditorial ? (
                  <button
                    type="button"
                    onClick={() => setShowEditorial(true)}
                    className="flex w-full cursor-pointer flex-col items-start rounded-[1.4rem] border border-dashed border-border/60 bg-background/70 px-5 py-6 text-left transition hover:border-foreground/15 hover:bg-background/85"
                  >
                    <span className="text-base font-semibold tracking-tight">
                      Reveal editorial
                    </span>
                    <span className="mt-1 text-sm text-muted-foreground">
                      You&apos;ve probably squeezed enough value out of the
                      hints.
                    </span>
                  </button>
                ) : (
                  <div className="rounded-[1.4rem] border border-border/70 bg-background/75 px-5 py-5 shadow-sm sm:px-6">
                    <Markdown content={problem.editorial.content} />
                    <button
                      type="button"
                      onClick={() => setShowEditorial(false)}
                      className="mt-6 cursor-pointer text-sm font-medium text-muted-foreground transition hover:text-foreground"
                    >
                      Hide editorial
                    </button>
                  </div>
                )}
              </section>
            )}

            {problem.solution && (
              <section className="rounded-[1.75rem] border border-border/70 bg-card/75 p-5 shadow-[0_18px_50px_-36px_rgba(15,23,42,0.45)] sm:p-6">
                <SectionIntro
                  eyebrow="Solution"
                  title="Accepted C++"
                  description="This is the full implementation, styled for reading instead of panic-copying."
                  icon={Code2}
                />

                {!showSolution ? (
                  <button
                    type="button"
                    onClick={() => setShowSolution(true)}
                    className="flex w-full cursor-pointer flex-col items-start rounded-[1.4rem] border border-dashed border-border/60 bg-background/70 px-5 py-6 text-left transition hover:border-foreground/15 hover:bg-background/85"
                  >
                    <span className="text-base font-semibold tracking-tight">
                      Reveal solution
                    </span>
                    <span className="mt-1 text-sm text-muted-foreground">
                      Open the full code only when you&apos;re done reasoning.
                    </span>
                  </button>
                ) : (
                  <div className="rounded-[1.4rem] border border-border/70 bg-background/75 px-5 py-5 shadow-sm sm:px-6">
                    <SolutionCode code={problem.solution.content} />
                    <button
                      type="button"
                      onClick={() => setShowSolution(false)}
                      className="mt-6 cursor-pointer text-sm font-medium text-muted-foreground transition hover:text-foreground"
                    >
                      Hide solution
                    </button>
                  </div>
                )}
              </section>
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
            View on Codeforces &rarr;
          </a>
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Back to the list
          </Link>
        </div>

        {!problem.verified && hasContent && (
          <VerifySection problemId={problem.id} />
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

function VerifySection({ problemId }: { problemId: string }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      try {
        const result = await verifyProblem(problemId, password);
        if (result.success) {
          setPassword("");
          setOpen(false);
          router.refresh();
        } else {
          setError(result.error);
        }
      } catch {
        setError("Verification failed");
      }
    });
  }

  if (!open) {
    return (
      <div className="mt-14 text-center">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="cursor-pointer text-[10px] text-muted-foreground/20 transition-colors hover:text-muted-foreground/50"
        >
          verify
        </button>
      </div>
    );
  }

  return (
    <div className="mt-12 rounded-[1.5rem] border border-dashed border-border/60 bg-card/70 p-4 shadow-[0_18px_50px_-36px_rgba(15,23,42,0.45)] sm:p-5">
      <div className="flex items-start gap-3">
        <div className="rounded-2xl border border-border/60 bg-background/80 p-3 text-muted-foreground shadow-sm">
          <ShieldCheck className="size-5" />
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold tracking-tight">
            Mark this problem as verified
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            This is intentionally low-friction. Enter the shared password and
            the page will refresh in place.
          </p>

          <form
            onSubmit={handleSubmit}
            className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center"
          >
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Verification password"
              className="h-10 w-full rounded-xl border-border/60 bg-background/80 sm:max-w-64"
              autoFocus
            />
            <Button
              type="submit"
              size="sm"
              disabled={isPending || !password}
              className="h-10 rounded-xl px-4"
            >
              {isPending ? "Verifying..." : "Verify"}
            </Button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setError(null);
              }}
              className="inline-flex h-10 cursor-pointer items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"
            >
              <X className="size-4" />
              Cancel
            </button>
          </form>

          {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}
        </div>
      </div>
    </div>
  );
}
