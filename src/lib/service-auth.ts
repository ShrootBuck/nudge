import { timingSafeEqual } from "node:crypto";

// Server-only credential shared by the trusted local generator and Nudge.
export function authorizedServiceRequest(request: Request) {
  const secret = process.env.CACHE_REVALIDATION_SECRET?.trim();
  if (!secret) return false;
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return (
    supplied.length === expected.length && timingSafeEqual(supplied, expected)
  );
}
