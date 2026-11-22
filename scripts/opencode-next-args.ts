export type OpenCodeNextArguments = {
  dryRun: boolean;
  runCount: number;
  parallel: number;
};

export const OPENCODE_NEXT_USAGE =
  "Usage: bun run opencode:next -- [count | --count count | -n count] [--parallel jobs] or --dry-run";

function positiveInteger(value: string | undefined, source: string) {
  if (!value || !/^[1-9]\d*$/.test(value)) {
    throw new Error(`${source} requires a positive integer`);
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error(`${source} is too large`);
  return number;
}

export function parseOpenCodeNextArguments(
  arguments_: string[],
): OpenCodeNextArguments {
  let dryRun = false;
  let runCount: number | undefined;
  let parallel: number | undefined;

  for (let index = 0; index < arguments_.length; index++) {
    const argument = arguments_[index];
    if (argument === "--dry-run") {
      dryRun = true;
      continue;
    }

    const option = argument.split("=", 1)[0];
    const flagged = ["--parallel", "--count", "-n"].includes(option);
    if (!flagged && argument.startsWith("-")) {
      throw new Error(`Unknown option: ${argument}`);
    }
    let value: string | undefined = argument;
    if (flagged) {
      value = argument.includes("=")
        ? argument.slice(option.length + 1)
        : arguments_[++index];
    }
    if (option === "--parallel") {
      if (parallel !== undefined)
        throw new Error("--parallel can only be provided once");
      parallel = positiveInteger(value, option);
    } else {
      if (runCount !== undefined)
        throw new Error("Run count can only be provided once");
      runCount = positiveInteger(value, flagged ? option : "count");
    }
  }
  if (dryRun && (runCount !== undefined || parallel !== undefined)) {
    throw new Error("--dry-run does not accept a run count or --parallel");
  }
  return {
    dryRun,
    runCount: runCount ?? parallel ?? 1,
    parallel: parallel ?? 1,
  };
}
