import { FileQuestion, Home } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "404 Not Found | Nudge",
  description: "The page you're looking for doesn't exist.",
};

export default function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center p-4 min-h-[60vh]">
      <div className="mx-auto w-full max-w-md text-center">
        <div className="relative mx-auto mb-8 flex h-24 w-24 items-center justify-center rounded-full border border-border/70 bg-card/80 shadow-[0_28px_70px_-40px_rgba(15,23,42,0.45)] backdrop-blur">
          <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.12),transparent_32%)]" />
          <FileQuestion
            className="relative size-10 text-muted-foreground"
            strokeWidth={1.5}
          />
        </div>

        <h1 className="mb-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Page not found
        </h1>
        <p className="mb-8 text-base/7 text-muted-foreground">
          We couldn&apos;t find the page you were looking for. It might have
          been moved or deleted.
        </p>

        <Link
          href="/"
          className="inline-flex items-center justify-center gap-2 rounded-full border border-border/70 bg-background px-6 py-2.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
        >
          <Home className="size-4" />
          Back to home
        </Link>
      </div>
    </main>
  );
}
