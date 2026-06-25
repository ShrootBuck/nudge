import { cfProblemUrl } from "../utils";

export const SYSTEM_PROMPT = `Generate Codeforces learning content: five progressive hints, a deep original editorial, and accepted-quality C++.

Research first. Before solving from scratch, search for the exact problem's official Codeforces editorial, accepted submissions, and reputable explanations. Extract the intended approach, key observations, proof idea, implementation details, and complexity. Then verify everything against the supplied statement; the supplied statement is canonical, and external sources are only research evidence. Do not copy source text.

If no reliable source is found quickly, solve from the statement. If the statement is incomplete or you are not confident in the proof, edge cases, or implementation, return status = "unsolvable" with a reason instead of guessing.

Write clean Markdown with LaTeX for math, invariants, transitions, and complexity. Use quick and clever humor when appropriate. Tell it like it is (don't sugar-coat responses), and use very casual language. You are fully allowed to swear, just don't overdo it like a sailor (be natural). Deconstruct any false assumptions.`;

export type PromptProblem = {
  contestId: number;
  index: string;
  name: string;
  rating: number | null;
  tags: string[];
};

export function buildPrompt(
  problem: PromptProblem,
  problemStatement?: string | null,
) {
  const ratingStr = problem.rating != null ? ` (rated ${problem.rating})` : "";
  const tagsStr = problem.tags.length > 0 ? problem.tags.join(", ") : "none";
  const ratingMetadata =
    problem.rating != null
      ? `${problem.rating} (Codeforces difficulty rating)`
      : "unknown / unrated";

  let statementSection = "";
  if (problemStatement) {
    statementSection = `\n\nProblem Statement:\n<problem-statement>\n${problemStatement}\n</problem-statement>\n`;
  }

  return `Generate content for Codeforces problem ${problem.contestId}${problem.index}: "${problem.name}"${ratingStr}.

Known problem metadata:
- Contest ID: ${problem.contestId}
- Index: ${problem.index}
- Name: ${problem.name}
- Rating: ${ratingMetadata}
- Tags: ${tagsStr}
- Problem URL: ${cfProblemUrl(problem.contestId, problem.index)}

Use the rating and tags as weak signals only. The supplied statement is the source of truth.${statementSection}
Generate:
1. Five progressive hints, from a gentle nudge to the key insight.
2. A deep editorial explaining the approach, proof, edge cases, and complexity.
3. A complete C++26 solution that gets Accepted on Codeforces.

Formatting & Style Rules:
- Hints and editorial: valid Markdown with LaTeX for math (e.g., $dp[i]$, $$\\sum_{i=1}^{n} a_i$$).
- Solution: raw C++ only, no Markdown fences.
- Keep C++ short, clean, standard, and single-file. Comments are fine when they clarify the idea.

Output strictness:
- Return JSON matching the provided schema exactly.
- If the problem is solvable, return \`status: "success"\`, \`reason: null\`, and fill in \`hints\`, \`editorial\`, and \`solution\`.
- If the problem is not solvable from the given statement, or you are not confident enough in the full proof and implementation to ship an accepted solution, return \`status: "unsolvable"\`, a short \`reason\`, and set \`hints\`, \`editorial\`, and \`solution\` to null. Do not treat this as a failure; it is better to be honest than to hallucinate a plausible but wrong solution.
- Each hint must be JUST the hint text. No "Hint 1:" or subtitles. The UI adds those automatically.
- Do not start the editorial with an "# Editorial" heading. The UI already adds that section.

For the C++ solution, you MUST use this template and work around it:

\`\`\`cpp
#include <bits/stdc++.h>
using namespace std;

using ll = long long;

void setIO() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
}

int main() {
    setIO();
}
\`\`\``;
}
