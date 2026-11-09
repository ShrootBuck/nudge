export type OpenCodeNextArguments = {
  dryRun: boolean;
  runCount: number;
};

export const OPENCODE_NEXT_USAGE =
  "Usage: bun run opencode:next -- [count | --count count | -n count | --dry-run]";

function parseRunCount(value: string, source: string) {
  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error(`${source} must be a positive integer`);
  }

  const runCount = Number(value);
  if (!Number.isSafeInteger(runCount)) {
    throw new Error(`${source} is too large`);
  }

  return runCount;
}

function setRunCount(
  currentRunCount: number | null,
  value: string,
  source: string,
) {
  if (currentRunCount !== null) {
    throw new Error("Run count can only be provided once");
  }

  return parseRunCount(value, source);
}

export function parseOpenCodeNextArguments(
  arguments_: string[],
): OpenCodeNextArguments {
  let dryRun = false;
  let runCount: number | null = null;

  for (let index = 0; index < arguments_.length; index++) {
    const argument = arguments_[index];

    if (argument === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (argument === "--count" || argument === "-n") {
      const value = arguments_[index + 1];
      if (!value || value.startsWith("-")) {
        throw new Error(`${argument} requires a positive integer`);
      }

      runCount = setRunCount(runCount, value, argument);
      index++;
      continue;
    }

    if (argument.startsWith("--count=")) {
      runCount = setRunCount(
        runCount,
        argument.slice("--count=".length),
        "--count",
      );
      continue;
    }

    if (!argument.startsWith("-")) {
      runCount = setRunCount(runCount, argument, "count");
      continue;
    }

    throw new Error(`Unknown option: ${argument}`);
  }

  if (dryRun && runCount !== null) {
    throw new Error("--dry-run does not accept a run count");
  }

  return {
    dryRun,
    runCount: runCount ?? 1,
  };
}
