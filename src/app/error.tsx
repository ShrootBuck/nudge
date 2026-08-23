"use client";

import { Home, RefreshCw, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function ErrorPage({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="flex min-h-[60vh] flex-1 items-center justify-center p-4"
    >
      <div className="mx-auto w-full max-w-lg rounded-[1.5rem] border border-border/70 bg-card/80 p-6 text-center shadow-[0_28px_70px_-40px_rgba(15,23,42,0.45)] backdrop-blur sm:rounded-[2rem] sm:p-10">
        <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-full border border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-200">
          <TriangleAlert className="size-7" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Something went sideways
        </h1>
        <p className="mt-3 text-sm/7 text-muted-foreground sm:text-base/7">
          Nudge could not load this page. The failure may be temporary, so try
          the request again before blaming the entire stack.
        </p>
        <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
          <Button size="lg" onClick={unstable_retry}>
            <RefreshCw data-icon="inline-start" />
            Try again
          </Button>
          <Button variant="outline" size="lg" render={<Link href="/" />}>
            <Home data-icon="inline-start" />
            Back to home
          </Button>
        </div>
      </div>
    </main>
  );
}
