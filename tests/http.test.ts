import { describe, expect, test } from "bun:test";
import { readResponseTextWithLimit } from "../src/lib/http";

describe("bounded response reads", () => {
  test("reads a streamed response within its byte limit", async () => {
    const encoder = new TextEncoder();
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode("Code"));
          controller.enqueue(encoder.encode("forces"));
          controller.close();
        },
      }),
    );

    await expect(readResponseTextWithLimit(response, 10)).resolves.toBe(
      "Codeforces",
    );
  });

  test("rejects a chunked response that exceeds its byte limit", async () => {
    const encoder = new TextEncoder();
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode("12345"));
          controller.enqueue(encoder.encode("6"));
          controller.close();
        },
      }),
    );

    await expect(
      readResponseTextWithLimit(response, 5, "Test response"),
    ).rejects.toThrow("Test response exceeds the 5-byte limit");
  });

  test("rejects an oversized content length before reading", async () => {
    let cancelled = false;
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("small"));
        },
        cancel() {
          cancelled = true;
        },
      }),
      {
        headers: { "content-length": "100" },
      },
    );

    await expect(readResponseTextWithLimit(response, 10)).rejects.toThrow(
      "exceeds the 10-byte limit",
    );
    expect(cancelled).toBe(true);
  });
});
