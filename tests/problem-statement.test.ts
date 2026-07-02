import { describe, expect, test } from "bun:test";
import {
  fetchProblemStatement,
  ProblemStatementUnavailableError,
} from "../src/lib/generate-content/problem-statement";
import { cfProblemsetUrl, cfProblemUrl } from "../src/lib/utils";

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

  test("reports tutorial source status from the problem page", async () => {
    const result = await fetchProblemStatement(2165, "F", async (input) => {
      const url = String(input);

      if (url === cfProblemsetUrl(2165, "F")) {
        return new Response(
          '<a href="/blog/entry/148452">Tutorial (en)</a><div class="problem-statement"><p>Arctic Acquisition</p></div>',
        );
      }

      return new Response(
        "<title>Codeforces Round 1064 Editorial</title><p>2165F Arctic Acquisition</p>",
        {
          status: 200,
          statusText: "OK",
        },
      );
    });

    expect(result.sourceStatuses).toHaveLength(1);
    expect(result.sourceStatuses[0]).toContain(
      "Tutorial (en): https://codeforces.com/blog/entry/148452 loaded",
    );
    expect(result.sourceStatuses[0]).toContain("mentions 2165F");
  });

  test("includes Cloudflare challenge details in tutorial source status", async () => {
    const result = await fetchProblemStatement(2165, "F", async (input) => {
      const url = String(input);

      if (url === cfProblemsetUrl(2165, "F")) {
        return new Response(
          '<a href="/blog/entry/148452">Tutorial (en)</a><div class="problem-statement"><p>Arctic Acquisition</p></div>',
        );
      }

      return new Response("Challenge", {
        status: 403,
        statusText: "Forbidden",
        headers: { "cf-mitigated": "challenge" },
      });
    });

    expect(result.sourceStatuses).toEqual([
      "Tutorial (en): https://codeforces.com/blog/entry/148452 returned 403 Forbidden (cf-mitigated: challenge)",
    ]);
  });
});
