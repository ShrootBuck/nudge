export type QueueState = "BACKLOG" | "READY";
export type RunState = "IDLE" | "RUNNING" | "SUCCEEDED" | "FAILED";

const RUN_STATES = new Set<RunState>([
  "IDLE",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
]);

function isRunState(value: string): value is RunState {
  return RUN_STATES.has(value as RunState);
}

export function resolveRunState(runState: string | null | undefined): RunState {
  if (runState && isRunState(runState)) {
    return runState;
  }

  return "IDLE";
}
