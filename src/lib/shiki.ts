import { codeToHtml } from "shiki";

export const SHIKI_LIGHT_THEME = "github-light-default";
export const SHIKI_DARK_THEME = "github-dark-default";

export async function highlightCodeHtml(
  code: string,
  language: string,
  theme: typeof SHIKI_LIGHT_THEME | typeof SHIKI_DARK_THEME,
) {
  return codeToHtml(code, {
    lang: language,
    theme,
  });
}
