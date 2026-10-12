import type { ComarkPlugin } from "comark";

type InlineState = {
  src: string;
  pos: number;
  posMax: number;
  push(
    type: string,
    tag: string,
    nesting: number,
  ): { content: string; markup: string };
};

type BlockState = {
  src: string;
  bMarks: number[];
  eMarks: number[];
  tShift: number[];
  sCount: number[];
  blkIndent: number;
  line: number;
  push(
    type: string,
    tag: string,
    nesting: number,
  ): { content: string; markup: string; block: boolean; map: number[] };
};

export const mathParserFixes: ComarkPlugin = {
  name: "math-parser-fixes",
  markdownItPlugins: [
    (md) => {
      // Comark 0.6.2 (also 0.7.0) drops both delimiter lines in multiline
      // blocks, even when they contain LaTeX. Preserve those fragments too.
      // https://github.com/comarkdown/comark/blob/main/packages/comark/src/plugins/math.ts
      md.block.ruler.at(
        "math_block",
        (
          state: BlockState,
          startLine: number,
          endLine: number,
          silent: boolean,
        ) => {
          const start = state.bMarks[startLine] + state.tShift[startLine];
          if (state.src.slice(start, start + 2) !== "$$") return false;

          const lines: string[] = [];
          for (let line = startLine; line < endLine; line++) {
            const lineStart = state.bMarks[line] + state.tShift[line];
            const lineEnd = state.eMarks[line];
            if (
              line > startLine &&
              lineStart < lineEnd &&
              state.sCount[line] < state.blkIndent
            ) {
              return false;
            }

            const text = state.src.slice(
              line === startLine ? start + 2 : lineStart,
              lineEnd,
            );
            const close = text.indexOf("$$");
            if (close === -1) {
              lines.push(text);
              continue;
            }

            if (silent) return true;
            lines.push(text.slice(0, close));
            const token = state.push("math_block", "div", 0);
            token.content = lines.join("\n").trim();
            token.markup = "$$";
            token.block = true;
            token.map = [startLine, line + 1];
            state.line = line + 1;
            return true;
          }
          return false;
        },
        { alt: ["paragraph", "reference", "blockquote", "list"] },
      );

      // Comark 0.6 rejects every digit-leading expression as currency, then
      // pairs subsequent delimiters incorrectly. Use tight $...$ delimiters.
      md.inline.ruler.at(
        "math_inline",
        (state: InlineState, silent: boolean) => {
          const start = state.pos;
          if (state.src[start] !== "$" || state.src[start + 1] === "$")
            return false;
          if (!state.src[start + 1] || /\s/.test(state.src[start + 1]))
            return false;

          for (let end = start + 1; end < state.posMax; end++) {
            if (state.src[end] === "\n") return false;
            if (state.src[end] !== "$") continue;
            let backslashes = 0;
            for (let i = end - 1; i > start && state.src[i] === "\\"; i--)
              backslashes++;
            if (backslashes % 2 === 1) continue;
            if (state.src[end + 1] === "$" || /\s/.test(state.src[end - 1]))
              return false;
            if (!silent) {
              const token = state.push("math_inline", "math", 0);
              token.content = state.src.slice(start + 1, end);
              token.markup = "$";
            }
            state.pos = end + 1;
            return true;
          }
          return false;
        },
      );
    },
  ],
};
