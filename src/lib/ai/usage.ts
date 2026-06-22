import { prisma } from "../prisma";
import type { StructuredResponse } from "./types";

const USAGE_TIME_ZONE = "UTC";

function formatDateInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error("Could not format generation usage date");
  }

  return `${year}-${month}-${day}`;
}

export async function recordGenerationUsage({
  problemId,
  response,
  date = new Date(),
}: {
  problemId: string;
  response: StructuredResponse;
  date?: Date;
}) {
  await prisma.aiGenerationUsage.upsert({
    where: { responseId: response.responseId },
    create: {
      problemId,
      providerName: response.providerName ?? "Unknown",
      model: response.resolvedModel,
      responseId: response.responseId,
      totalTokens: response.totalTokens,
      grantDate: formatDateInTimeZone(date, USAGE_TIME_ZONE),
    },
    update: {
      problemId,
      providerName: response.providerName ?? "Unknown",
      model: response.resolvedModel,
      totalTokens: response.totalTokens,
    },
  });
}
