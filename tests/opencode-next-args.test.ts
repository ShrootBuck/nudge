import { describe, expect, test } from "bun:test";
import { parseOpenCodeNextArguments } from "../scripts/opencode-next-args";

describe("opencode:next arguments", () => {
  test("defaults to one real run", () => {
    expect(parseOpenCodeNextArguments([])).toEqual({
      dryRun: false,
      runCount: 1,
    });
  });

  test("accepts a positional run count", () => {
    expect(parseOpenCodeNextArguments(["3"])).toEqual({
      dryRun: false,
      runCount: 3,
    });
  });

  test("accepts count flags", () => {
    expect(parseOpenCodeNextArguments(["--count", "3"])).toEqual({
      dryRun: false,
      runCount: 3,
    });
    expect(parseOpenCodeNextArguments(["--count=4"])).toEqual({
      dryRun: false,
      runCount: 4,
    });
    expect(parseOpenCodeNextArguments(["-n", "5"])).toEqual({
      dryRun: false,
      runCount: 5,
    });
  });

  test("keeps dry-run as a no-write single preview", () => {
    expect(parseOpenCodeNextArguments(["--dry-run"])).toEqual({
      dryRun: true,
      runCount: 1,
    });
  });

  test("rejects invalid counts", () => {
    expect(() => parseOpenCodeNextArguments(["0"])).toThrow("positive integer");
    expect(() => parseOpenCodeNextArguments(["--count", "two"])).toThrow(
      "positive integer",
    );
  });

  test("rejects ambiguous argument combinations", () => {
    expect(() => parseOpenCodeNextArguments(["3", "--count", "4"])).toThrow(
      "only be provided once",
    );
    expect(() => parseOpenCodeNextArguments(["--dry-run", "3"])).toThrow(
      "does not accept a run count",
    );
  });
});
