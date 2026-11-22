import { describe, expect, test } from "bun:test";
import { renderMarkdown } from "../src/lib/markdown";

const render = (source: string) =>
  renderMarkdown(source, { idPrefix: "test-" });

function mathLabels(html: string) {
  return [
    ...html.matchAll(
      /<svg[^>]*data-markdown="(math(?:-display)?)"[^>]*aria-label="([^"]*)"/g,
    ),
  ].map(([, kind, label]) => ({
    kind,
    tex: label.replaceAll("&amp;", "&").trim(),
  }));
}

describe("Markdown rendering", () => {
  test("digit-leading math does not swallow surrounding prose", () => {
    const html = render(
      "The answer is $3$. Therefore $4k$ is the minimum possible completed length, and $4k-m$ is the number of insertions.",
    );
    expect(mathLabels(html)).toEqual([
      { kind: "math", tex: "3" },
      { kind: "math", tex: "4k" },
      { kind: "math", tex: "4k-m" },
    ]);
    expect(html).toContain("is the minimum possible completed length, and");
  });

  test("preserves display math, code literals, and escaped dollars", () => {
    const html = render(
      "Inline $x^2$ and `code $3$` and \\$5.\n\n$$\nx^2 + 1\n$$",
    );
    expect(mathLabels(html)).toEqual([
      { kind: "math", tex: "x^2" },
      { kind: "math-display", tex: "x^2 + 1" },
    ]);
    expect(html).toContain('<code data-markdown="code">code $3$</code>');
    expect(html).toContain("and $5.");
  });

  test("wraps display math in a horizontal scroller", () => {
    const html = render("$$\\sum_{i=1}^{n} a_i$$");
    expect(html).toContain(
      '<span data-math-scroll><svg xmlns="http://www.w3.org/2000/svg" data-markdown="math-display"',
    );
  });

  const boxedCases = String.raw`\boxed{
g(S)=
\begin{cases}
0,&S\text{ is a palindrome},\\
P(S)\oplus b\oplus(R\bmod2),&\text{otherwise}.
\end{cases}}`;

  for (const openingNewline of [false, true]) {
    for (const closingNewline of [false, true]) {
      test(`renders multiline math with delimiter newlines ${openingNewline}/${closingNewline}`, () => {
        const html = render(
          `Then\n$$${openingNewline ? "\n" : ""}${boxedCases}${closingNewline ? "\n" : ""}$$\n\nAfterwards.`,
        );
        const math = mathLabels(html);
        expect(math).toHaveLength(1);
        expect(math[0]).toEqual({ kind: "math-display", tex: boxedCases });
        expect(html).toContain("Then");
        expect(html).toContain('<p data-markdown="p">Afterwards.</p>');
        // Words colors unknown commands; every command here is supported.
        expect(html).not.toMatch(/<text[^>]*fill=/);
      });
    }
  }

  test("preserves math inside blockquotes and lists", () => {
    const html = render(
      "> $$x +\n> y$$\n\n- Formula:\n\n  $$a +\n  b$$\n\nOutside.",
    );
    expect(mathLabels(html).map(({ tex }) => tex)).toEqual([
      "x +\ny",
      "a +\nb",
    ]);
    expect(html).toContain('<p data-markdown="p">Outside.</p>');
  });

  test("leaves code examples, currency, and unfinished math literal", () => {
    const html = render(
      "```text\n$$x +\ny$$\n```\n\n`$$x$$`\n\nCosts $3 or $5.\n\n$$unfinished\n\nAfterwards.",
    );
    expect(mathLabels(html)).toHaveLength(0);
    expect(html).toContain("Costs $3 or $5.");
    expect(html).toContain("$$unfinished");
    expect(html).toContain('<p data-markdown="p">Afterwards.</p>');
  });

  test("highlights code for both color schemes with copy and download controls", () => {
    const source = "```cpp\nint main() { return 0; }\n```";
    const html = render(source);
    expect(html).toContain('data-markdown="code-block" data-language="cpp"');
    expect(html).toContain("light-dark(");
    expect(html).toContain('<div data-markdown="code-header"><span>C++</span>');
    expect(html).toContain('data-code-action="copy"');
    expect(html).toContain('data-icon="copy"');
    expect(html).not.toContain('data-code-action="download"');

    const solution = renderMarkdown(source, {
      idPrefix: "solution-",
      download: true,
    });
    expect(solution).toContain('data-code-action="download"');
    expect(solution).toContain('data-icon="download"');
  });

  test("renders GitHub Flavored Markdown tables", () => {
    const html = render("| n | answer |\n|---|---|\n| 1 | 2 |");
    expect(html).toContain('<table data-markdown="table">');
    expect(html).toContain('<td data-markdown="td">2</td>');
  });
});
