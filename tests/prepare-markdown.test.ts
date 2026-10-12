import { describe, expect, test } from "bun:test";
import { type Node, parseMarkdown } from "comark";
import { markdownOptions, markdownPlugins } from "../src/lib/markdown";
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

  const boxedCases = String.raw`\boxed{
g(S)=
\begin{cases}
0,&S\text{ is a palindrome},\\
P(S)\oplus b\oplus(R\bmod2),&\text{otherwise}.
\end{cases}}`;

  for (const openingNewline of [false, true]) {
    for (const closingNewline of [false, true]) {
      test(`preserves multiline math with delimiter newlines ${openingNewline}/${closingNewline}`, async () => {
        const source = `Then\n$$${openingNewline ? "\n" : ""}${boxedCases}${closingNewline ? "\n" : ""}$$\n\nAfterwards.`;
        const document = await prepareMarkdown(source);
        const math = mathNodes(document.nodes);
        expect(math).toHaveLength(1);
        expect(math[0][1].content).toBe(boxedCases);
        expect(math[0][1].renderedHtml).toContain("katex-display");
        expect(math[0][1].renderedHtml).not.toContain("katex-error");
        expect(document.nodes).toHaveLength(3);
        expect(document.nodes[0]).toEqual(["p", {}, "Then"]);
        expect(document.nodes[2]).toEqual(["p", {}, "Afterwards."]);

        // The browser fallback uses the same parser options and plugins.
        const clientDocument = await parseMarkdown(source, {
          ...markdownOptions,
          plugins: markdownPlugins,
        });
        expect(mathNodes(clientDocument.nodes)[0][1].content).toBe(boxedCases);
        expect(clientDocument.nodes).toHaveLength(3);
      });
    }
  }

  test("renders the other multiline cases from 2271H2 without losing boundary lines", async () => {
    const expressions = [
      String.raw`g(V)=\begin{cases}
2,&h(U_1)\ne h(U_2),\\
1\oplus P(V)\oplus h(U_1),&h(U_1)=h(U_2).
\end{cases}`,
      String.raw`\boxed{h(S)=\begin{cases}
P(S),&h(A)=h(C)\ne h(B),\\
h(B),&\text{otherwise}.
\end{cases}}\tag{*}`,
    ];
    const document = await prepareMarkdown(
      expressions.map((expression) => `$$${expression}$$`).join("\n\n"),
    );
    const math = mathNodes(document.nodes);
    expect(math.map((node) => node[1].content)).toEqual(expressions);
    for (const node of math) {
      expect(node[1].renderedHtml).toContain("katex-display");
      expect(node[1].renderedHtml).not.toContain("katex-error");
    }
  });

  test("preserves math inside blockquotes and lists", async () => {
    const document = await prepareMarkdown(
      "> $$x +\n> y$$\n\n- Formula:\n\n  $$a +\n  b$$\n\nOutside.",
    );
    expect(mathNodes(document.nodes).map((node) => node[1].content)).toEqual([
      "x +\ny",
      "a +\nb",
    ]);
    expect(document.nodes.at(-1)).toEqual(["p", {}, "Outside."]);
  });

  test("leaves code examples and unfinished math literal", async () => {
    const document = await prepareMarkdown(
      "```text\n$$x +\ny$$\n```\n\n`$$x$$`\n\n$$unfinished\n\nAfterwards.",
    );
    expect(mathNodes(document.nodes)).toHaveLength(0);
    expect(JSON.stringify(document)).toContain("$$unfinished");
    expect(document.nodes.at(-1)).toEqual(["p", {}, "Afterwards."]);
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
