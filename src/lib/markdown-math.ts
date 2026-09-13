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

// Comark 0.6 rejects every digit-leading expression as currency, then pairs
// subsequent delimiters incorrectly. Use tight $...$ delimiters for math.
export const inlineMathFix: ComarkPlugin = {
  name: "inline-math-fix",
  markdownItPlugins: [
    (md) => {
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
