"use client";

import {
  ArrowUpRight,
  Check,
  Flag,
  RotateCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cfProblemUrl, cn, ratingTone } from "@/lib/utils";
import {
  queueRegeneration,
  reportProblem,
  setProblemReviewStatus,
} from "./actions";
import { AnimatedCollapse, ChevronIcon } from "./problem-cards";
import {
  type ProblemView,
  type ReviewOutcome,
  type ReviewStatus,
  reviewState,
} from "./problem-view-types";

export function ProblemMetaRow({
  problem,
  hasContent,
}: {
  problem: ProblemView;
  hasContent: boolean;
}) {
  const cfUrl = cfProblemUrl(problem.contestId, problem.index);
  const review = reviewState(problem.reviewStatus);
  const ReviewIcon = review.icon;

  return (
    <>
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

      {hasContent && problem.modelDisplayName && (
        <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/70 px-3 py-1.5 text-xs text-muted-foreground">
          <Sparkles className="size-3" />
          {problem.modelDisplayName}
        </span>
      )}
    </>
  );
}

export function ProblemFooterLinks({
  contestId,
  index,
}: {
  contestId: number;
  index: string;
}) {
  const cfUrl = cfProblemUrl(contestId, index);

  return (
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
        Back to the list
      </Link>
    </div>
  );
}

export function ReportSection({ problemId }: { problemId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(() => {
      void (async () => {
        try {
          const result = await reportProblem(problemId, reason);
          if (result.success) {
            setReason("");
            setSubmitted(true);
          } else {
            setError(result.error);
          }
        } catch {
          setError("Failed to submit report");
        }
      })();
    });
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-[1.75rem] border bg-card/75 shadow-sm transition duration-200",
        open
          ? "border-amber-500/20"
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
            <Flag className="size-4" />
          </span>

          <div className="min-w-0">
            <p className="text-base font-semibold tracking-tight">
              Report an issue
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Something wrong with the hints, editorial, or solution? Let us
              know.
            </p>
          </div>
        </div>

        <ChevronIcon open={open} />
      </button>

      <AnimatedCollapse open={open}>
        <div className="border-t border-border/60 px-5 pb-5 pt-4 sm:px-6">
          {submitted ? (
            <div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
              <Check className="size-4 shrink-0" />
              Thanks for the report — we&apos;ll take a look.
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label
                  htmlFor="report-reason"
                  className="mb-2 block text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase"
                >
                  What&apos;s wrong?
                </label>
                <textarea
                  id="report-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. The solution gives WA on test 3, hint 2 spoils the full approach..."
                  rows={3}
                  maxLength={1000}
                  className="w-full resize-none rounded-xl border border-border/50 bg-background/65 px-4 py-3 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] placeholder:text-muted-foreground/70 focus-visible:border-foreground/15 focus-visible:ring-0 focus-visible:outline-none"
                />
              </div>

              <div className="flex items-center gap-3">
                <Button
                  type="submit"
                  size="sm"
                  variant="outline"
                  disabled={isPending || !reason.trim()}
                  className="h-10 rounded-xl border-amber-500/20 bg-amber-500/10 px-4 text-amber-200 shadow-sm hover:bg-amber-500/15 hover:text-amber-100 disabled:border-amber-500/10 disabled:bg-amber-500/10 disabled:text-amber-200/55"
                >
                  {isPending ? "Submitting..." : "Submit report"}
                </Button>
              </div>

              {error && (
                <p className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
                  {error}
                </p>
              )}
            </form>
          )}
        </div>
      </AnimatedCollapse>
    </div>
  );
}

export function ReviewSection({
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
        "overflow-hidden rounded-[1.75rem] border bg-card/75 shadow-sm transition duration-200",
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
          <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-4 sm:flex-row sm:items-end sm:flex-wrap"
          >
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
                onClick={() => handleReview("INCORRECT")}
              >
                {pendingStatus === "INCORRECT"
                  ? "Marking..."
                  : "Mark incorrect"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isPending || !password}
                className="h-10 w-full rounded-xl border-amber-500/20 bg-amber-500/10 px-4 text-amber-200 shadow-sm hover:bg-amber-500/15 hover:text-amber-100 disabled:border-amber-500/10 disabled:bg-amber-500/10 disabled:text-amber-200/55 sm:w-auto"
                onClick={() => handleReview("UNSOLVABLE")}
              >
                {pendingStatus === "UNSOLVABLE"
                  ? "Marking..."
                  : "Mark unsolvable"}
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
