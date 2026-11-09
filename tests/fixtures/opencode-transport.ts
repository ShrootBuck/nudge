import { OpenCode } from "@opencode/client";
import { createOpenCodeClient } from "../../src/lib/ai/opencode-server";

// Model an idle timeout at the fetch boundary in an isolated process. Bun's
// environment-variable handling and coarse socket timer vary across versions;
// the contract is that Nudge disables idle timeouts but preserves AbortSignals.
const nativeFetch = globalThis.fetch;
globalThis.fetch = Object.assign(
  (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const disablesIdleTimeout =
      (init as { timeout?: boolean } | undefined)?.timeout === false;
    const signal = disablesIdleTimeout
      ? init?.signal
      : AbortSignal.any([
          AbortSignal.timeout(100),
          ...(init?.signal ? [init.signal] : []),
        ]);
    return nativeFetch(input, { ...init, signal });
  },
  { preconnect: nativeFetch.preconnect },
);
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
    await Bun.sleep(300);
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
