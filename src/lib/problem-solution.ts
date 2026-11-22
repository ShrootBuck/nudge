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

// Match the whole program so globals with initializers or a custom setIO()
// that actually performs work are never mistaken for an empty entry point.
export function isEmptyCppSolution(source: string) {
  const compact = source
    .replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, "");
  const program = compact
    .replace(/^#include<bits\/stdc\+\+\.h>/, "")
    .replace(/^usingnamespacestd;/, "")
    .replace(/^usingll=longlong;/, "")
    .replace(
      /^voidsetIO\(\)\{ios::sync_with_stdio\(false\);cin.tie\(nullptr\);\}/,
      "",
    );
  return /^(?:int|signed)main\((?:void)?\)\{(?:setIO\(\);)?(?:return0;)?\}$/.test(
    program,
  );
}
