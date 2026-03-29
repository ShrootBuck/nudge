"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { CodeBlock } from "@/components/code-block";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
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
    <div className="prose prose-invert prose-sm max-w-none prose-headings:text-foreground prose-p:text-muted-foreground prose-strong:text-foreground prose-code:rounded prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:text-sm prose-code:font-mono prose-pre:bg-transparent prose-pre:p-0 prose-pre:border-0">
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

function HintCard({ hint, index }: { hint: Problem["hints"][0]; index: number }) {
  const [open, setOpen] = useState(false);

  return (
    <Card className="bg-card/50 border-border/50 transition-colors hover:border-border">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full text-left cursor-pointer"
      >
        <CardHeader className="py-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">
              <span className="text-muted-foreground mr-2">#{hint.order}</span>
              {HINT_LABELS[index] ?? `Hint ${hint.order}`}
            </CardTitle>
            <span className="text-xs text-muted-foreground">
              {open ? "click to hide" : "click to reveal"}
            </span>
          </div>
        </CardHeader>
      </button>
      {open && (
        <CardContent className="pt-0 pb-4">
          <Markdown content={hint.content} />
        </CardContent>
      )}
    </Card>
  );
}

function SolutionCode({ code }: { code: string }) {
  // If the content is already wrapped in a code fence, render as markdown
  if (code.trimStart().startsWith("```")) {
    return <Markdown content={code} />;
  }
  // Otherwise treat as raw C++ and render with syntax highlighting directly
  return <CodeBlock code={code} language="cpp" />;
}

export function ProblemContent({ problem }: { problem: Problem }) {
  const [showSolution, setShowSolution] = useState(false);
  const cfUrl = `https://codeforces.com/contest/${problem.contestId}/problem/${problem.index}`;
  const hasContent = problem.generationStatus === "COMPLETED";

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-12">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <a
              href={cfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
            >
              {problem.contestId}{problem.index}
            </a>
            {problem.verified && (
              <span title="Verified" className="text-emerald-400">
                &#10003;
              </span>
            )}
          </div>

          <h1 className="text-2xl font-semibold tracking-tight mb-3">
            {problem.name}
          </h1>

          <div className="flex flex-wrap items-center gap-2">
            {problem.rating && (
              <span className={`text-sm font-mono font-medium ${ratingColor(problem.rating)}`}>
                {problem.rating}
              </span>
            )}
            {problem.tags.map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className="text-xs font-normal"
              >
                {tag}
              </Badge>
            ))}
          </div>
        </div>

        {!hasContent && (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center text-muted-foreground">
              <p className="text-sm">
                {problem.generationStatus === "PROCESSING"
                  ? "Content is being generated..."
                  : problem.generationStatus === "FAILED"
                    ? "Generation failed. This problem will be retried."
                    : "No content yet."}
              </p>
            </CardContent>
          </Card>
        )}

        {hasContent && (
          <div className="space-y-8">
            {/* Hints */}
            {problem.hints.length > 0 && (
              <section>
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
                  Hints
                </h2>
                <div className="space-y-2">
                  {problem.hints.map((hint, i) => (
                    <HintCard key={hint.id} hint={hint} index={i} />
                  ))}
                </div>
              </section>
            )}

            <Separator className="opacity-50" />

            {/* Editorial */}
            {problem.editorial && (
              <section>
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
                  Editorial
                </h2>
                <Card className="bg-card/50 border-border/50">
                  <CardContent className="py-5">
                    <Markdown content={problem.editorial.content} />
                  </CardContent>
                </Card>
              </section>
            )}

            <Separator className="opacity-50" />

            {/* Solution */}
            {problem.solution && (
              <section>
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
                  Solution
                </h2>
                {!showSolution ? (
                  <button
                    type="button"
                    onClick={() => setShowSolution(true)}
                    className="w-full rounded-lg border border-dashed border-border/50 py-8 text-sm text-muted-foreground hover:text-foreground hover:border-border transition-colors cursor-pointer"
                  >
                    Reveal solution
                  </button>
                ) : (
                  <Card className="bg-card/50 border-border/50">
                    <CardContent className="py-5">
                      <SolutionCode code={problem.solution.content} />
                      <button
                        type="button"
                        onClick={() => setShowSolution(false)}
                        className="mt-4 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
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

        {/* Footer link */}
        <div className="mt-12 text-center">
          <a
            href={cfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            View on Codeforces &rarr;
          </a>
        </div>

        {/* Hidden verification — only visible if not already verified */}
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
          className="text-[10px] text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors cursor-pointer"
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
          className="h-7 w-36 rounded border border-border/50 bg-transparent px-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-border"
          autoFocus
        />
        <button
          type="submit"
          disabled={isPending || !password}
          className="h-7 rounded bg-foreground/10 px-3 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 cursor-pointer"
        >
          {isPending ? "..." : "ok"}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setError(null); }}
          className="h-7 px-1 text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors cursor-pointer"
        >
          &times;
        </button>
        {error && <span className="text-xs text-red-400">{error}</span>}
      </form>
    </div>
  );
}
