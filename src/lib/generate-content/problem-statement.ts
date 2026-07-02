import * as cheerio from "cheerio";
import { fetchWithTimeout } from "../http";
import { cfProblemsetUrl, cfProblemUrl } from "../utils";

type ProblemStatementFetch = typeof fetchWithTimeout;

type SourceLink = {
  label: string;
  url: string;
};

export class ProblemStatementUnavailableError extends Error {
  override name = "ProblemStatementUnavailableError";
}

function statementUrls(contestId: number, index: string) {
  return [cfProblemsetUrl(contestId, index), cfProblemUrl(contestId, index)];
}

function normalizeText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function sourceLinks($: cheerio.CheerioAPI, baseUrl: string) {
  const seen = new Set<string>();
  const links: SourceLink[] = [];

  $("a").each((_, anchor) => {
    const label = normalizeText($(anchor).text());
    const href = $(anchor).attr("href");

    if (!href || !/\b(tutorial|editorial)\b/i.test(label)) {
      return;
    }

    const url = new URL(href, baseUrl).href;
    if (seen.has(url)) {
      return;
    }

    seen.add(url);
    links.push({ label, url });
  });

  return links;
}

async function sourceStatusLines({
  links,
  problemLabel,
  fetchPage,
}: {
  links: SourceLink[];
  problemLabel: string;
  fetchPage: ProblemStatementFetch;
}) {
  if (links.length === 0) {
    return ["No tutorial/editorial link found on the Codeforces problem page."];
  }

  const statuses: string[] = [];

  for (const link of links.slice(0, 3)) {
    try {
      const res = await fetchPage(link.url, {
        timeoutMs: 15_000,
        headers: {
          "User-Agent":
            "nudge-bot/1.0 (+https://nudge.zaydkrunz.com; contact@zaydkrunz.com)",
        },
      });
      const challenge = res.headers.get("cf-mitigated");

      if (!res.ok) {
        statuses.push(
          `${link.label}: ${link.url} returned ${res.status} ${res.statusText}${
            challenge ? ` (cf-mitigated: ${challenge})` : ""
          }`,
        );
        continue;
      }

      const html = await res.text();
      const sourcePage = cheerio.load(html);
      const title = normalizeText(sourcePage("title").text()) || "untitled";
      const mentionsProblem = sourcePage.root().text().includes(problemLabel);

      statuses.push(
        `${link.label}: ${link.url} loaded (${res.status} ${res.statusText}; title: "${title}"; ${
          mentionsProblem
            ? `mentions ${problemLabel}`
            : `does not mention ${problemLabel}`
        })`,
      );
    } catch (error) {
      statuses.push(
        `${link.label}: ${link.url} failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  return statuses;
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
        return {
          html: cleanHtml,
          images,
          sourceStatuses: await sourceStatusLines({
            links: sourceLinks($, url),
            problemLabel: `${contestId}${index}`,
            fetchPage,
          }),
        };
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
