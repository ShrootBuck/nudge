import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <main id="main-content" tabIndex={-1} aria-busy="true" className="pb-16">
      <output className="sr-only">Loading problems...</output>
      <div
        className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8"
        aria-hidden="true"
      >
        <div className="grid gap-6 rounded-[1.5rem] border border-border/70 bg-card/80 p-5 sm:gap-8 sm:rounded-[2rem] sm:p-8 lg:grid-cols-[minmax(0,1fr)_16rem]">
          <div className="flex min-w-0 flex-col gap-5">
            <Skeleton className="h-7 w-full max-w-80 rounded-full" />
            <div className="flex flex-col gap-3">
              <Skeleton className="h-9 w-full sm:h-11" />
              <Skeleton className="h-9 w-4/5 sm:h-11" />
              <Skeleton className="h-9 w-3/5 sm:h-11" />
            </div>
            <div className="flex flex-col gap-3 py-1">
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-5/6" />
            </div>
            <Skeleton className="h-9 w-40 rounded-full" />
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
            {["completed", "verified"].map((key) => (
              <div
                key={key}
                className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-background/70 p-4"
              >
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-8 w-20" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            ))}
          </div>
        </div>
        <div className="mt-5 flex flex-col gap-3 rounded-[1.25rem] border border-border/70 bg-card/75 p-3 sm:mt-6 sm:rounded-[1.75rem] sm:p-6">
          <Skeleton className="h-11 w-full rounded-xl" />
          <Skeleton className="h-6 w-32" />
        </div>
        <div className="mt-8 flex flex-col gap-3">
          <Skeleton className="mb-4 h-7 w-44" />
          {["first", "second", "third"].map((key) => (
            <Skeleton key={key} className="h-36 w-full rounded-[1.25rem]" />
          ))}
        </div>
      </div>
    </main>
  );
}
