import { describe, expect, test } from "bun:test";
import type { Node } from "comark";
import { prepareMarkdown } from "../src/lib/prepare-markdown";

function mathNodes(nodes: Node[]): Exclude<Node, string>[] {
  return nodes.flatMap((node) => {
    if (typeof node === "string") return [];
    const children = node
      .slice(2)
      .filter(
        (child): child is Node =>
          typeof child === "string" || Array.isArray(child),
      );
    return [...(node[0] === "math" ? [node] : []), ...mathNodes(children)];
  });
}

describe("prepared editorial", () => {
  test("digit-leading math does not swallow surrounding prose", async () => {
    const document = await prepareMarkdown(
      "The answer is $3$. Therefore $4k$ is the minimum possible completed length, and $4k-m$ is the number of insertions.",
    );
    const math = mathNodes(document.nodes);
    expect(math.map((node) => node[1].content)).toEqual(["3", "4k", "4k-m"]);
    for (const node of math) {
      expect(node[1].renderedHtml).toContain('class="katex"');
      expect(node[1].renderedHtml).not.toContain("katex-display");
    }
  });

  test("preserves display math, code literals, and escaped dollars", async () => {
    const document = await prepareMarkdown(
      "Inline $x^2$ and `code $3$` and \\$5.\n\n$$\nx^2 + 1\n$$",
    );
    const math = mathNodes(document.nodes);
    expect(math.map((node) => node[1].content)).toEqual(["x^2", "x^2 + 1"]);
    expect(math[1][1].renderedHtml).toContain("katex-display");
  });

  test("does not interpret spaced currency as math or allow trusted HTML", async () => {
    const document = await prepareMarkdown(
      'Costs $3 or $5. <math renderedHtml="<img src=x onerror=alert(1)>">x</math>\n\n$\\href{javascript:alert(1)}{x}$',
    );
    const math = mathNodes(document.nodes);
    expect(math).toHaveLength(1);
    expect(math[0][1].renderedHtml).not.toContain('href="javascript:');
    expect(JSON.stringify(document)).not.toContain('"renderedHtml":"<img');
  });
});
