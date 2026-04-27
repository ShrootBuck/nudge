export default function Loading() {
  return (
    <main className="min-h-[60vh] px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <div className="rounded-[2rem] border border-border/70 bg-card/75 p-8 shadow-[0_18px_50px_-36px_rgba(15,23,42,0.45)] backdrop-blur">
          <div className="h-6 w-40 animate-pulse rounded-full bg-muted/70" />
          <div className="mt-6 h-12 w-full max-w-2xl animate-pulse rounded-2xl bg-muted/60" />
          <div className="mt-4 h-5 w-full max-w-xl animate-pulse rounded-full bg-muted/50" />
          <div className="mt-10 grid gap-3 sm:grid-cols-2">
            <div className="h-24 animate-pulse rounded-[1.4rem] bg-muted/50" />
            <div className="h-24 animate-pulse rounded-[1.4rem] bg-muted/40" />
          </div>
        </div>
      </div>
    </main>
  );
}
