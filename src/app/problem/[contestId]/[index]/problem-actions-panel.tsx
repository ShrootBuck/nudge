"use client";

import {
  ArrowUpRight,
  Check,
  FileJson,
  Flag,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cfProblemUrl, cn, ratingTone } from "@/lib/utils";
import {
  regenerateProblemContent,
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

      {problem.transcriptDownloadUrl && (
        <a
          href={problem.transcriptDownloadUrl}
          className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/70 px-3 py-1.5 text-xs text-muted-foreground transition hover:text-foreground"
          title="Download the raw OpenCode transcript"
        >
          <FileJson className="size-3" />
          Transcript
        </a>
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
    <div className="mt-8 flex flex-col gap-3 sm:mt-10 sm:flex-row sm:items-center sm:justify-between">
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
  const panelId = useId();

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
        "overflow-hidden rounded-[1.25rem] border bg-card/75 shadow-sm transition duration-200 sm:rounded-[1.75rem]",
        open
          ? "border-amber-500/20"
          : "border-border/60 hover:border-foreground/10",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3.5 text-left sm:gap-4 sm:px-6 sm:py-4"
      >
        <span className="flex min-w-0 items-center gap-3 sm:gap-4">
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-background/80 text-muted-foreground shadow-sm sm:size-10 sm:rounded-2xl">
            <Flag className="size-4" />
          </span>

          <span className="min-w-0">
            <span className="block text-base font-semibold tracking-tight">
              Report an issue
            </span>
            <span className="mt-0.5 block text-sm text-muted-foreground">
              Something wrong with the hints, editorial, or solution? Let us
              know.
            </span>
          </span>
        </span>

        <ChevronIcon open={open} />
      </button>

      <AnimatedCollapse open={open} id={panelId}>
        <div className="border-t border-border/60 px-4 pb-4 pt-4 sm:px-6 sm:pb-5">
          {submitted ? (
            <output className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-200">
              <Check className="size-4 shrink-0" />
              Thanks for the report — we&apos;ll take a look.
            </output>
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
                  className="w-full resize-none rounded-xl border border-input bg-background/65 px-4 py-3 text-base shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none md:text-sm"
                />
              </div>

              <div className="flex items-center gap-3">
                <Button
                  type="submit"
                  size="sm"
                  variant="outline"
                  disabled={isPending || !reason.trim()}
                  className="h-10 rounded-xl border-amber-500/25 bg-amber-500/10 px-4 text-amber-800 shadow-sm hover:bg-amber-500/15 hover:text-amber-900 disabled:border-amber-500/10 disabled:bg-amber-500/10 disabled:text-amber-800/55 dark:text-amber-200 dark:hover:text-amber-100 dark:disabled:text-amber-200/55"
                >
                  {isPending ? "Submitting..." : "Submit report"}
                </Button>
              </div>

              {error && (
                <p
                  role="alert"
                  className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-200"
                >
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
  type ReviewAction = Extract<ReviewOutcome, "VERIFIED" | "INCORRECT">;
  type PendingAction = ReviewAction | "REGENERATE";

  const [open, setOpen] = useState(false);
  const [hasPassword, setHasPassword] = useState(false);
  const passwordRef = useRef("");
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const review = reviewState(reviewStatus);
  const panelId = useId();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    handleReview("VERIFIED");
  }

  function resetPassword() {
    passwordRef.current = "";
    if (passwordInputRef.current) {
      passwordInputRef.current.value = "";
    }
    setHasPassword(false);
  }

  function closeAfterSuccess() {
    resetPassword();
    setOpen(false);
    router.refresh();
  }

  function handleReview(nextStatus: ReviewAction) {
    setError(null);
    setPendingAction(nextStatus);

    startTransition(() => {
      void (async () => {
        try {
          const result = await setProblemReviewStatus(
            problemId,
            passwordRef.current,
            nextStatus,
          );

          if (result.success) {
            closeAfterSuccess();
          } else {
            setError(result.error);
          }
        } catch {
          setError("Review update failed");
        } finally {
          setPendingAction(null);
        }
      })();
    });
  }

  function handleRegenerate() {
    if (
      !window.confirm(
        "Regenerate this problem? The current hints, editorial, solution, and transcript will be deleted.",
      )
    ) {
      return;
    }

    setError(null);
    setPendingAction("REGENERATE");

    startTransition(() => {
      void (async () => {
        try {
          const result = await regenerateProblemContent(
            problemId,
            passwordRef.current,
          );

          if (result.success) {
            closeAfterSuccess();
          } else {
            setError(result.error);
          }
        } catch {
          setError("Regenerate failed");
        } finally {
          setPendingAction(null);
        }
      })();
    });
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-[1.25rem] border bg-card/75 shadow-sm transition duration-200 sm:rounded-[1.75rem]",
        open
          ? "border-foreground/15"
          : "border-border/60 hover:border-foreground/10",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3.5 text-left sm:gap-4 sm:px-6 sm:py-4"
      >
        <span className="flex min-w-0 items-center gap-3 sm:gap-4">
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-background/80 text-muted-foreground shadow-sm sm:size-10 sm:rounded-2xl">
            <ShieldCheck className="size-4" />
          </span>

          <span className="min-w-0">
            <span className="block text-base font-semibold tracking-tight">
              Review this problem
            </span>
            <span className="mt-0.5 block text-sm text-muted-foreground">
              Update the review status for this problem
            </span>
          </span>
        </span>

        <span className="flex items-center gap-3">
          <span
            className={cn(
              "hidden items-center rounded-full border px-2.5 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.16em] sm:inline-flex",
              review.badgeClassName,
            )}
          >
            {review.label}
          </span>
          <ChevronIcon open={open} />
        </span>
      </button>

      <AnimatedCollapse open={open} id={panelId}>
        <div className="border-t border-border/60 px-4 pb-4 pt-4 sm:px-6 sm:pb-5">
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
                ref={passwordInputRef}
                defaultValue=""
                onChange={(e) => {
                  const val = e.target.value;
                  passwordRef.current = val;
                  const hasVal = val.length > 0;
                  if (hasVal !== hasPassword) {
                    setHasPassword(hasVal);
                  }
                }}
                placeholder="Review password"
                className="h-10 rounded-xl border-input bg-background/65 px-4 text-base shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] placeholder:text-muted-foreground md:text-sm"
              />
            </div>

            <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center">
              <Button
                type="submit"
                size="sm"
                variant="outline"
                disabled={isPending || !hasPassword}
                className="h-10 w-full rounded-xl border-emerald-500/25 bg-emerald-500/10 px-4 text-emerald-700 shadow-sm hover:bg-emerald-500/15 hover:text-emerald-800 disabled:border-emerald-500/10 disabled:bg-emerald-500/10 disabled:text-emerald-700/55 sm:w-auto dark:text-emerald-200 dark:hover:text-emerald-100 dark:disabled:text-emerald-200/55"
              >
                {pendingAction === "VERIFIED"
                  ? "Verifying..."
                  : "Mark verified"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isPending || !hasPassword}
                className="h-10 w-full rounded-xl border-rose-500/25 bg-rose-500/10 px-4 text-rose-700 shadow-sm hover:bg-rose-500/15 hover:text-rose-800 disabled:border-rose-500/10 disabled:bg-rose-500/10 disabled:text-rose-700/55 sm:w-auto dark:text-rose-200 dark:hover:text-rose-100 dark:disabled:text-rose-200/55"
                onClick={() => handleReview("INCORRECT")}
              >
                {pendingAction === "INCORRECT"
                  ? "Marking..."
                  : "Mark incorrect"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isPending || !hasPassword}
                className="h-10 w-full rounded-xl border-sky-500/25 bg-sky-500/10 px-4 text-sky-700 shadow-sm hover:bg-sky-500/15 hover:text-sky-800 disabled:border-sky-500/10 disabled:bg-sky-500/10 disabled:text-sky-700/55 sm:w-auto dark:text-sky-200 dark:hover:text-sky-100 dark:disabled:text-sky-200/55"
                onClick={handleRegenerate}
              >
                {pendingAction === "REGENERATE" ? "Queueing..." : "Regenerate"}
              </Button>
            </div>
          </form>

          {error && (
            <p
              role="alert"
              className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-200"
            >
              {error}
            </p>
          )}
        </div>
      </AnimatedCollapse>
    </div>
  );
}
