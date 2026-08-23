type FetchWithTimeoutOptions = RequestInit & {
  timeoutMs?: number;
};

export async function readResponseBytesWithLimit(
  response: Response,
  maxBytes: number,
  description = "Response",
) {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error(`${description} exceeds the ${maxBytes}-byte limit`);
  }

  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new Error(`${description} exceeds the ${maxBytes}-byte limit`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function readResponseTextWithLimit(
  response: Response,
  maxBytes: number,
  description?: string,
) {
  const body = await readResponseBytesWithLimit(
    response,
    maxBytes,
    description,
  );
  return new TextDecoder().decode(body);
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  options: FetchWithTimeoutOptions = {},
): Promise<Response> {
  const { timeoutMs = 15_000, signal: callerSignal, ...init } = options;
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = callerSignal
    ? AbortSignal.any([callerSignal, timeoutSignal])
    : timeoutSignal;

  try {
    return await fetch(input, {
      ...init,
      signal,
    });
  } catch (error) {
    if (timeoutSignal.aborted && !callerSignal?.aborted) {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }

    throw error;
  }
}
