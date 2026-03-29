import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { ProblemFilters } from "./problem-filters";

const PAGE_SIZE = 50;

function ratingColor(rating: number | null): string {
  if (!rating) return "text-muted-foreground";
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
    // Support searching by contest ID (e.g. "1A", "1234") or by name
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
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-16">
        {/* Header */}
        <div className="mb-10">
          <h1 className="text-3xl font-semibold tracking-tight mb-1">nudge</h1>
          <p className="text-sm text-muted-foreground">
            AI-generated hints, editorials, and solutions for competitive
            programming
          </p>
        </div>

        {/* Filters */}
        <ProblemFilters
          query={query}
          ratingFilter={ratingParam}
          tagFilter={tagParam}
          totalCount={totalCount}
        />

        {/* Problem list */}
        {problems.length === 0 ? (
          <div className="py-24 text-center">
            <p className="text-sm text-muted-foreground">
              {query || ratingParam || tagParam
                ? "No problems match your filters."
                : "No problems available yet. Check back soon."}
            </p>
          </div>
        ) : (
          <div className="mt-6 divide-y divide-border/50">
            {problems.map((problem) => (
              <Link
                key={problem.id}
                href={`/problem/${problem.contestId}/${problem.index}`}
                className="group flex items-start gap-4 py-3 px-3 -mx-3 rounded-lg transition-colors hover:bg-muted/50"
              >
                {/* Left: ID */}
                <div className="flex items-center gap-1.5 pt-0.5 shrink-0 w-20">
                  <span className="font-mono text-sm text-muted-foreground group-hover:text-foreground transition-colors">
                    {problem.contestId}
                    {problem.index}
                  </span>
                  {problem.verified && (
                    <span className="text-emerald-400 text-xs">&#10003;</span>
                  )}
                </div>

                {/* Center: Name + Tags */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium group-hover:text-foreground transition-colors truncate">
                    {problem.name}
                  </div>
                  {problem.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {problem.tags.map((tag) => (
                        <Badge
                          key={tag}
                          variant="secondary"
                          className="text-[10px] font-normal px-1.5 py-0 h-4"
                        >
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                {/* Right: Rating */}
                <div className="pt-0.5 shrink-0">
                  {problem.rating ? (
                    <span
                      className={`text-sm font-mono font-medium ${ratingColor(problem.rating)}`}
                    >
                      {problem.rating}
                    </span>
                  ) : (
                    <span className="text-sm font-mono text-muted-foreground/50">
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
          className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          &larr;
        </Link>
      ) : (
        <span className="px-3 py-1.5 text-sm text-muted-foreground/30">
          &larr;
        </span>
      )}

      {pages.map((p, i) =>
        p === "..." ? (
          <span
            key={`ellipsis-${i}`}
            className="px-2 py-1.5 text-sm text-muted-foreground/50"
          >
            ...
          </span>
        ) : (
          <Link
            key={p}
            href={pageUrl(p)}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              p === currentPage
                ? "bg-foreground/10 text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {p}
          </Link>
        ),
      )}

      {currentPage < totalPages ? (
        <Link
          href={pageUrl(currentPage + 1)}
          className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          &rarr;
        </Link>
      ) : (
        <span className="px-3 py-1.5 text-sm text-muted-foreground/30">
          &rarr;
        </span>
      )}
    </nav>
  );
}
