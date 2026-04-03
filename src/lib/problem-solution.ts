export type ParsedSolutionContent =
  | { kind: "code"; code: string; language: string }
  | { kind: "markdown"; content: string };

const FENCED_CODE_BLOCK_PATTERN = /^\s*```([^\n`]*)?\n([\s\S]*?)\n```\s*$/;

export function parseSolutionContent(content: string): ParsedSolutionContent {
  const fencedCodeBlock = content.match(FENCED_CODE_BLOCK_PATTERN);

  if (fencedCodeBlock) {
    return {
      kind: "code",
      code: fencedCodeBlock[2],
      language: fencedCodeBlock[1]?.trim() || "cpp",
    };
  }

  if (content.trimStart().startsWith("```")) {
    return {
      kind: "markdown",
      content,
    };
  }

  return {
    kind: "code",
    code: content,
    language: "cpp",
  };
}
