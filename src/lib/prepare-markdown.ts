import { type MarkdownDocument, type Node, parseMarkdown } from "comark";
import { renderMath } from "comark/plugins/math";
import { markdownOptions, markdownPlugins } from "./markdown";

// Run inside the cached server data loader, before the reader opens a panel.
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
      node[1].renderedHtml = renderMath(
        String(node[1].content ?? ""),
        !String(node[1].class ?? "").includes("inline"),
      );
    }
    for (const child of node.slice(2)) {
      if (typeof child === "string" || Array.isArray(child)) visit(child);
    }
  }

  for (const node of document.nodes) visit(node);
  return document;
}
