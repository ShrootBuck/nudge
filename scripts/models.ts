import type { Model } from "@opencode-ai/sdk/v2";
import { createLocalOpenCodeInstance } from "../src/lib/ai/opencode";

const USAGE = `Usage:
  bun run models                      List connected providers
  bun run models <provider>           List a provider's models (✓ = works with Nudge)
  bun run models <provider>/<model>   Show a model's variants and a ready-to-paste config`;

function missingNudgeRequirements(model: Model) {
  const missing: string[] = [];
  if (!model.capabilities.toolcall) {
    missing.push("tool calls");
  }
  if (!model.capabilities.input.image) {
    missing.push("image input");
  }
  return missing;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || args[0] === "--help" || args[0] === "-h") {
    console.log(USAGE);
    process.exitCode = args.length > 1 ? 1 : 0;
    return;
  }
  const query = args[0];

  const { instance } = await createLocalOpenCodeInstance();
  try {
    const result = await instance.client.provider.list(
      { directory: process.cwd() },
      { throwOnError: true },
    );
    const connected = new Set(result.data.connected);
    const providers = result.data.all.filter((provider) =>
      connected.has(provider.id),
    );

    if (!query) {
      if (providers.length === 0) {
        console.log("No providers connected. Run `opencode auth login`.");
        return;
      }

      console.log("Connected providers:\n");
      const width = Math.max(
        ...providers.map((provider) => provider.id.length),
      );
      for (const provider of providers) {
        console.log(`  ${provider.id.padEnd(width)}  ${provider.name}`);
      }
      console.log("\nRun `bun run models <provider>` to list its models.");
      return;
    }

    const slash = query.indexOf("/");
    const providerId = slash === -1 ? query : query.slice(0, slash);
    const modelId = slash === -1 ? null : query.slice(slash + 1);

    const provider = providers.find((candidate) => candidate.id === providerId);
    if (!provider) {
      throw new Error(
        `Provider "${providerId}" is not connected. Run \`bun run models\` for connected providers, or \`opencode auth login\` to add one.`,
      );
    }

    if (!modelId) {
      const models = Object.values(provider.models).sort((a, b) =>
        a.id.localeCompare(b.id),
      );

      console.log(
        `${provider.name} (${provider.id}) — ${models.length} models:\n`,
      );
      const width = Math.max(...models.map((model) => model.id.length));
      for (const model of models) {
        const missing = missingNudgeRequirements(model);
        const mark = missing.length === 0 ? "✓" : "✗";
        const note =
          missing.length === 0 ? "" : `  (missing: ${missing.join(", ")})`;
        console.log(
          `  ${mark} ${provider.id}/${model.id.padEnd(width)}  ${model.name}${note}`,
        );
      }
      console.log(
        "\n✓ supports Nudge (tool calls + image input). Run `bun run models <provider>/<model>` for variants and a config snippet.",
      );
      return;
    }

    const model = provider.models[modelId];
    if (!model) {
      throw new Error(
        `Model "${query}" not found. Run \`bun run models ${providerId}\` to list available models.`,
      );
    }

    const missing = missingNudgeRequirements(model);
    const variants = Object.keys(model.variants ?? {});

    console.log(`${provider.id}/${model.id} — ${model.name}\n`);
    console.log(
      `  Nudge compatible: ${missing.length === 0 ? "yes" : `no (missing: ${missing.join(", ")})`}`,
    );
    console.log(
      `  Variants: ${variants.length > 0 ? variants.join(", ") : 'none (omit "variant")'}`,
    );

    console.log("\nnudge.config.json:\n");
    console.log(
      JSON.stringify(
        {
          model: `${provider.id}/${model.id}`,
          display: { model: model.name },
        },
        null,
        2,
      ),
    );
    if (variants.length > 0) {
      console.log('\nAdd "variant": "<one of the variants above>" if desired.');
    }
  } finally {
    instance.server.close();
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
