import { type MarkdownDocument, type Node, parseMarkdown } from "comark";
import katex from "katex";
import { markdownOptions, markdownPlugins } from "./markdown";

// Run on the server when saving content (or preparing a legacy row once).
export async function prepareMarkdown(
  content: string,
): Promise<MarkdownDocument> {
  const document = await parseMarkdown(content, {
    ...markdownOptions,
    plugins: markdownPlugins,
  });

  function visit(node: Node) {
    if (typeof node === "string") return;
    if (node[0] === "math") {
      // Only inject HTML produced by KaTeX after the Markdown security pass.
      node[1].renderedHtml = katex.renderToString(
        String(node[1].content ?? ""),
        {
          displayMode: !String(node[1].class ?? "").includes("inline"),
          throwOnError: false,
          trust: false,
        },
      );
    }
    for (const child of node.slice(2)) {
      if (typeof child === "string" || Array.isArray(child)) visit(child);
    }
  }

  for (const node of document.nodes) visit(node);
  return document;
}
