import { prisma } from "@/lib/prisma";
import {
  authorizedTranscriptRequest,
  readTranscript,
  removeTranscript,
  validTranscriptKey,
} from "@/lib/transcript-storage";

type Context = { params: Promise<{ key: string }> };

export async function GET(_request: Request, { params }: Context) {
  const { key } = await params;
  if (!validTranscriptKey(key))
    return new Response("Not found", { status: 404 });
  try {
    const body = await readTranscript(key);
    return new Response(new Uint8Array(body), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${key}"`,
        "Content-Length": String(body.byteLength),
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return new Response("Not found", { status: 404 });
    throw error;
  }
}

export async function DELETE(request: Request, { params }: Context) {
  if (!authorizedTranscriptRequest(request))
    return new Response("Unauthorized", { status: 401 });
  const { key } = await params;
  if (!validTranscriptKey(key))
    return new Response("Invalid key", { status: 400 });
  // Identical exports can share a content-addressed file. Keep any referenced file.
  if (
    await prisma.problem.count({
      where: {
        generationTranscriptUrl: { endsWith: `/api/transcripts/${key}` },
      },
    })
  ) {
    return new Response(null, { status: 204 });
  }
  await removeTranscript(key);
  return new Response(null, { status: 204 });
}
