import { describe, expect, test } from "bun:test";
import { renderMarkdown } from "../src/lib/markdown";

const render = (source: string) =>
  renderMarkdown(source, { idPrefix: "test-" });

describe("generated Markdown security", () => {
  test("drops raw HTML, remote images, and unsafe links", () => {
    const html = render(
      [
        '<script src="https://example.com/evil.js"></script>',
        '<iframe src="https://example.com"></iframe>',
        '<img src=x onerror="alert(1)">',
        "![tracker](https://example.com/pixel.gif)",
        "[unsafe](javascript:alert(1))",
        "[data](data:text/html,<script>alert(1)</script>)",
        "[protocol-relative](//evil.example)",
        "[safe](https://codeforces.com)",
        "[mail](mailto:hi@example.com)",
        "[internal](/problem/1/A)",
      ].join("\n\n"),
    );

    expect(html).not.toContain("<script");
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("pixel.gif");
    expect(html).not.toContain('href="javascript:');
    expect(html).not.toContain('href="data:');
    expect(html).not.toContain('href="//evil.example"');
    expect(html).toContain(
      '<a target="_blank" rel="noreferrer noopener" data-markdown="a" href="https://codeforces.com">',
    );
    expect(html).toContain('href="mailto:hi@example.com"');
    expect(html).toContain('<a data-markdown="a" href="/problem/1/A">');
  });

  test("math cannot inject links or markup", () => {
    const html = render(
      '$\\href{javascript:alert(1)}{x}$ <math renderedHtml="<img src=x onerror=alert(1)>">x</math>',
    );
    expect(html).not.toContain('href="javascript:');
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<math");
  });

  test("scopes footnote anchors to the document", () => {
    const html = render("Claim.[^1]\n\n[^1]: Source.");
    expect(html).toContain('href="#test-fn-1"');
    expect(html).toContain('id="test-fn-1"');
  });
});
