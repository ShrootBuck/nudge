import type { Metadata } from "next";
import { createPageMetadata } from "@/lib/site-metadata";

export const metadata: Metadata = createPageMetadata({
  title: "Request a problem",
  description:
    "Request progressive hints, an editorial, and a C++ solution for a Codeforces problem.",
  path: "/request",
});

export default function RequestLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
