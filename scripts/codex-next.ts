import { generateWithCodex } from "../src/lib/ai/codex";
import { preflightCodex } from "../src/lib/ai/codex-cli";
import {
  executeProblemGeneration,
  type GenerationLogger,
  toProblemLabel,
} from "../src/lib/generate-content/execution";
import {
  claimNextGeneration,
  failGeneration,
  previewNextGeneration,
  validateGenerationApiConfiguration,
} from "../src/lib/generation-api";
import { attachBatchKeyboard, BatchGate } from "./batch-controls";
import { CODEX_NEXT_USAGE, parseCodexNextArguments } from "./codex-next-args";

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

function candidateSummary(
  selection: NonNullable<Awaited<ReturnType<typeof previewNextGeneration>>>,
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
  let parsedArguments: ReturnType<typeof parseCodexNextArguments>;
  try {
    parsedArguments = parseCodexNextArguments(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${message}\n${CODEX_NEXT_USAGE}`);
  }

  validateGenerationApiConfiguration();

  const runtimeDetails = await preflightCodex();
  console.log(
    `${tag("OK", "green")} Preflight passed ${dim(`Codex CLI ${runtimeDetails.version}, ${runtimeDetails.model}, ${runtimeDetails.reasoningEffort} reasoning (ChatGPT)`)}`,
  );

  if (parsedArguments.dryRun) {
    const selection = await previewNextGeneration();
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
  const gate = new BatchGate();
  const detachKeyboard = attachBatchKeyboard(
    gate,
    (message) => console.log(`${tag("CTRL", "cyan")} ${message}`),
    onSigint,
  );

  try {
    let completedRuns = 0;
    const startedAt = Date.now();
    let totalTokens = 0;

    for (let runIndex = 1; runIndex <= parsedArguments.runCount; runIndex++) {
      if (gate.paused && !gate.stopped) {
        console.log(
          `${tag("PAUSE", "yellow")} No new work will be claimed. Press p to resume or q to exit.`,
        );
      }
      if (!(await gate.waitForNext(abortController.signal))) break;
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

      if (abortController.signal.aborted) throw abortController.signal.reason;
      const selection = await claimNextGeneration();
      if (!selection) {
        console.log(
          `${tag("EMPTY", "yellow")} No eligible generation candidates.`,
        );
        break;
      }

      console.log(`${tag("CLAIM", "cyan")} ${candidateSummary(selection)}`);

      if (abortController.signal.aborted) {
        await failGeneration(
          selection.claimId,
          `Generation interrupted by ${interruptedBy}`,
        );
        throw abortController.signal.reason;
      }

      const result = await executeProblemGeneration({
        problem: selection.problem,
        claimId: selection.claimId,
        generate: generateWithCodex,
        log: generationLogger,
        abortSignal: abortController.signal,
      });

      if (interruptedBy) {
        process.exitCode = interruptedBy === "SIGINT" ? 130 : 143;
        return;
      }

      if (result.outcome === "failed") {
        console.error(`${tag("FAIL", "red")} ${result.error}`);
        process.exitCode = 1;
        return;
      }

      const tokenSummary =
        result.totalTokens != null
          ? `, ${result.totalTokens.toLocaleString()} tokens`
          : "";

      console.log(
        `${tag("DONE", "green")} ${bold(toProblemLabel(selection.problem))} with ${
          result.displayName ?? runtimeDetails.displayName
        } (${outcomeText(result.outcome)}${tokenSummary}).`,
      );
      console.log(
        `${dim("Open")} ${color(
          "cyan",
          `/problem/${selection.problem.contestId}/${selection.problem.index}`,
        )}`,
      );

      completedRuns++;
      totalTokens += result.totalTokens ?? 0;
    }

    if (parsedArguments.runCount > 1) {
      console.log(
        `${tag("DONE", "green")} ${gate.stopped ? "Stopped cleanly after" : "Finished"} ${completedRuns}/${parsedArguments.runCount} requested generations (${Math.round((Date.now() - startedAt) / 1000)}s, ${totalTokens.toLocaleString()} reported tokens).`,
      );
    }
  } catch (error) {
    if (!interruptedBy) throw error;
    process.exitCode = interruptedBy === "SIGINT" ? 130 : 143;
  } finally {
    detachKeyboard();
    process.off("SIGINT", onSigint);
    process.off("SIGTERM", onSigterm);
  }
}

try {
  await main();
} catch (error) {
  console.error(
    `${tag("FAIL", "red")} ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
}
