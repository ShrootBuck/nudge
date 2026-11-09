import { describe, expect, test } from "bun:test";
import { parseCodexNextArguments } from "../scripts/codex-next-args";

describe("codex:next arguments", () => {
  test("defaults to one real run", () => {
    expect(parseCodexNextArguments([])).toEqual({
      dryRun: false,
      runCount: 1,
    });
  });

  test("accepts a positional run count", () => {
    expect(parseCodexNextArguments(["3"])).toEqual({
      dryRun: false,
      runCount: 3,
    });
  });

  test("accepts count flags", () => {
    expect(parseCodexNextArguments(["--count", "3"])).toEqual({
      dryRun: false,
      runCount: 3,
    });
    expect(parseCodexNextArguments(["--count=4"])).toEqual({
      dryRun: false,
      runCount: 4,
    });
    expect(parseCodexNextArguments(["-n", "5"])).toEqual({
      dryRun: false,
      runCount: 5,
    });
  });

  test("keeps dry-run as a no-write single preview", () => {
    expect(parseCodexNextArguments(["--dry-run"])).toEqual({
      dryRun: true,
      runCount: 1,
    });
  });

  test("rejects invalid counts", () => {
    expect(() => parseCodexNextArguments(["0"])).toThrow("positive integer");
    expect(() => parseCodexNextArguments(["--count", "two"])).toThrow(
      "positive integer",
    );
  });

  test("rejects ambiguous argument combinations", () => {
    expect(() => parseCodexNextArguments(["3", "--count", "4"])).toThrow(
      "only be provided once",
    );
    expect(() => parseCodexNextArguments(["--dry-run", "3"])).toThrow(
      "does not accept a run count",
    );
  });
});
