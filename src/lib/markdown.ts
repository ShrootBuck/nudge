import math from "@comark/react/plugins/math";
import security from "@comark/react/plugins/security";
import shiki from "@comark/react/plugins/shiki";
import { transformerColorizedBrackets } from "@shikijs/colorized-brackets";
import bash from "@shikijs/langs/bash";
import cpp from "@shikijs/langs/cpp";
import python from "@shikijs/langs/python";
import oneDarkPro from "@shikijs/themes/one-dark-pro";
import oneLight from "@shikijs/themes/one-light";

// Generated Markdown is untrusted. Comark enables raw HTML and custom
// components by default, so opt in only to the syntax Nudge renders.
export const markdownOptions = {
  registerDefaultPlugins: false,
} as const;

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
  security({
    allowedTags: [
      "a",
      "blockquote",
      "br",
      "code",
      "em",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "hr",
      "li",
      "math",
      "ol",
      "p",
      "pre",
      "s",
      "span",
      "strong",
      "table",
      "tbody",
      "td",
      "th",
      "thead",
      "tr",
      "ul",
    ],
    allowedProtocols: ["http", "https", "mailto"],
    allowDataImages: false,
  }),
];
