import type { RunState } from "@prisma/client";
import { BadgeCheck, Ban, LoaderCircle, ShieldAlert, X } from "lucide-react";
import type { ComponentType } from "react";

export type ReviewStatus =
  | "UNREVIEWED"
  | "VERIFIED"
  | "INCORRECT"
  | "UNSOLVABLE";

export type ReviewOutcome = Exclude<ReviewStatus, "UNREVIEWED">;

export type ProblemView = {
  id: string;
  contestId: number;
  index: string;
  name: string;
  rating: number | null;
  tags: string[];
  reviewStatus: ReviewStatus;
  runState: RunState;
  modelDisplayName: string | null;
  hints: { id: string; order: number; content: string }[];
  editorial: { id: string; content: string } | null;
  solution: {
    id: string;
    content: string;
    preHighlightedHtml?: { light: string; dark: string } | null;
  } | null;
};

export const HINT_LABELS = [
  "A gentle nudge",
  "Getting warmer",
  "On the right track",
  "Almost there",
  "The key insight",
];

type GenerationState = {
  icon: ComponentType<{ className?: string }>;
  label: string;
  description: string;
  className: string;
  animate: boolean;
};

type ReviewState = {
  icon: ComponentType<{ className?: string }>;
  label: string;
  badgeClassName: string;
  panelClassName: string;
  summary: string;
};

export function resolveProblemRunState(problem: {
  runState: RunState;
}): RunState {
  return problem.runState;
}

export function generationState(status: RunState): GenerationState {
  switch (status) {
    case "RUNNING":
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

export function reviewState(status: ReviewStatus): ReviewState {
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
    case "INCORRECT":
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
    case "UNSOLVABLE":
      return {
        icon: Ban,
        label: "Unsolvable",
        badgeClassName:
          "border-amber-500/20 bg-amber-500/10 text-amber-300 dark:text-amber-200",
        panelClassName:
          "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-200",
        summary:
          "This problem has been marked as currently unsolvable by AI. The model may claim a solution, but it does not reliably pass.",
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

export function solutionSectionDescription(reviewStatus: ReviewStatus) {
  switch (reviewStatus) {
    case "VERIFIED":
      return "This is the full implementation that was manually checked.";
    case "INCORRECT":
      return "This implementation is currently marked incorrect. Open it if you want to inspect what went wrong.";
    case "UNSOLVABLE":
      return "This problem is currently unsolvable by AI. The implementation below may not be correct.";
    default:
      return "This is the full implementation the model produced for the problem.";
  }
}
