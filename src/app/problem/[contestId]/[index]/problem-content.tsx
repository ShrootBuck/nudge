"use client";

import { ProblemContentBody } from "./problem-content-body";
import type { ProblemView } from "./problem-view-types";

export function ProblemContent({ problem }: { problem: ProblemView }) {
  return <ProblemContentBody problem={problem} />;
}
