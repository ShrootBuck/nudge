import math from "@comark/react/plugins/math";
import shiki from "@comark/react/plugins/shiki";
import { transformerColorizedBrackets } from "@shikijs/colorized-brackets";
import bash from "@shikijs/langs/bash";
import cpp from "@shikijs/langs/cpp";
import python from "@shikijs/langs/python";
import oneDarkPro from "@shikijs/themes/one-dark-pro";
import oneLight from "@shikijs/themes/one-light";

// Shared Comark pipeline: used client-side (hints/editorials) and
// server-side (solution code blocks) so everything highlights identically.
export const markdownPlugins = [
  math(),
  shiki({
    registerDefaultLanguages: false,
    registerDefaultThemes: false,
    languages: [cpp, python, bash],
    themes: { light: oneLight, dark: oneDarkPro },
    transformers: [transformerColorizedBrackets()],
    preStyles: true,
  }),
];
