import { Skeleton } from "@/components/ui/skeleton";

export default function ProblemLoading() {
  return (
    <main id="main-content" tabIndex={-1} aria-busy="true" className="pb-20">
      <output className="sr-only">Loading problem...</output>
      <div
        className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8"
        aria-hidden="true"
      >
        <Skeleton className="mb-5 h-9 w-36 rounded-full sm:mb-6" />
        <div className="flex flex-col gap-5 rounded-[1.5rem] border border-border/70 bg-card/80 p-5 sm:rounded-[2rem] sm:p-8">
          <Skeleton className="h-7 w-28 rounded-full" />
          <Skeleton className="h-10 w-full max-w-lg" />
          <Skeleton className="h-5 w-full max-w-xl" />
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-8 w-36 rounded-full" />
        </div>
        <div className="mt-8 flex flex-col gap-3">
          <Skeleton className="mb-4 h-12 w-60 max-w-full" />
          {["first", "second", "third", "fourth", "fifth"].map((key) => (
            <Skeleton key={key} className="h-20 w-full rounded-[1.25rem]" />
          ))}
        </div>
      </div>
    </main>
  );
}
