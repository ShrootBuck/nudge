import { z } from "zod";
import { MAX_CONTEST_ID, PROBLEM_INDEX_PATTERN } from "./codeforces-problem";
import { fetchWithTimeout, readResponseTextWithLimit } from "./http";

const textWithoutNul = z
  .string()
  .trim()
  .min(1)
  .refine((text) => !text.includes("\0"));
const codeforcesProblemSchema = z.object({
  contestId: z.number().int().positive().max(MAX_CONTEST_ID),
  index: z.string().trim().toUpperCase().regex(PROBLEM_INDEX_PATTERN),
  name: textWithoutNul.pipe(z.string().max(500)),
  type: z.literal("PROGRAMMING"),
  rating: z.number().int().min(0).max(10_000).optional(),
  tags: z
    .array(textWithoutNul.pipe(z.string().max(100)))
    .max(50)
    .transform((tags) => Array.from(new Set(tags)).sort()),
});

const codeforcesResponseSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("OK"),
    result: z.object({ problems: z.array(z.unknown()).max(100_000) }),
  }),
  z.object({ status: z.literal("FAILED"), comment: z.string().optional() }),
]);

export type CodeforcesProblem = z.infer<typeof codeforcesProblemSchema>;

export function parseCodeforcesProblemset(value: unknown) {
  const response = codeforcesResponseSchema.parse(value);
  if (response.status === "FAILED") {
    throw new Error(
      `Codeforces API failed: ${response.comment?.slice(0, 500) ?? "unknown error"}`,
    );
  }

  const uniqueProblems = new Map<string, CodeforcesProblem>();
  let skipped = 0;
  let duplicates = 0;
  for (const candidate of response.result.problems) {
    const parsed = codeforcesProblemSchema.safeParse(candidate);
    if (!parsed.success) {
      skipped++;
      continue;
    }
    const key = `${parsed.data.contestId}/${parsed.data.index}`;
    if (uniqueProblems.has(key)) duplicates++;
    uniqueProblems.set(key, parsed.data);
  }

  if (uniqueProblems.size === 0) {
    throw new Error(
      `Codeforces returned no usable problems (${skipped} skipped); refusing to report a successful sync`,
    );
  }

  return { problems: [...uniqueProblems.values()], skipped, duplicates };
}

export async function fetchCodeforcesProblemset() {
  const response = await fetchWithTimeout(
    "https://codeforces.com/api/problemset.problems?lang=en",
    {
      timeoutMs: 20_000,
      redirect: "error",
      headers: {
        "User-Agent":
          "nudge-bot/1.0 (+https://nudge.zaydkrunz.com; contact@zaydkrunz.com)",
      },
    },
  );
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(
      `Codeforces API returned ${response.status} ${response.statusText}`,
    );
  }
  const text = await readResponseTextWithLimit(
    response,
    32 * 1024 * 1024,
    "Codeforces problemset response",
  );
  return parseCodeforcesProblemset(JSON.parse(text));
}
