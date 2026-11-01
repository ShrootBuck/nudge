import { expect, test } from "bun:test";
import { BatchGate } from "../scripts/batch-controls";

test("pause lets active work finish but blocks the next claim until resumed", async () => {
  const gate = new BatchGate();
  const signal = new AbortController().signal;
  expect(await gate.waitForNext(signal)).toBe(true);
  gate.togglePause();
  let admitted = false;
  const next = gate.waitForNext(signal).then((allowed) => {
    admitted = allowed;
  });
  await Promise.resolve();
  expect(admitted).toBe(false);
  gate.togglePause();
  await next;
  expect(admitted).toBe(true);
});

test("quit wakes a paused runner and permanently prevents new claims", async () => {
  const gate = new BatchGate();
  const signal = new AbortController().signal;
  gate.togglePause();
  const next = gate.waitForNext(signal);
  gate.stop();
  expect(await next).toBe(false);
  gate.togglePause();
  expect(await gate.waitForNext(signal)).toBe(false);
});

test("abort wakes a paused runner without admitting work", async () => {
  const gate = new BatchGate();
  const controller = new AbortController();
  gate.togglePause();
  const next = gate.waitForNext(controller.signal);
  controller.abort(new Error("interrupted"));
  await expect(next).rejects.toThrow("interrupted");
  await expect(gate.waitForNext(controller.signal)).rejects.toThrow(
    "interrupted",
  );
});
