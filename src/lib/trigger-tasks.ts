import { tasks } from "@trigger.dev/sdk";
import type {
  GenerateContentPayload,
  generateContentTask,
} from "@/trigger/generate-content";

export async function triggerGenerateContentTask(
  payload: GenerateContentPayload,
) {
  const triggerVersion = process.env.TRIGGER_VERSION;
  const hadTriggerVersion = Object.hasOwn(process.env, "TRIGGER_VERSION");

  try {
    // Vercel can carry an old TRIGGER_VERSION, which makes the SDK lock runs to
    // a stale Trigger deployment even when the project has auto-built newer code.
    delete process.env.TRIGGER_VERSION;
    return await tasks.trigger<typeof generateContentTask>(
      "generate-content-task",
      payload,
    );
  } finally {
    if (hadTriggerVersion && triggerVersion !== undefined) {
      process.env.TRIGGER_VERSION = triggerVersion;
    } else {
      delete process.env.TRIGGER_VERSION;
    }
  }
}
