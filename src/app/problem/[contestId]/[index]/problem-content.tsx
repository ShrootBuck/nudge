"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { CodeBlock } from "@/components/code-block";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

function ratingColor(rating: number | null): string {
  if (!rating) return "text-muted-foreground";
  if (rating < 1200) return "text-emerald-400";
  if (rating < 1600) return "text-cyan-400";
  if (rating < 1900) return "text-violet-400";
  if (rating < 2200) return "text-amber-400";
  if (rating < 2400) return "text-orange-400";
  return "text-red-400";
}

function Markdown({ content }: { content: string }) {
  return (
    <div className="prose prose-invert prose-sm max-w-none prose-headings:text-foreground prose-p:text-muted-foreground/90 prose-p:leading-relaxed prose-strong:text-foreground prose-code:rounded-md prose-code:bg-muted/60 prose-code:px-1.5 prose-code:py-0.5 prose-code:text-sm prose-code:font-mono prose-pre:bg-transparent prose-pre:p-0 prose-pre:border-0 prose-li:text-muted-foreground/90">
      <ReactMarkdown
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
        }}
      >
        {content}
      </ReactMarkdown>
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
      className={`text-muted-foreground/60 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
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

function HintCard({ hint, index }: { hint: Problem["hints"][0]; index: number }) {
  const [open, setOpen] = useState(false);

  return (
    <Card className="bg-card/50 border-border/40 transition-colors hover:border-border/60">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full text-left cursor-pointer"
      >
        <CardHeader className="py-3.5 px-5">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">
              <span className="inline-flex items-center justify-center size-5 rounded-md bg-muted/60 text-[11px] font-semibold text-muted-foreground mr-2.5">
                {hint.order}
              </span>
              {HINT_LABELS[index] ?? `Hint ${hint.order}`}
            </CardTitle>
            <ChevronIcon open={open} />
          </div>
        </CardHeader>
      </button>
      {open && (
        <CardContent className="pt-0 pb-5 px-5">
          <div className="ml-[1.875rem]">
            <Markdown content={hint.content} />
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function SolutionCode({ code }: { code: string }) {
  if (code.trimStart().startsWith("```")) {
    return <Markdown content={code} />;
  }
  return <CodeBlock code={code} language="cpp" />;
}

export function ProblemContent({ problem }: { problem: Problem }) {
  const [showSolution, setShowSolution] = useState(false);
  const cfUrl = `https://codeforces.com/contest/${problem.contestId}/problem/${problem.index}`;
  const hasContent = problem.generationStatus === "COMPLETED";

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-2xl px-6 py-12 sm:py-16">
        {/* Back link */}
        <nav className="mb-10">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground/70 transition-colors hover:text-foreground"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path
                d="M10 12L6 8L10 4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            All problems
          </Link>
        </nav>

        {/* Header */}
        <header className="mb-10">
          <div className="flex items-center gap-2.5 mb-3">
            <a
              href={cfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-sm text-muted-foreground/70 hover:text-foreground transition-colors"
            >
              {problem.contestId}{problem.index}
            </a>
            {problem.verified && (
              <span title="Verified" className="text-emerald-400 text-sm">
                &#10003;
              </span>
            )}
            {problem.rating && (
              <span className={`text-sm font-mono font-semibold ${ratingColor(problem.rating)}`}>
                {problem.rating}
              </span>
            )}
          </div>

          <h1 className="text-3xl font-bold tracking-tight mb-4">
            {problem.name}
          </h1>

          {problem.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {problem.tags.map((tag) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className="text-xs font-normal bg-muted/50 text-muted-foreground"
                >
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </header>

        {!hasContent && (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/50 py-16">
            <p className="text-sm text-muted-foreground/70">
              {problem.generationStatus === "PROCESSING"
                ? "Content is being generated..."
                : problem.generationStatus === "FAILED"
                  ? "Generation failed. This problem will be retried."
                  : "No content yet."}
            </p>
          </div>
        )}

        {hasContent && (
          <div className="space-y-10">
            {/* Hints */}
            {problem.hints.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-widest mb-4">
                  Hints
                </h2>
                <div className="space-y-2">
                  {problem.hints.map((hint, i) => (
                    <HintCard key={hint.id} hint={hint} index={i} />
                  ))}
                </div>
              </section>
            )}

            {/* Editorial */}
            {problem.editorial && (
              <section>
                <h2 className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-widest mb-4">
                  Editorial
                </h2>
                <Card className="bg-card/50 border-border/40">
                  <CardContent className="py-6 px-6">
                    <Markdown content={problem.editorial.content} />
                  </CardContent>
                </Card>
              </section>
            )}

            {/* Solution */}
            {problem.solution && (
              <section>
                <h2 className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-widest mb-4">
                  Solution
                </h2>
                {!showSolution ? (
                  <button
                    type="button"
                    onClick={() => setShowSolution(true)}
                    className="w-full rounded-xl border border-dashed border-border/40 py-10 text-sm text-muted-foreground/60 hover:text-foreground hover:border-border/70 hover:bg-muted/20 transition-all cursor-pointer"
                  >
                    Click to reveal solution
                  </button>
                ) : (
                  <Card className="bg-card/50 border-border/40">
                    <CardContent className="py-6 px-6">
                      <SolutionCode code={problem.solution.content} />
                      <button
                        type="button"
                        onClick={() => setShowSolution(false)}
                        className="mt-5 text-xs text-muted-foreground/60 hover:text-foreground transition-colors cursor-pointer"
                      >
                        Hide solution
                      </button>
                    </CardContent>
                  </Card>
                )}
              </section>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="mt-14 text-center">
          <a
            href={cfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground/50 hover:text-foreground transition-colors"
          >
            View on Codeforces &rarr;
          </a>
        </div>

        {/* Hidden verification */}
        {!problem.verified && hasContent && (
          <VerifySection problemId={problem.id} />
        )}
      </div>
    </main>
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
      const result = await verifyProblem(problemId, password);
      if (result.success) {
        setPassword("");
        setOpen(false);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  if (!open) {
    return (
      <div className="mt-16 text-center">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-[10px] text-muted-foreground/20 hover:text-muted-foreground/50 transition-colors cursor-pointer"
        >
          verify
        </button>
      </div>
    );
  }

  return (
    <div className="mt-16 flex justify-center">
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="password"
          className="h-7 w-36 rounded-lg border border-border/40 bg-transparent px-2.5 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-border/70"
          autoFocus
        />
        <button
          type="submit"
          disabled={isPending || !password}
          className="h-7 rounded-lg bg-foreground/10 px-3 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 cursor-pointer"
        >
          {isPending ? "..." : "ok"}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setError(null); }}
          className="h-7 px-1 text-xs text-muted-foreground/40 hover:text-muted-foreground transition-colors cursor-pointer"
        >
          &times;
        </button>
        {error && <span className="text-xs text-red-400">{error}</span>}
      </form>
    </div>
  );
}
