export default function Loading() {
  return (
    <main className="min-h-[60vh] px-4 py-10 sm:px-6 sm:py-16 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <div className="rounded-[1.5rem] border border-border/70 bg-card/75 p-5 shadow-[0_18px_50px_-36px_rgba(15,23,42,0.45)] backdrop-blur sm:rounded-[2rem] sm:p-8">
          <div className="h-6 w-40 animate-pulse rounded-full bg-muted/70" />
          <div className="mt-6 h-12 w-full max-w-2xl animate-pulse rounded-2xl bg-muted/60" />
          <div className="mt-4 h-5 w-full max-w-xl animate-pulse rounded-full bg-muted/50" />
          <div className="mt-8 grid gap-3 sm:mt-10 sm:grid-cols-2">
            <div className="h-20 animate-pulse rounded-[1.15rem] bg-muted/50 sm:h-24 sm:rounded-[1.4rem]" />
            <div className="h-20 animate-pulse rounded-[1.15rem] bg-muted/40 sm:h-24 sm:rounded-[1.4rem]" />
          </div>
        </div>
      </div>
    </main>
  );
}
