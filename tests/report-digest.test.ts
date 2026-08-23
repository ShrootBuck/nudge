import { describe, expect, test } from "bun:test";
import { chunkReportDigest } from "../src/lib/report-digest";

describe("report digest chunking", () => {
  test("keeps every Discord description bounded and every report exact once", () => {
    const entries = Array.from({ length: 5 }, (_, index) => ({
      id: `report-${index + 1}`,
      text: `Report ${index + 1}\n${"x".repeat(1_000)}`,
    }));

    const chunks = chunkReportDigest({
      summary: "**Top reported problems**\nA short summary",
      entries,
    });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.description.length <= 3_900)).toBe(
      true,
    );
    expect(chunks.flatMap((chunk) => chunk.reportIds)).toEqual(
      entries.map((entry) => entry.id),
    );
  });

  test("truncates a single oversized report instead of producing an invalid embed", () => {
    const [chunk] = chunkReportDigest({
      summary: "Summary",
      entries: [{ id: "large", text: "x".repeat(10_000) }],
    });

    expect(chunk.description.length).toBeLessThanOrEqual(3_900);
    expect(chunk.description.endsWith("...")).toBe(true);
    expect(chunk.reportIds).toEqual(["large"]);
  });
});
