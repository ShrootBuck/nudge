import { emitKeypressEvents } from "node:readline";

/** Controls admission of new work; never interrupts an already claimed job. */
export class BatchGate {
  paused = false;
  stopped = false;
  private wake: (() => void) | undefined;

  togglePause() {
    if (this.stopped) return;
    this.paused = !this.paused;
    this.wake?.();
  }

  stop() {
    this.stopped = true;
    this.wake?.();
  }

  async waitForNext(signal: AbortSignal) {
    const wake = () => this.wake?.();
    signal.addEventListener("abort", wake);
    try {
      while (this.paused && !this.stopped && !signal.aborted) {
        await new Promise<void>((resolve) => {
          this.wake = resolve;
        });
      }
      signal.throwIfAborted();
      return !this.stopped;
    } finally {
      this.wake = undefined;
      signal.removeEventListener("abort", wake);
    }
  }
}

export function attachBatchKeyboard(
  gate: BatchGate,
  log: (message: string) => void,
  interrupt: () => void,
) {
  const input = process.stdin;
  if (!input.isTTY || !process.stdout.isTTY) return () => {};

  const wasRaw = input.isRaw;
  const wasFlowing = input.readableFlowing;
  emitKeypressEvents(input);
  const onKey = (
    _text: string,
    key: { name?: string; ctrl?: boolean; meta?: boolean },
  ) => {
    if (key.ctrl && key.name === "c") {
      interrupt();
    } else if (!key.ctrl && !key.meta && key.name === "p" && !gate.stopped) {
      gate.togglePause();
      log(
        gate.paused
          ? "Pause requested. Any claimed generation will finish and save; press p to resume or q to finish and exit."
          : "Resumed. New generations may start.",
      );
    } else if (!key.ctrl && !key.meta && key.name === "q" && !gate.stopped) {
      gate.stop();
      log("Stopping after any claimed generation finishes and saves.");
    }
  };
  input.on("keypress", onKey);
  input.setRawMode(true);
  input.resume();
  log(
    "Keys: p pause/resume after current generation · q finish and exit · Ctrl+C abort",
  );
  return () => {
    input.off("keypress", onKey);
    input.setRawMode(wasRaw);
    if (wasFlowing !== true) input.pause();
  };
}
