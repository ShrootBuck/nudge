import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { ProblemFilters } from "./problem-filters";

const PAGE_SIZE = 50;

function ratingColor(rating: number | null): string {
  if (!rating) return "text-muted-foreground/50";
  if (rating < 1200) return "text-emerald-400";
  if (rating < 1600) return "text-cyan-400";
  if (rating < 1900) return "text-violet-400";
  if (rating < 2200) return "text-amber-400";
  if (rating < 2400) return "text-orange-400";
  return "text-red-400";
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  const page = Math.max(1, Number(params.page) || 1);
  const query = typeof params.q === "string" ? params.q.trim() : "";
  const ratingParam = typeof params.rating === "string" ? params.rating : "";
  const tagParam = typeof params.tag === "string" ? params.tag : "";

  // Build where clause — only show completed problems
  const where: Record<string, unknown> = {
    generationStatus: "COMPLETED" as const,
  };

  if (query) {
    const contestMatch = query.match(/^(\d+)([A-Za-z]\d?)?$/);
    if (contestMatch) {
      where.contestId = Number(contestMatch[1]);
      if (contestMatch[2]) {
        where.index = contestMatch[2].toUpperCase();
      }
    } else {
      where.name = { contains: query, mode: "insensitive" };
    }
  }

  if (ratingParam) {
    const [min, max] = ratingParam.split("-").map(Number);
    if (!Number.isNaN(min) && !Number.isNaN(max)) {
      where.rating = { gte: min, lte: max };
    }
  }

  if (tagParam) {
    where.tags = { has: tagParam };
  }

  const [problems, totalCount] = await Promise.all([
    prisma.problem.findMany({
      where,
      orderBy: [{ rating: "asc" }, { contestId: "desc" }, { index: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        contestId: true,
        index: true,
        name: true,
        rating: true,
        tags: true,
        verified: true,
      },
    }),
    prisma.problem.count({ where }),
  ]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-4xl px-6 py-16 sm:py-20">
        {/* Header */}
        <header className="mb-12">
          <h1 className="text-4xl font-bold tracking-tight">nudge</h1>
          <p className="mt-2 text-base text-muted-foreground">
            AI-powered hints, editorials, and solutions for competitive
            programming
          </p>
        </header>

        {/* Filters */}
        <ProblemFilters
          query={query}
          ratingFilter={ratingParam}
          tagFilter={tagParam}
          totalCount={totalCount}
        />

        {/* Problem list */}
        {problems.length === 0 ? (
          <div className="mt-8 flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 py-20">
            <div className="text-muted-foreground/60 text-sm">
              {query || ratingParam || tagParam
                ? "No problems match your filters."
                : "No problems available yet. Check back soon."}
            </div>
          </div>
        ) : (
          <div className="mt-8 overflow-hidden rounded-xl border border-border/50 bg-card/40">
            {problems.map((problem) => (
              <Link
                key={problem.id}
                href={`/problem/${problem.contestId}/${problem.index}`}
                className="group flex items-start gap-4 border-b border-border/30 px-5 py-3.5 transition-colors last:border-b-0 hover:bg-muted/30"
              >
                {/* ID + verified */}
                <div className="flex shrink-0 items-center gap-1.5 pt-0.5 w-16">
                  <span className="font-mono text-sm text-muted-foreground transition-colors group-hover:text-foreground/70">
                    {problem.contestId}
                    {problem.index}
                  </span>
                  {problem.verified && (
                    <span className="text-emerald-400 text-xs">&#10003;</span>
                  )}
                </div>

                {/* Name + tags */}
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-medium leading-snug transition-colors group-hover:text-foreground truncate">
                    {problem.name}
                  </p>
                  {problem.tags.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {problem.tags.map((tag) => (
                        <Badge
                          key={tag}
                          variant="secondary"
                          className="text-[10px] font-normal px-1.5 py-0 h-4 bg-muted/60 text-muted-foreground"
                        >
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                {/* Rating */}
                <div className="shrink-0 pt-0.5">
                  {problem.rating ? (
                    <span
                      className={`text-sm font-mono font-semibold ${ratingColor(problem.rating)}`}
                    >
                      {problem.rating}
                    </span>
                  ) : (
                    <span className="text-sm font-mono text-muted-foreground/30">
                      &mdash;
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            searchParams={params}
          />
        )}
      </div>
    </main>
  );
}

function Pagination({
  currentPage,
  totalPages,
  searchParams,
}: {
  currentPage: number;
  totalPages: number;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  function pageUrl(page: number) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      if (key !== "page" && typeof value === "string") {
        params.set(key, value);
      }
    }
    if (page > 1) params.set("page", String(page));
    const qs = params.toString();
    return qs ? `/?${qs}` : "/";
  }

  const pages: (number | "...")[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (currentPage > 3) pages.push("...");
    for (
      let i = Math.max(2, currentPage - 1);
      i <= Math.min(totalPages - 1, currentPage + 1);
      i++
    ) {
      pages.push(i);
    }
    if (currentPage < totalPages - 2) pages.push("...");
    pages.push(totalPages);
  }

  return (
    <nav className="mt-10 flex items-center justify-center gap-1">
      {currentPage > 1 ? (
        <Link
          href={pageUrl(currentPage - 1)}
          className="flex size-9 items-center justify-center rounded-lg text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
        >
          &larr;
        </Link>
      ) : (
        <span className="flex size-9 items-center justify-center text-sm text-muted-foreground/25">
          &larr;
        </span>
      )}

      {pages.map((p, i) =>
        p === "..." ? (
          <span
            key={`ellipsis-${i}`}
            className="flex size-9 items-center justify-center text-sm text-muted-foreground/40"
          >
            ...
          </span>
        ) : (
          <Link
            key={p}
            href={pageUrl(p)}
            className={`flex size-9 items-center justify-center rounded-lg text-sm transition-colors ${
              p === currentPage
                ? "bg-foreground/10 font-medium text-foreground"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            }`}
          >
            {p}
          </Link>
        ),
      )}

      {currentPage < totalPages ? (
        <Link
          href={pageUrl(currentPage + 1)}
          className="flex size-9 items-center justify-center rounded-lg text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
        >
          &rarr;
        </Link>
      ) : (
        <span className="flex size-9 items-center justify-center text-sm text-muted-foreground/25">
          &rarr;
        </span>
      )}
    </nav>
  );
}
