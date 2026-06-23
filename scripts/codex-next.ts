import {
  CODEX_DISPLAY_NAME,
  generateCodexCliStructuredResponse,
  verifyLocalCodexCli,
} from "../src/lib/ai/codex-cli";
import { discordLog } from "../src/lib/discord-log";
import { DISCORD_COLORS } from "../src/lib/discord-webhook";
import {
  executeProblemGeneration,
  markClaimedProblemFailed,
  toProblemLabel,
} from "../src/lib/generate-content/execution";
import {
  selectAndClaimNextAutomaticGenerationProblem,
  selectNextAutomaticGenerationProblem,
} from "../src/lib/generation-queue";
import { prisma } from "../src/lib/prisma";

type SignalName = "SIGINT" | "SIGTERM";

async function preflight() {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error("Missing required environment variable: DATABASE_URL");
  }

  const { codexPath, version } = await verifyLocalCodexCli();

  console.log(
    `Preflight passed: Codex CLI ${version} (${codexPath}), ChatGPT login, ${CODEX_DISPLAY_NAME}`,
  );
}

function candidateSummary(
  selection: NonNullable<
    Awaited<ReturnType<typeof selectNextAutomaticGenerationProblem>>
  >,
) {
  const { problem, selectionReason } = selection;
  return `${toProblemLabel(problem)} — ${problem.name} (${selectionReason}, ${problem.requestedCount} requests, ${problem.generationAttempts} attempts)`;
}

async function main() {
  const arguments_ = process.argv.slice(2);
  const dryRun = arguments_.length === 1 && arguments_[0] === "--dry-run";

  if (arguments_.length > 0 && !dryRun) {
    throw new Error("Usage: bun run codex:next -- [--dry-run]");
  }

  await preflight();

  if (dryRun) {
    const selection = await selectNextAutomaticGenerationProblem();
    if (!selection) {
      console.log("No eligible generation candidates.");
      return;
    }

    console.log(`Dry run only. Next candidate: ${candidateSummary(selection)}`);
    return;
  }

  const abortController = new AbortController();
  let interruptedBy: SignalName | null = null;
  let claimedProblem:
    | NonNullable<
        Awaited<ReturnType<typeof selectAndClaimNextAutomaticGenerationProblem>>
      >["problem"]
    | null = null;

  const interrupt = (signal: SignalName) => {
    if (interruptedBy) {
      return;
    }

    interruptedBy = signal;
    console.error(`\nReceived ${signal}; aborting the active generation...`);
    abortController.abort(new Error(`Generation interrupted by ${signal}`));
  };
  const onSigint = () => interrupt("SIGINT");
  const onSigterm = () => interrupt("SIGTERM");

  process.once("SIGINT", onSigint);
  process.once("SIGTERM", onSigterm);

  try {
    const selection = await selectAndClaimNextAutomaticGenerationProblem();
    if (!selection) {
      console.log("No eligible generation candidates.");
      return;
    }

    claimedProblem = selection.problem;
    console.log(`Claimed: ${candidateSummary(selection)}`);

    if (abortController.signal.aborted) {
      throw abortController.signal.reason;
    }

    const result = await executeProblemGeneration({
      problem: selection.problem,
      generate: generateCodexCliStructuredResponse,
      log: console,
      abortSignal: abortController.signal,
    });

    if (interruptedBy) {
      process.exitCode = interruptedBy === "SIGINT" ? 130 : 143;
      return;
    }

    if (result.outcome === "failed") {
      process.exitCode = 1;
      return;
    }

    await discordLog({
      title: "⚡ Local Codex Generation Complete",
      description: `Processed **${toProblemLabel(
        selection.problem,
      )}** using ${CODEX_DISPLAY_NAME} via AI SDK.`,
      color: DISCORD_COLORS.info,
    });

    const savedProblem = await prisma.problem.findUnique({
      where: { id: selection.problem.id },
      select: {
        generationTotalTokens: true,
        generatedByDisplayName: true,
      },
    });
    const tokenSummary =
      savedProblem?.generationTotalTokens != null
        ? `, ${savedProblem.generationTotalTokens.toLocaleString()} tokens`
        : "";

    console.log(
      `Completed ${toProblemLabel(selection.problem)} with ${
        savedProblem?.generatedByDisplayName ?? CODEX_DISPLAY_NAME
      } (${result.outcome}${tokenSummary}).`,
    );
    console.log(
      `Open: /problem/${selection.problem.contestId}/${selection.problem.index}`,
    );
  } catch (error) {
    const reason = `Local Codex generation failed: ${
      error instanceof Error ? error.message : String(error)
    }`;

    if (claimedProblem) {
      await markClaimedProblemFailed({ problem: claimedProblem, reason });
    }

    throw error;
  } finally {
    process.off("SIGINT", onSigint);
    process.off("SIGTERM", onSigterm);
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
