import { submitPendingGeneration } from "../src/lib/generate-content/pending";

const args = process.argv.slice(2).filter((arg) => arg !== "--");
if (args.length !== 1)
  throw new Error("Usage: bun run codex:resume -- <pending.json>");
const result = await submitPendingGeneration(args[0], console);
console.log(`Saved generation: ${result.outcome}`);
if (result.outcome === "failed") process.exitCode = 1;
