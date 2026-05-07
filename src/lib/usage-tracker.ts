import { prisma } from "./prisma";

export const OPENAI_PROVIDER_ID = "openai";
export const OPENAI_AUTO_QUEUE_DAILY_TOKEN_LIMIT = 200_000;

function getUTCDateString(date = new Date()): string {
  return date.toISOString().split("T")[0];
}

export async function getDailyTokenUsage(provider: string): Promise<number> {
  const today = getUTCDateString();
  const record = await prisma.dailyUsage.findUnique({
    where: { date_provider: { date: today, provider } },
  });
  return record?.tokensUsed ?? 0;
}

export async function addDailyTokenUsage(
  provider: string,
  tokens: number,
): Promise<void> {
  const today = getUTCDateString();
  await prisma.dailyUsage.upsert({
    where: { date_provider: { date: today, provider } },
    update: { tokensUsed: { increment: tokens } },
    create: { date: today, provider, tokensUsed: tokens },
  });
}
