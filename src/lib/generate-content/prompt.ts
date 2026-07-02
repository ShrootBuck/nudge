import { cfProblemUrl } from "../utils";

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
  sourceStatuses?: string[] | null,
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

  let sourceStatusSection = "";
  if (sourceStatuses && sourceStatuses.length > 0) {
    sourceStatusSection = `\n\nSource lookup status:\n<source-lookup-status>\n${sourceStatuses.map((status) => `- ${status}`).join("\n")}\n</source-lookup-status>\n`;
  }

  return `Generate Codeforces learning content: five progressive hints, an original editorial, and AC-quality C++.

Solve from the supplied statement first. For very hard problems, do a quick source check for the official Codeforces tutorial/editorial and accepted submissions when they would help you derive or verify the solution. If a source is blocked, missing, Cloudflare-challenged, 404, or otherwise unavailable, keep solving from the supplied statement and remember that source status. If you still can't solve after that, it's ok.

Write clean Markdown with LaTeX as needed. Use quick and clever humor when appropriate. Tell it like it is (don't sugar-coat responses), and use very casual language. You are fully allowed to swear, just don't overdo it like a sailor (be natural). Deconstruct any false assumptions.

Generate content for Codeforces problem ${problem.contestId}${problem.index}: "${problem.name}"${ratingStr}.

Known problem metadata:
- Contest ID: ${problem.contestId}
- Index: ${problem.index}
- Name: ${problem.name}
- Rating: ${ratingMetadata}
- Tags: ${tagsStr}
- Problem URL: ${cfProblemUrl(problem.contestId, problem.index)}

Use the rating and tags as weak signals only. The supplied statement is the source of truth.${statementSection}${sourceStatusSection}
Generate:
1. Five progressive hints, from a gentle nudge to the key insight.
2. A deep editorial explaining like literally everything.
3. A complete C++26 solution that gets AC on Codeforces.

Formatting & Style Rules:
- Hints and editorial: valid Markdown with LaTeX as needed (e.g., $dp[i]$, $$\\sum_{i=1}^{n} a_i$$).
- Hints and editorial must read like Nudge's own explanation. No research notes, source notes, citations, Markdown links, URLs, or references to editorials/submissions/posts.
- Solution: raw C++ only, no Markdown fences.
- Keep C++ short, clean, standard, and single-file. Comments are fine when they clarify the idea.

Output strictness:
- Return JSON matching the provided schema exactly.
- If the problem is solvable, return \`status: "success"\`, \`reason: null\`, and fill in \`hints\`, \`editorial\`, and \`solution\`.
- Return \`status: "unsolvable"\`, a short \`reason\`, and set \`hints\`, \`editorial\`, and \`solution\` to null only when the supplied statement is fundamentally incomplete, contradictory, or dependent on an inaccessible resource needed to define the task. Missing research, high rating, uncertainty, or "can't guarantee AC" is not a reason to return unsolvable.
- If you return \`status: "unsolvable"\`, the \`reason\` is shown directly to users. Be concrete: say what exact statement/resource blocker stopped you, and include relevant source lookup status if it mattered (for example: official tutorial missing, Codeforces returned 403/Cloudflare challenge, tutorial page 404, accepted submissions unavailable).
- Each hint must be JUST the hint text. No "Hint 1:" or subtitles. The UI adds those automatically.
- Do not start the editorial with an "# Editorial" heading. The UI already adds that section. Feel free to add other headers as needed though.
- Use styling in the editorial if needed! Just that first header is no good but any subheaders or bolding or whatever is good!

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
