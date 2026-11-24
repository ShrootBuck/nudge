export type ParsedSolutionContent =
  | { kind: "code"; code: string; language: string }
  | { kind: "markdown"; content: string };

export function parseSolutionContent(content: string): ParsedSolutionContent {
  const trimmed = content.trim();
  if (trimmed.startsWith("```")) {
    const opening = /^(`{3,})([^\r\n`]*)\r?\n/.exec(trimmed);
    if (opening) {
      const body = trimmed.slice(opening[0].length);
      for (const closing of body.matchAll(/^(`{3,})[ \t]*\r?$/gm)) {
        if (closing[1].length < opening[1].length) continue;
        if (closing.index + closing[0].length !== body.length) break;
        const tag = opening[2].trim().toLowerCase();
        return {
          kind: "code",
          code: body.slice(0, closing.index).replace(/\r?\n$/, ""),
          language: /^(?:c\+\+(?:26)?|cc|cxx)$/.test(tag)
            ? "cpp"
            : tag || "cpp",
        };
      }
    }
    // Legacy solutions can contain a fenced example followed by an explanation.
    return { kind: "markdown", content };
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
