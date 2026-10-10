import { OpenCode } from "@opencode/client";
import { createOpenCodeClient } from "../../src/lib/ai/opencode-server";

// Run in a separate Bun process so its socket idle timeout can be shortened
// without changing other tests. The server models V2's silent session.wait.
const authorization = "Basic local-transport-test";
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  idleTimeout: 0,
  async fetch(request) {
    if (request.headers.get("authorization") !== authorization) {
      return new Response(null, { status: 401 });
    }
    if (
      request.method !== "POST" ||
      new URL(request.url).pathname !==
        "/api/experimental/session/test-session/wait"
    ) {
      return new Response(null, { status: 404 });
    }
    // Bun's socket timer has a coarse tick, so allow several seconds beyond
    // the one-second idle timeout configured by the parent test.
    await Bun.sleep(6_500);
    return new Response(null, { status: 204 });
  },
});

try {
  const options = {
    baseUrl: String(server.url),
    headers: { authorization },
  };
  const control = OpenCode.make(options);
  const client = createOpenCodeClient(options);
  const input = { sessionID: "test-session" };
  const cancellation = new AbortController();
  const cancelTimer = setTimeout(
    () => cancellation.abort(new Error("Cancelled by test")),
    100,
  );
  try {
    const results = await Promise.allSettled([
      control.session.wait(input, { signal: AbortSignal.timeout(15_000) }),
      client.session.wait(input, { signal: AbortSignal.timeout(15_000) }),
      client.session.wait(input, { signal: cancellation.signal }),
      client.session.wait(input, { signal: AbortSignal.timeout(100) }),
    ]);
    console.log(
      JSON.stringify(
        results.map((result) =>
          result.status === "fulfilled"
            ? { status: result.status }
            : {
                status: result.status,
                message: result.reason.message,
                causeName: result.reason.cause?.name,
                causeMessage: result.reason.cause?.message,
              },
        ),
      ),
    );
  } finally {
    clearTimeout(cancelTimer);
  }
} finally {
  server.stop(true);
}
