import { describe, expect, test } from "bun:test";
import {
  PREPARED_CONTENT_VERSION,
  type ProblemContentSource,
  preparedContentJson,
  prepareProblemContent,
  readPreparedContent,
} from "../src/lib/prepared-content";

const source: ProblemContentSource = {
  hints: [
    { order: 2, content: "Then use $x^2$." },
    { order: 1, content: "Start with $n$." },
  ],
  editorial: "## Proof\n\n$$a^2 + b^2 = c^2$$",
  solution: '#include <iostream>\nint main() { std::cout << "```"; }',
};

describe("persisted problem preparation", () => {
  test("round-trips through JSON with rendered math and code, regardless of hint input order", async () => {
    const prepared = await prepareProblemContent(source);
    const saved = preparedContentJson(prepared);
    expect(readPreparedContent(saved, source)).toEqual(prepared);
    expect(
      readPreparedContent(saved, {
        ...source,
        hints: [...source.hints].reverse(),
      }),
    ).toEqual(prepared);
    expect(prepared.hints.map((hint) => hint.order)).toEqual([1, 2]);
    expect(prepared.editorial).toBeString();
    for (const html of [
      ...prepared.hints.map((hint) => hint.html),
      prepared.editorial ?? "",
    ]) {
      expect(html).toMatch(/data-markdown="math(?:-display)?"/);
    }
    expect(prepared.hints[0].html).toContain('aria-label="n"');
    expect(prepared.solution).toContain(
      'data-markdown="code-block" data-language="cpp"',
    );
    expect(prepared.solution).toContain("```");
    expect(prepared.solution).toContain("light-dark(");
    expect(prepared.solution).toContain('data-code-action="download"');
  });

  test("rejects source edits, old renderer versions, and incomplete stored documents", async () => {
    const prepared = await prepareProblemContent(source);
    for (const edited of [
      { ...source, hints: [{ order: 1, content: "Changed hint" }] },
      { ...source, editorial: "Changed editorial" },
      { ...source, solution: "int main() { return 1; }" },
      { ...source, editorial: null },
    ]) {
      expect(readPreparedContent(prepared, edited)).toBeNull();
    }
    for (const stale of [
      null,
      { ...prepared, version: PREPARED_CONTENT_VERSION - 1 },
      { ...prepared, hints: [] },
      { ...prepared, editorial: null },
      { ...prepared, solution: { nodes: "invalid" } },
      {
        ...prepared,
        hints: prepared.hints.map((hint) => ({ ...hint, html: 1 })),
      },
    ]) {
      expect(readPreparedContent(stale, source)).toBeNull();
    }
  });

  test("prepares prose solutions and sanitizes content before persisting HTML", async () => {
    const prepared = await prepareProblemContent({
      hints: [],
      editorial:
        "<script>alert(1)</script>\n\n$\\href{javascript:alert(1)}{x}$",
      solution: "```cpp\nint main() {}\n```\n\nThe answer is $3$.",
    });
    const html = `${prepared.editorial}${prepared.solution}`;
    expect(html).not.toContain("<script");
    expect(html).not.toContain('href="javascript:');
    expect(html.match(/data-markdown="math"/g)).toHaveLength(2);
    expect(prepared.solution).toContain('data-language="cpp"');
  });
});
