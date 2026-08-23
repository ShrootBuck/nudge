import * as cheerio from "cheerio";
import { fetchWithTimeout, readResponseTextWithLimit } from "../http";
import { cfProblemsetUrl, cfProblemUrl } from "../utils";

type ProblemStatementFetch = typeof fetchWithTimeout;

type SourceLink = {
  label: string;
  url: string;
};

const MAX_STATEMENT_IMAGES = 12;
const MAX_SOURCE_LINKS = 3;
const MAX_CODEFORCES_PAGE_BYTES = 2 * 1024 * 1024;

function isTrustedCodeforcesUrl(url: URL) {
  const hostname = url.hostname.toLowerCase();
  return (
    url.protocol === "https:" &&
    (hostname === "codeforces.com" || hostname.endsWith(".codeforces.com"))
  );
}

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

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(href, baseUrl);
    } catch {
      return;
    }
    if (!isTrustedCodeforcesUrl(parsedUrl)) {
      return;
    }

    const url = parsedUrl.href;
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

  return Promise.all(
    links.slice(0, MAX_SOURCE_LINKS).map(async (link) => {
      try {
        const res = await fetchPage(link.url, {
          timeoutMs: 15_000,
          redirect: "error",
          headers: {
            "User-Agent":
              "nudge-bot/1.0 (+https://nudge.zaydkrunz.com; contact@zaydkrunz.com)",
          },
        });
        const challenge = res.headers.get("cf-mitigated");

        if (!res.ok) {
          return `${link.label}: ${link.url} returned ${res.status} ${res.statusText}${
            challenge ? ` (cf-mitigated: ${challenge})` : ""
          }`;
        }

        const html = await readResponseTextWithLimit(
          res,
          MAX_CODEFORCES_PAGE_BYTES,
          `Codeforces source page ${link.url}`,
        );
        const sourcePage = cheerio.load(html);
        const title = normalizeText(sourcePage("title").text()) || "untitled";
        const mentionsProblem = sourcePage.root().text().includes(problemLabel);

        return `${link.label}: ${link.url} loaded (${res.status} ${res.statusText}; title: "${title}"; ${
          mentionsProblem
            ? `mentions ${problemLabel}`
            : `does not mention ${problemLabel}`
        })`;
      } catch (error) {
        return `${link.label}: ${link.url} failed: ${
          error instanceof Error ? error.message : String(error)
        }`;
      }
    }),
  );
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
        redirect: "error",
        headers: {
          "User-Agent":
            "nudge-bot/1.0 (+https://nudge.zaydkrunz.com; contact@zaydkrunz.com)",
        },
      });

      if (!res.ok) {
        failures.push(`${url} returned ${res.status} ${res.statusText}`);
        continue;
      }

      const html = await readResponseTextWithLimit(
        res,
        MAX_CODEFORCES_PAGE_BYTES,
        `Codeforces problem page ${url}`,
      );
      const $ = cheerio.load(html);
      const statementDiv = $(".problem-statement");
      if (statementDiv.length === 0) {
        failures.push(`${url} did not contain a problem statement`);
        continue;
      }

      const images: string[] = [];
      const seenImages = new Set<string>();
      statementDiv.find("img").each((_, img) => {
        const src = $(img).attr("src");
        if (!src) return;
        if (images.length >= MAX_STATEMENT_IMAGES) {
          $(img).remove();
          return;
        }

        let imageUrl: URL;
        try {
          imageUrl = new URL(src, url);
        } catch {
          $(img).remove();
          return;
        }
        if (
          !isTrustedCodeforcesUrl(imageUrl) ||
          seenImages.has(imageUrl.href)
        ) {
          $(img).remove();
          return;
        }

        seenImages.add(imageUrl.href);
        images.push(imageUrl.href);
        $(img).attr("src", imageUrl.href);
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
