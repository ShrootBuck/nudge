import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { MarkdownDocument } from "comark";
import { prepareMarkdown } from "./prepare-markdown";
import { parseSolutionContent } from "./problem-solution";

// Bump whenever the parser, sanitizer, math renderer, or highlighting output changes.
export const PREPARED_CONTENT_VERSION = 1;

export type ProblemContentSource = {
  hints: { order: number; content: string }[];
  editorial: string | null;
  solution: string | null;
};

export type PreparedProblemContent = {
  version: number;
  sourceHash: string;
  hints: { order: number; document: MarkdownDocument }[];
  editorial: MarkdownDocument | null;
  solution: MarkdownDocument | null;
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

function isDocument(value: unknown): value is MarkdownDocument {
  return (
    isObject(value) &&
    Array.isArray(value.nodes) &&
    isObject(value.frontmatter) &&
    isObject(value.meta)
  );
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
        isDocument(hint.document),
    ) ||
    !(source.editorial === null
      ? value.editorial === null
      : isDocument(value.editorial)) ||
    !(source.solution === null
      ? value.solution === null
      : isDocument(value.solution))
  ) {
    return null;
  }

  // This envelope is written only by our server renderer, never accepted from clients.
  return value as PreparedProblemContent;
}

async function prepareSolution(content: string) {
  const parsed = parseSolutionContent(content);
  if (parsed.kind === "markdown") return prepareMarkdown(parsed.content);

  // Code can itself contain Markdown fences (for example, inside a C++ string).
  let longestFence = 2;
  for (const match of parsed.code.matchAll(/`+/g)) {
    longestFence = Math.max(longestFence, match[0].length);
  }
  const fence = "`".repeat(longestFence + 1);
  return prepareMarkdown(
    `${fence}${parsed.language}\n${parsed.code}\n${fence}`,
  );
}

export async function prepareProblemContent(
  source: ProblemContentSource,
): Promise<PreparedProblemContent> {
  const [hints, editorial, solution] = await Promise.all([
    Promise.all(
      orderedHints(source).map(async ({ order, content }) => ({
        order,
        document: await prepareMarkdown(content),
      })),
    ),
    source.editorial === null ? null : prepareMarkdown(source.editorial),
    source.solution === null ? null : prepareSolution(source.solution),
  ]);
  return {
    version: PREPARED_CONTENT_VERSION,
    sourceHash: contentHash(source),
    hints,
    editorial,
    solution,
  };
}

export function preparedContentJson(
  prepared: PreparedProblemContent,
): Prisma.InputJsonValue {
  // Normalize the parser output to exactly the JSON representation persisted in Postgres.
  return JSON.parse(JSON.stringify(prepared));
}
