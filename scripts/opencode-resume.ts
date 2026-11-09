import { readFile, unlink } from "node:fs/promises";
import { completeGeneration } from "../src/lib/generation-api";
import { generationRequestSchema } from "../src/lib/generation-contract";
import { siteApiUrl } from "../src/lib/site-api";

const args = process.argv.slice(2).filter((arg) => arg !== "--");
if (args.length !== 1)
  throw new Error("Usage: bun run opencode:resume -- <pending.json>");
const path = args[0];
const pending = JSON.parse(await readFile(path, "utf8"));
if (pending.origin !== siteApiUrl("/").origin)
  throw new Error("Saved submission belongs to a different Nudge server");
const submission = generationRequestSchema.parse(pending.submission);
if (submission.action !== "complete")
  throw new Error("Not a saved generation result");
const result = await completeGeneration(submission);
await unlink(path);
console.log(`Saved generation: ${result.outcome}`);
if (result.outcome === "failed") process.exitCode = 1;
