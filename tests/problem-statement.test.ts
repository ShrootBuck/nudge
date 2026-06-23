import { describe, expect, test } from "bun:test";
import { cfProblemsetUrl, cfProblemUrl } from "../src/lib/utils";
import {
  fetchProblemStatement,
  ProblemStatementUnavailableError,
} from "../src/trigger/generate-content/problem-statement";

describe("Codeforces problem statement fetching", () => {
  test("falls back from the problemset route to the contest route", async () => {
    const requestedUrls: string[] = [];
    const result = await fetchProblemStatement(2209, "D", async (input) => {
      const url = String(input);
      requestedUrls.push(url);

      if (url === cfProblemsetUrl(2209, "D")) {
        return new Response("Not found", {
          status: 404,
          statusText: "Not Found",
        });
      }

      return new Response(
        '<div class="problem-statement"><p>Ghostfires</p><img src="/images/ghost.png"></div>',
      );
    });

    expect(requestedUrls).toEqual([
      cfProblemsetUrl(2209, "D"),
      cfProblemUrl(2209, "D"),
    ]);
    expect(result.html).toContain("<p>Ghostfires</p>");
    expect(result.html).toContain(
      'src="https://codeforces.com/images/ghost.png"',
    );
    expect(result.images).toEqual(["https://codeforces.com/images/ghost.png"]);
  });

  test("throws when no route contains a statement", async () => {
    try {
      await fetchProblemStatement(2209, "D", async () => {
        return new Response("Unavailable", {
          status: 503,
          statusText: "Service Unavailable",
        });
      });
      throw new Error("Expected statement fetching to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(ProblemStatementUnavailableError);
      expect((error as Error).message).toContain(
        "Problem statement unavailable for 2209D",
      );
    }
  });
});
