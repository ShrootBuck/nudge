import {
  authorizedTranscriptRequest,
  MAX_TRANSCRIPT_BYTES,
  storeTranscript,
  TRANSCRIPT_ROUTE,
} from "@/lib/transcript-storage";

export async function POST(request: Request) {
  if (!authorizedTranscriptRequest(request))
    return new Response("Unauthorized", { status: 401 });
  if (!request.body) return new Response("Missing body", { status: 400 });
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_TRANSCRIPT_BYTES) {
        await reader.cancel();
        return new Response("Transcript too large", { status: 413 });
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = Buffer.concat(chunks);
  try {
    JSON.parse(body.toString("utf8"));
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  const key = await storeTranscript(body);
  return Response.json({ path: `${TRANSCRIPT_ROUTE}${key}` });
}
