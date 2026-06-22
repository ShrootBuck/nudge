import {
  CODEX_DISPLAY_NAME,
  generateCodexCliStructuredResponse,
  verifyLocalCodexCli,
} from "../src/lib/ai/codex-cli";
import type { GenerationTraceEvent } from "../src/lib/ai/types";
import { DISCORD_COLORS } from "../src/lib/discord-webhook";
import {
  selectAndClaimNextAutomaticGenerationProblem,
  selectNextAutomaticGenerationProblem,
} from "../src/lib/generation-queue";
import { prisma } from "../src/lib/prisma";
import { discordLog } from "../src/trigger/discord-log";
import {
  executeProblemGeneration,
  markClaimedProblemFailed,
  toProblemLabel,
} from "../src/trigger/generate-content/execution";

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

function formatTraceValue(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function createTerminalTrace() {
  let activeSection: "reasoning" | "output" | null = null;

  const closeSection = () => {
    if (activeSection) {
      process.stdout.write("\n");
      activeSection = null;
    }
  };

  const openSection = (section: "reasoning" | "output") => {
    if (activeSection === section) {
      return;
    }

    closeSection();
    process.stdout.write(
      section === "reasoning"
        ? "\n[codex reasoning]\n"
        : "\n[codex structured output]\n",
    );
    activeSection = section;
  };

  return {
    handle(event: GenerationTraceEvent) {
      switch (event.type) {
        case "reasoning-start":
          openSection("reasoning");
          break;
        case "reasoning-delta":
          openSection("reasoning");
          process.stdout.write(event.text);
          break;
        case "reasoning-end":
          closeSection();
          break;
        case "output-start":
          openSection("output");
          break;
        case "output-delta":
          openSection("output");
          process.stdout.write(event.text);
          break;
        case "output-end":
          closeSection();
          break;
        case "tool-call":
          closeSection();
          console.log(
            `\n[codex tool] ${event.toolName} ${formatTraceValue(event.input)}`,
          );
          break;
        case "tool-result":
          closeSection();
          console.log(
            `[codex tool result] ${event.toolName} ${formatTraceValue(
              event.output,
            )}`,
          );
          break;
        case "error":
          closeSection();
          console.error(`\n[codex stream error] ${String(event.error)}`);
          break;
      }
    },
    close: closeSection,
  };
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

    const trace = createTerminalTrace();
    const result = await (async () => {
      try {
        return await executeProblemGeneration({
          problem: selection.problem,
          generate: generateCodexCliStructuredResponse,
          log: console,
          abortSignal: abortController.signal,
          onTraceEvent: trace.handle,
        });
      } finally {
        trace.close();
      }
    })();

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

    console.log(
      `Completed ${toProblemLabel(selection.problem)} with ${CODEX_DISPLAY_NAME} (${result.outcome}).`,
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
