import {
  createLocalOpenCodeRuntime,
  type OpenCodeRuntime,
} from "../src/lib/ai/opencode";
import { discordLog } from "../src/lib/discord-log";
import { SITE_URL } from "../src/lib/env";
import {
  executeProblemGeneration,
  type GenerationLogger,
  markClaimedProblemFailed,
  toProblemLabel,
} from "../src/lib/generate-content/execution";
import {
  selectAndClaimNextAutomaticGenerationProblem,
  selectNextAutomaticGenerationProblem,
} from "../src/lib/generation-queue";
import { hasVercelBlobReadWriteToken } from "../src/lib/generation-transcript";
import { prisma } from "../src/lib/prisma";
import {
  OPENCODE_NEXT_USAGE,
  parseOpenCodeNextArguments,
} from "./opencode-next-args";

type SignalName = "SIGINT" | "SIGTERM";
type ColorName = "blue" | "cyan" | "green" | "red" | "yellow";

const COLOR_CODES = {
  blue: 34,
  cyan: 36,
  green: 32,
  red: 31,
  yellow: 33,
} as const satisfies Record<ColorName, number>;

const colorEnabled =
  process.env.NO_COLOR == null &&
  process.env.FORCE_COLOR !== "0" &&
  (Boolean(process.stdout.isTTY) || Boolean(process.env.FORCE_COLOR));

function ansi(code: number, text: string) {
  return colorEnabled ? `\u001b[${code}m${text}\u001b[0m` : text;
}

function color(name: ColorName, text: string) {
  return ansi(COLOR_CODES[name], text);
}

function bold(text: string) {
  return ansi(1, text);
}

function dim(text: string) {
  return ansi(2, text);
}

function tag(label: string, name: ColorName) {
  return color(name, bold(label.padEnd(5)));
}

async function preflight(runtime: OpenCodeRuntime) {
  const details = await runtime.preflight();

  console.log(
    `${tag("OK", "green")} Preflight passed ${dim(
      `OpenCode ${details.version} (${details.executablePath}), ${details.modelReference}${
        details.variant ? `/${details.variant}` : ""
      }, displayed as ${details.displayName}`,
    )}`,
  );
  return details;
}

function candidateSummary(
  selection: NonNullable<
    Awaited<ReturnType<typeof selectNextAutomaticGenerationProblem>>
  >,
) {
  const { problem, selectionReason } = selection;
  return `${bold(toProblemLabel(problem))} — ${problem.name} ${dim(
    `(${selectionReason}, ${problem.requestedCount} requests, ${problem.generationAttempts} attempts)`,
  )}`;
}

const generationLogger = {
  info(message) {
    console.log(`${tag("GEN", "blue")} ${message}`);
  },
  warn(message) {
    console.warn(`${tag("WARN", "yellow")} ${message}`);
  },
  error(message) {
    console.error(`${tag("FAIL", "red")} ${message}`);
  },
} satisfies GenerationLogger;

function outcomeText(outcome: "succeeded" | "unsolvable") {
  if (outcome === "succeeded") {
    return color("green", outcome);
  }

  return color("yellow", outcome);
}

async function main() {
  let parsedArguments: ReturnType<typeof parseOpenCodeNextArguments>;
  try {
    parsedArguments = parseOpenCodeNextArguments(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${message}\n${OPENCODE_NEXT_USAGE}`);
  }

  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error("Missing required environment variable: DATABASE_URL");
  }
  if (!parsedArguments.dryRun && !hasVercelBlobReadWriteToken()) {
    throw new Error(
      "Missing usable BLOB_READ_WRITE_TOKEN for local transcript uploads",
    );
  }

  const runtime = await createLocalOpenCodeRuntime();

  try {
    const runtimeDetails = await preflight(runtime);

    if (parsedArguments.dryRun) {
      const selection = await selectNextAutomaticGenerationProblem();
      if (!selection) {
        console.log(
          `${tag("EMPTY", "yellow")} No eligible generation candidates.`,
        );
        return;
      }

      console.log(
        `${tag("DRY", "cyan")} Next candidate: ${candidateSummary(selection)}`,
      );
      return;
    }

    const abortController = new AbortController();
    let interruptedBy: SignalName | null = null;
    let claimedProblem:
      | NonNullable<
          Awaited<
            ReturnType<typeof selectAndClaimNextAutomaticGenerationProblem>
          >
        >["problem"]
      | null = null;

    const interrupt = (signal: SignalName) => {
      if (interruptedBy) {
        return;
      }

      interruptedBy = signal;
      console.error(
        `\n${tag("STOP", "yellow")} Received ${signal}; aborting the active generation...`,
      );
      abortController.abort(new Error(`Generation interrupted by ${signal}`));
    };
    const onSigint = () => interrupt("SIGINT");
    const onSigterm = () => interrupt("SIGTERM");

    process.once("SIGINT", onSigint);
    process.once("SIGTERM", onSigterm);

    try {
      let completedRuns = 0;

      for (let runIndex = 1; runIndex <= parsedArguments.runCount; runIndex++) {
        if (parsedArguments.runCount > 1) {
          if (runIndex > 1) {
            console.log("");
          }

          console.log(
            `${tag("RUN", "cyan")} ${bold(
              `${runIndex}/${parsedArguments.runCount}`,
            )}`,
          );
        }

        const selection = await selectAndClaimNextAutomaticGenerationProblem();
        if (!selection) {
          console.log(
            `${tag("EMPTY", "yellow")} No eligible generation candidates.`,
          );
          return;
        }

        claimedProblem = selection.problem;
        console.log(`${tag("CLAIM", "cyan")} ${candidateSummary(selection)}`);

        if (abortController.signal.aborted) {
          throw abortController.signal.reason;
        }

        const result = await executeProblemGeneration({
          problem: selection.problem,
          generate: runtime.generate,
          log: generationLogger,
          abortSignal: abortController.signal,
        });

        if (interruptedBy) {
          process.exitCode = interruptedBy === "SIGINT" ? 130 : 143;
          return;
        }

        if (result.outcome === "failed") {
          console.error(`${tag("FAIL", "red")} Run failed.`);
          process.exitCode = 1;
          return;
        }

        await discordLog({
          content: `⚡ Generated **${toProblemLabel(selection.problem)}** using ${runtimeDetails.displayName}\n${SITE_URL}/problem/${selection.problem.contestId}/${selection.problem.index}`,
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
          `${tag("DONE", "green")} ${bold(toProblemLabel(selection.problem))} with ${
            savedProblem?.generatedByDisplayName ?? runtimeDetails.displayName
          } (${outcomeText(result.outcome)}${tokenSummary}).`,
        );
        console.log(
          `${dim("Open")} ${color(
            "cyan",
            `/problem/${selection.problem.contestId}/${selection.problem.index}`,
          )}`,
        );

        completedRuns++;
      }

      if (parsedArguments.runCount > 1) {
        console.log(
          `${tag("DONE", "green")} Finished ${completedRuns}/${parsedArguments.runCount} requested generations.`,
        );
      }
    } catch (error) {
      const reason = `Local OpenCode generation failed: ${
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
  } finally {
    await runtime.close();
  }
}

try {
  await main();
} catch (error) {
  console.error(
    `${tag("FAIL", "red")} ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
