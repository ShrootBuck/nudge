import math from "@comark/react/plugins/math";
import shiki from "@comark/react/plugins/shiki";
import bash from "@shikijs/langs/bash";
import cpp from "@shikijs/langs/cpp";
import python from "@shikijs/langs/python";
import githubDark from "@shikijs/themes/github-dark-default";
import githubLight from "@shikijs/themes/github-light-default";

// Shared Comark pipeline: used client-side (hints/editorials) and
// server-side (solution code blocks) so everything highlights identically.
export const markdownPlugins = [
  math(),
  shiki({
    registerDefaultLanguages: false,
    registerDefaultThemes: false,
    languages: [cpp, python, bash],
    themes: { light: githubLight, dark: githubDark },
    preStyles: true,
  }),
];
