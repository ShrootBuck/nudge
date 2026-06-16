import { prisma } from "../prisma";
import type { StructuredResponse } from "./types";

const OPENAI_PROVIDER_NAME = "OpenAI";
const DAILY_TOKEN_CAP = 200_000;
const TOKEN_CAP_TIME_ZONE = "UTC";

const tokenFormatter = new Intl.NumberFormat("en-US");

export type OpenAIDailyTokenUsage = {
  grantDate: string;
  timeZone: string;
  dailyTokenCap: number;
  usedTokens: number;
  exhausted: boolean;
};

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
    throw new Error("Could not format OpenAI token grant date");
  }

  return `${year}-${month}-${day}`;
}

export function getOpenAITokenGrantDate(date = new Date()) {
  return {
    grantDate: formatDateInTimeZone(date, TOKEN_CAP_TIME_ZONE),
    timeZone: TOKEN_CAP_TIME_ZONE,
  };
}

export async function getOpenAIDailyTokenUsage(
  date = new Date(),
): Promise<OpenAIDailyTokenUsage> {
  const { grantDate, timeZone } = getOpenAITokenGrantDate(date);
  const aggregate = await prisma.aiGenerationUsage.aggregate({
    where: {
      providerName: OPENAI_PROVIDER_NAME,
      grantDate,
    },
    _sum: {
      totalTokens: true,
    },
  });
  const usedTokens = aggregate._sum.totalTokens ?? 0;

  return {
    grantDate,
    timeZone,
    dailyTokenCap: DAILY_TOKEN_CAP,
    usedTokens,
    exhausted: usedTokens >= DAILY_TOKEN_CAP,
  };
}

export function formatOpenAIDailyTokenUsage(summary: OpenAIDailyTokenUsage) {
  return `${tokenFormatter.format(summary.usedTokens)}/${tokenFormatter.format(
    summary.dailyTokenCap,
  )} tokens for ${summary.grantDate} ${summary.timeZone}`;
}

export async function recordOpenAIGenerationUsage({
  problemId,
  response,
  date = new Date(),
}: {
  problemId: string;
  response: StructuredResponse;
  date?: Date;
}) {
  const { grantDate } = getOpenAITokenGrantDate(date);

  await prisma.aiGenerationUsage.upsert({
    where: { responseId: response.responseId },
    create: {
      problemId,
      providerName: response.providerName ?? OPENAI_PROVIDER_NAME,
      model: response.resolvedModel,
      responseId: response.responseId,
      totalTokens: response.totalTokens,
      grantDate,
    },
    update: {
      problemId,
      providerName: response.providerName ?? OPENAI_PROVIDER_NAME,
      model: response.resolvedModel,
      totalTokens: response.totalTokens,
    },
  });
}
