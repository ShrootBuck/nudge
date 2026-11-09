import { listCodexModels } from "../src/lib/ai/codex-cli";

const args = process.argv.slice(2).filter((arg) => arg !== "--");
if (args.length > 1 || args.includes("-h") || args.includes("--help")) {
  console.log("Usage: bun run models [model-id]");
  process.exit(args.length > 1 ? 1 : 0);
}
const models = await listCodexModels();
const query = args[0];
if (query) {
  const model = models.find((candidate) => candidate.slug === query);
  if (!model)
    throw new Error(
      `Unknown Codex model ${query}. Run bun run models to list available models.`,
    );
  console.log(
    `${model.slug} — ${model.display_name}\nReasoning: ${model.supported_reasoning_levels.map((level) => level.effort).join(", ")}\nInputs: ${model.input_modalities.join(", ")}`,
  );
} else {
  for (const model of models.filter((model) => model.visibility === "list")) {
    console.log(
      `${model.slug}\t${model.supported_reasoning_levels.map((level) => level.effort).join(", ")}`,
    );
  }
}
