export const DISCORD_DIGEST_DESCRIPTION_LIMIT = 3_900;

export type ReportDigestEntry = {
  id: string;
  text: string;
};

export type ReportDigestChunk = {
  description: string;
  reportIds: string[];
};

function truncate(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  if (maxLength <= 3) return value.slice(0, maxLength);
  return `${value.slice(0, maxLength - 3).trimEnd()}...`;
}

export function chunkReportDigest({
  summary,
  entries,
  maxLength = DISCORD_DIGEST_DESCRIPTION_LIMIT,
}: {
  summary: string;
  entries: readonly ReportDigestEntry[];
  maxLength?: number;
}): ReportDigestChunk[] {
  if (entries.length === 0) return [];
  if (maxLength < 256) {
    throw new Error("Report digest chunks must allow at least 256 characters");
  }

  const continuationHeader = "**All reports (continued)**";
  let description = truncate(summary, Math.floor(maxLength / 2));
  let reportIds: string[] = [];
  const chunks: ReportDigestChunk[] = [];
  const maxEntryLength = maxLength - continuationHeader.length - 2;

  function flush() {
    if (reportIds.length === 0) return;
    chunks.push({ description, reportIds });
    description = continuationHeader;
    reportIds = [];
  }

  for (const entry of entries) {
    let text = truncate(entry.text, maxEntryLength);
    let availableLength = maxLength - description.length - 2;

    if (text.length > availableLength && reportIds.length > 0) {
      flush();
      availableLength = maxLength - description.length - 2;
    }

    text = truncate(text, availableLength);
    description = `${description}\n\n${text}`;
    reportIds.push(entry.id);
  }

  flush();
  return chunks;
}
