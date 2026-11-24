import pierreDark from "@pierre/highlights/themes/pierre-dark";
import pierreLight from "@pierre/highlights/themes/pierre-light";
import { createHighlightsPlugin } from "@pierre/words/highlights";
import { createHtmlRenderer } from "@pierre/words/html";

// Light and dark colors ship in one pass via CSS light-dark(), which follows
// the `color-scheme` that the theme script sets on <html>.
const highlighter = createHighlightsPlugin({
  themes: { light: pierreLight, dark: pierreDark },
  defaultColor: "light-dark()",
});

// Use related grammars for shared tokens while keeping the submission's own
// language in the header, clipboard, and download controls.
const fallbackGrammars = new Map([
  ["qsharp", "csharp"],
  ["q#", "csharp"],
  ["qs", "csharp"],
  ["pike", "c"],
]);
const code: typeof highlighter = {
  highlight(options) {
    const html = highlighter.highlight(options);
    if (html !== null) return html;
    const language = fallbackGrammars.get(options.language.toLowerCase());
    return language ? highlighter.highlight({ ...options, language }) : null;
  },
};

// Lucide's copy, check, and download glyphs, inlined so the server-rendered
// buttons need no client-side React to look finished.
const icon = (name: string, paths: string) =>
  `<svg data-icon="${name}" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const copyIcon = icon(
  "copy",
  '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
);
const checkIcon = icon("check", '<path d="M20 6 9 17l-5-5"/>');
const downloadIcon = icon(
  "download",
  '<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>',
);

const SAFE_ABSOLUTE_URL = /^(?:https?:\/\/|mailto:)/i;

// Generated Markdown is untrusted: keep web and mail links plus in-page
// anchors (footnotes), and drop every other scheme.
function urlTransform(url: string) {
  const trimmed = url.trim();
  if (SAFE_ABSOLUTE_URL.test(trimmed)) return trimmed;
  if (trimmed.startsWith("#")) return trimmed;
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return trimmed;
  return null;
}

const components = {
  a(html: string) {
    return /^<a\b[^>]*\bhref="https?:/i.test(html)
      ? html.replace(/^<a\b/, '<a target="_blank" rel="noreferrer noopener"')
      : html;
  },
  button(html: string) {
    const download = html.includes('data-code-action="download"');
    const label = download ? "Download" : "Copy";
    return html.replace(
      /^(<button\b[^>]*>)[\s\S]*<\/button>$/,
      `$1${download ? downloadIcon : copyIcon + checkIcon}<span>${label}</span></button>`,
    );
  },
  // Wide display formulas scroll sideways instead of squeezing or overflowing.
  // A span keeps the wrapper valid inside paragraphs.
  svg(html: string) {
    return html.includes('data-markdown="math-display"')
      ? `<span data-math-scroll>${html}</span>`
      : html;
  },
};

export type MarkdownRenderOptions = {
  /** Unique per document on a page, so footnote anchors do not collide. */
  idPrefix: string;
  /** Show a download button on code blocks (copy is always available). */
  download?: boolean;
};

// Server-only: Words and Highlights run as WebAssembly here, and the browser
// receives finished HTML, so neither module ships in the client bundle.
export function renderMarkdown(
  source: string,
  { idPrefix, download = false }: MarkdownRenderOptions,
): string {
  const renderer = createHtmlRenderer({
    math: true,
    plugins: { code },
    components,
    controls: { code: { copy: true, download } },
    lineNumbers: true,
    // Remote images could be used as trackers; generated content never needs them.
    disallowedElements: ["img"],
    urlTransform,
    idPrefix,
  });
  try {
    return renderer
      .render(source, false)
      .html.replace(
        CODE_HEADER_LANGUAGE,
        (_, open: string, language: string) =>
          `${open}${LANGUAGE_LABELS[language.toLowerCase()] ?? language}</span>`,
      );
  } finally {
    renderer.dispose();
  }
}

// Words labels code blocks with the raw (already escaped) fence language.
const CODE_HEADER_LANGUAGE =
  /(<div data-markdown="code-header"><span>)([^<]*)<\/span>/g;

const LANGUAGE_LABELS: Record<string, string> = {
  bash: "Shell",
  c: "C",
  "c++": "C++",
  cpp: "C++",
  java: "Java",
  javascript: "JavaScript",
  js: "JavaScript",
  json: "JSON",
  kotlin: "Kotlin",
  pike: "Pike",
  plaintext: "Text",
  py: "Python",
  python: "Python",
  "q#": "Q#",
  qs: "Q#",
  qsharp: "Q#",
  rust: "Rust",
  sh: "Shell",
  shell: "Shell",
  text: "Text",
  ts: "TypeScript",
  txt: "Text",
  typescript: "TypeScript",
};
