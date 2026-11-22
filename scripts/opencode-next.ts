import {
  createLocalOpenCodeRuntime,
  type OpenCodeRuntime,
} from "../src/lib/ai/opencode";
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
import type { GenerationClaim } from "../src/lib/generation-contract";
import { siteApiUrl } from "../src/lib/site-api";
import { cfProblemsetUrl } from "../src/lib/utils";
import { attachBatchKeyboard, BatchGate } from "./batch-controls";
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
      `OpenCode ${details.version} · ${details.displayName}`,
    )}`,
  );
  return details;
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
  let parsedArguments: ReturnType<typeof parseOpenCodeNextArguments>;
  try {
    parsedArguments = parseOpenCodeNextArguments(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${message}\n${OPENCODE_NEXT_USAGE}`);
  }

  validateGenerationApiConfiguration();

  const runtime = await createLocalOpenCodeRuntime();

  try {
    const runtimeDetails = await preflight(runtime);

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
      console.log(
        `      ${cfProblemsetUrl(selection.problem.contestId, selection.problem.index)}`,
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
        `\n${tag("STOP", "yellow")} Received ${signal}; aborting active generations...`,
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

      const { parallel, runCount } = parsedArguments;
      let active = 0;
      let failedRuns = 0;
      let wake: (() => void) | undefined;
      const waitForCompletion = () =>
        new Promise<void>((resolve) => {
          wake = resolve;
        });

      async function generate(selection: GenerationClaim) {
        const generationStartedAt = Date.now();

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
          generate: runtime.generate,
          log: generationLogger,
          abortSignal: abortController.signal,
        });

        if (interruptedBy) return;

        if (result.outcome === "failed") {
          failedRuns++;
          console.error(
            `${tag("FAIL", "red")} ${toProblemLabel(selection.problem)}: ${result.error}`,
          );
          if (parallel === 1) gate.stop();
          return;
        }

        const tokenSummary =
          result.totalTokens != null
            ? `, ${result.totalTokens.toLocaleString()} tokens`
            : "";

        console.log(
          `${tag("DONE", "green")} ${bold(toProblemLabel(selection.problem))} with ${
            result.displayName ?? runtimeDetails.displayName
          } (${outcomeText(result.outcome)}${tokenSummary}, ${Math.round((Date.now() - generationStartedAt) / 1000)}s).`,
        );
        console.log(
          `${dim("Open")} ${color(
            "cyan",
            siteApiUrl(
              `/problem/${selection.problem.contestId}/${selection.problem.index}`,
            ).href,
          )}`,
        );

        completedRuns++;
        totalTokens += result.totalTokens ?? 0;
      }

      if (parallel > 1) {
        console.log(
          `${tag("BATCH", "cyan")} Up to ${Math.min(parallel, runCount)} simultaneous generations on one OpenCode server.`,
        );
      }
      try {
        for (let runIndex = 1; runIndex <= runCount; runIndex++) {
          if (active >= parallel) await waitForCompletion();
          if (!(await gate.waitForNext(abortController.signal))) break;

          // Claim serially so our own sessions don't contend for the same queue row.
          const selection = await claimNextGeneration();
          if (!selection) {
            console.log(
              `${tag("EMPTY", "yellow")} No eligible generation candidates.`,
            );
            break;
          }
          const label = toProblemLabel(selection.problem);
          const progress = runCount > 1 ? `[${runIndex}/${runCount}] ` : "";
          console.log(
            `${tag("CLAIM", "cyan")} ${progress}${candidateSummary(selection)}`,
          );
          console.log(
            `      ${cfProblemsetUrl(selection.problem.contestId, selection.problem.index)}`,
          );
          active++;
          void generate(selection)
            .catch((error: unknown) => {
              failedRuns++;
              gate.stop();
              console.error(
                `${tag("FAIL", "red")} ${label}: ${error instanceof Error ? error.message : String(error)}`,
              );
            })
            .finally(() => {
              active--;
              wake?.();
              wake = undefined;
            });
        }
      } finally {
        // Keep the shared server alive through every claimed job's persistence and cleanup.
        while (active > 0) await waitForCompletion();
      }
      if (failedRuns > 0) process.exitCode = 1;
      if (interruptedBy)
        process.exitCode = interruptedBy === "SIGINT" ? 130 : 143;

      if (runCount > 1) {
        let status = "Finished";
        if (gate.stopped)
          status = failedRuns ? "Stopped after" : "Stopped cleanly after";
        if (interruptedBy) status = "Interrupted after";
        const failures = failedRuns ? `${failedRuns} failed, ` : "";
        const seconds = Math.round((Date.now() - startedAt) / 1000);
        console.log(
          `${tag("DONE", failedRuns ? "yellow" : "green")} ${status} ${completedRuns}/${runCount} requested generations (${failures}${seconds}s, ${totalTokens.toLocaleString()} reported tokens).`,
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
}
