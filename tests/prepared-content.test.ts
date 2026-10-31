import { describe, expect, test } from "bun:test";
import assert from "node:assert/strict";
import type { Node } from "comark";
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

function descendants(nodes: Node[]): Exclude<Node, string>[] {
  return nodes.flatMap((node) => {
    if (typeof node === "string") return [];
    return [
      node,
      ...descendants(
        node
          .slice(2)
          .filter(
            (child): child is Node =>
              typeof child === "string" || Array.isArray(child),
          ),
      ),
    ];
  });
}

describe("persisted problem preparation", () => {
  test("round-trips through JSON with prepared math and code, regardless of hint input order", async () => {
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
    assert(prepared.editorial);
    for (const document of [
      ...prepared.hints.map((hint) => hint.document),
      prepared.editorial,
    ]) {
      const math = descendants(document.nodes).filter(
        (node) => node[0] === "math",
      );
      expect(math.length).toBeGreaterThan(0);
      for (const node of math)
        expect(node[1].renderedHtml).toContain('class="katex"');
    }
    expect(prepared.solution?.nodes[0][0]).toBe("pre");
    expect(JSON.stringify(prepared.solution)).toContain("```");
    expect(JSON.stringify(prepared.solution)).toContain("--shiki-dark");
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
    ]) {
      expect(readPreparedContent(stale, source)).toBeNull();
    }
  });

  test("prepares prose solutions and sanitizes content before persisting math HTML", async () => {
    const prepared = await prepareProblemContent({
      hints: [],
      editorial:
        "<script>alert(1)</script>\n\n$\\href{javascript:alert(1)}{x}$",
      solution: "```cpp\nint main() {}\n```\n\nThe answer is $3$.",
    });
    const nodes = descendants([
      ...(prepared.editorial?.nodes ?? []),
      ...(prepared.solution?.nodes ?? []),
    ]);
    expect(nodes.some((node) => node[0] === "script")).toBe(false);
    const math = nodes.filter((node) => node[0] === "math");
    expect(math).toHaveLength(2);
    for (const node of math) {
      expect(node[1].renderedHtml).toBeString();
      expect(node[1].renderedHtml).not.toContain('href="javascript:');
    }
  });
});
