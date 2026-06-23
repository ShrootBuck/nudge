import * as cheerio from "cheerio";
import { fetchWithTimeout } from "../../lib/http";
import { cfProblemsetUrl, cfProblemUrl } from "../../lib/utils";

type ProblemStatementFetch = typeof fetchWithTimeout;

export class ProblemStatementUnavailableError extends Error {
  override name = "ProblemStatementUnavailableError";
}

function statementUrls(contestId: number, index: string) {
  return [cfProblemsetUrl(contestId, index), cfProblemUrl(contestId, index)];
}

export async function fetchProblemStatement(
  contestId: number,
  index: string,
  fetchPage: ProblemStatementFetch = fetchWithTimeout,
) {
  const failures: string[] = [];

  for (const url of statementUrls(contestId, index)) {
    try {
      const res = await fetchPage(url, {
        timeoutMs: 15_000,
        headers: {
          "User-Agent":
            "nudge-bot/1.0 (+https://nudge.zaydkrunz.com; contact@zaydkrunz.com)",
        },
      });

      if (!res.ok) {
        failures.push(`${url} returned ${res.status} ${res.statusText}`);
        continue;
      }

      const html = await res.text();
      const $ = cheerio.load(html);
      const statementDiv = $(".problem-statement");
      if (statementDiv.length === 0) {
        failures.push(`${url} did not contain a problem statement`);
        continue;
      }

      const images: string[] = [];
      statementDiv.find("img").each((_, img) => {
        const src = $(img).attr("src");
        if (src) {
          const absoluteUrl = new URL(src, url).href;
          images.push(absoluteUrl);
          $(img).attr("src", absoluteUrl);
        }
      });

      const cleanHtml = statementDiv.html();
      if (cleanHtml?.trim()) {
        return { html: cleanHtml, images };
      }

      failures.push(`${url} contained an empty problem statement`);
    } catch (error) {
      failures.push(
        `${url} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  throw new ProblemStatementUnavailableError(
    `Problem statement unavailable for ${contestId}${index}. ${failures.join("; ")}`,
  );
}
