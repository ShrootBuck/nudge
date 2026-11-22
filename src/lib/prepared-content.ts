import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { renderMarkdown } from "./markdown";
import { parseSolutionContent } from "./problem-solution";

// Bump whenever the parser, sanitizer, math renderer, or highlighting output changes.
// Version 3 stores HTML rendered by Pierre Words and Highlights.
export const PREPARED_CONTENT_VERSION = 3;

export type ProblemContentSource = {
  hints: { order: number; content: string }[];
  editorial: string | null;
  solution: string | null;
};

export type PreparedProblemContent = {
  version: number;
  sourceHash: string;
  hints: { order: number; html: string }[];
  editorial: string | null;
  solution: string | null;
};

function orderedHints(source: ProblemContentSource) {
  return [...source.hints].sort((a, b) => a.order - b.order);
}

function contentHash(source: ProblemContentSource) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        hints: orderedHints(source).map(({ order, content }) => [
          order,
          content,
        ]),
        editorial: source.editorial,
        solution: source.solution,
      }),
    )
    .digest("hex");
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isHtml(value: unknown): value is string {
  return typeof value === "string";
}

export function readPreparedContent(
  value: unknown,
  source: ProblemContentSource,
): PreparedProblemContent | null {
  if (
    !isObject(value) ||
    value.version !== PREPARED_CONTENT_VERSION ||
    value.sourceHash !== contentHash(source) ||
    !Array.isArray(value.hints)
  ) {
    return null;
  }

  const hints = orderedHints(source);
  if (
    value.hints.length !== hints.length ||
    !value.hints.every(
      (hint, index) =>
        isObject(hint) &&
        hint.order === hints[index].order &&
        isHtml(hint.html),
    ) ||
    !(source.editorial === null
      ? value.editorial === null
      : isHtml(value.editorial)) ||
    !(source.solution === null
      ? value.solution === null
      : isHtml(value.solution))
  ) {
    return null;
  }

  // This envelope is written only by our server renderer, never accepted from clients.
  return value as PreparedProblemContent;
}

function prepareSolution(content: string) {
  const parsed = parseSolutionContent(content);
  if (parsed.kind === "markdown") {
    return renderMarkdown(parsed.content, {
      idPrefix: "solution-",
      download: true,
    });
  }

  // Code can itself contain Markdown fences (for example, inside a C++ string).
  let longestFence = 2;
  for (const match of parsed.code.matchAll(/`+/g)) {
    longestFence = Math.max(longestFence, match[0].length);
  }
  const fence = "`".repeat(longestFence + 1);
  return renderMarkdown(
    `${fence}${parsed.language}\n${parsed.code}\n${fence}`,
    {
      idPrefix: "solution-",
      download: true,
    },
  );
}

export async function prepareProblemContent(
  source: ProblemContentSource,
): Promise<PreparedProblemContent> {
  return {
    version: PREPARED_CONTENT_VERSION,
    sourceHash: contentHash(source),
    hints: orderedHints(source).map(({ order, content }) => ({
      order,
      html: renderMarkdown(content, { idPrefix: `hint-${order}-` }),
    })),
    editorial:
      source.editorial === null
        ? null
        : renderMarkdown(source.editorial, { idPrefix: "editorial-" }),
    solution:
      source.solution === null ? null : prepareSolution(source.solution),
  };
}

export function preparedContentJson(
  prepared: PreparedProblemContent,
): Prisma.InputJsonValue {
  // Normalize to exactly the JSON representation persisted in Postgres.
  return JSON.parse(JSON.stringify(prepared));
}
