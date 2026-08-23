import { describe, expect, test } from "bun:test";
import { type MarkdownDocument, type Node, parseMarkdown } from "comark";
import { markdownOptions, markdownPlugins } from "../src/lib/markdown";

function elements(document: MarkdownDocument) {
  const result: Exclude<Node, string>[] = [];

  function visit(node: Node) {
    if (typeof node === "string") return;
    result.push(node);
    for (const child of node.slice(2)) {
      if (typeof child === "string" || Array.isArray(child)) visit(child);
    }
  }

  for (const node of document.nodes) visit(node);
  return result;
}

describe("generated Markdown security", () => {
  test("does not parse raw HTML, remote images, or unsafe links", async () => {
    const document = await parseMarkdown(
      [
        '<script src="https://example.com/evil.js"></script>',
        '<iframe src="https://example.com"></iframe>',
        "![tracker](https://example.com/pixel.gif)",
        "[unsafe](javascript:alert(1))",
        "[safe](https://codeforces.com)",
      ].join("\n\n"),
      { ...markdownOptions, plugins: markdownPlugins },
    );
    const parsedElements = elements(document);
    const tags = parsedElements.map((node) => node[0]);
    const links = parsedElements.filter((node) => node[0] === "a");

    expect(tags).not.toContain("script");
    expect(tags).not.toContain("iframe");
    expect(tags).not.toContain("img");
    expect(links.some((node) => node[1].href === "javascript:alert(1)")).toBe(
      false,
    );
    expect(
      links.some((node) => node[1].href === "https://codeforces.com"),
    ).toBe(true);
  });
});
