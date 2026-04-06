import { logger } from "@trigger.dev/sdk";
import * as cheerio from "cheerio";
import { fetchWithTimeout } from "../../lib/http";
import { cfProblemUrl } from "../../lib/utils";

export async function fetchProblemStatement(contestId: number, index: string) {
  try {
    const url = cfProblemUrl(contestId, index);
    const res = await fetchWithTimeout(url, {
      timeoutMs: 15_000,
      headers: {
        "User-Agent":
          "nudge-bot/1.0 (+https://nudge.zaydkrunz.com; contact@zaydkrunz.com)",
      },
    });

    if (!res.ok) {
      logger.error(
        `Failed to fetch problem statement for ${contestId}${index}: ${res.status} ${res.statusText}`,
      );
      return null;
    }
    const html = await res.text();

    const $ = cheerio.load(html);
    const statementDiv = $(".problem-statement");

    if (statementDiv.length > 0) {
      const images: string[] = [];
      statementDiv.find("img").each((_, img) => {
        const src = $(img).attr("src");
        if (src) {
          const absoluteUrl = new URL(src, "https://codeforces.com").href;
          images.push(absoluteUrl);
          $(img).attr("src", absoluteUrl);
        }
      });

      const cleanHtml = statementDiv.html();
      return cleanHtml ? { html: cleanHtml, images } : null;
    }
    return null;
  } catch (err) {
    logger.error(`Error fetching problem statement for ${contestId}${index}`, {
      error: String(err),
    });
    return null;
  }
}
