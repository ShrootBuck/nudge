import type { Prisma } from "@prisma/client";
import {
  ArrowRight,
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  SearchX,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import { completedContentWhere, problemWhere } from "@/lib/problem-pipeline-db";
import { ratingTone } from "@/lib/utils";
import { LuckyButton } from "./lucky-button";
import { ProblemFilters } from "./problem-filters";

const PAGE_SIZE = 50;
function listableWhere(): Prisma.ProblemWhereInput {
  return problemWhere({
    AND: [
      completedContentWhere(),
      { reviewStatus: { notIn: ["UNSOLVABLE", "INCORRECT"] } },
    ],
  });
}

function buildPageUrl(
  searchParams: Record<string, string | string[] | undefined>,
  page: number,
) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (key !== "page" && typeof value === "string") {
      params.set(key, value);
    }
  }

  if (page > 1) {
    params.set("page", String(page));
  }

  const qs = params.toString();
  return qs ? `/?${qs}` : "/";
}

function countActiveFilters({
  query,
  rating,
  tag,
}: {
  query: string;
  rating: string;
  tag: string;
}) {
  return [query, rating, tag].filter(Boolean).length;
}

function formatProblemId(contestId: number, index: string) {
  return `${contestId}${index}`;
}

function reviewBadge(status: string) {
  switch (status) {
    case "VERIFIED":
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-300 dark:text-emerald-200">
          <BadgeCheck className="size-3" />
          Verified
        </span>
      );
    default:
      return null;
  }
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();

  const params = await searchParams;

  const page = Math.max(1, Number(params.page) || 1);
  const query = typeof params.q === "string" ? params.q.trim() : "";
  const ratingParam = typeof params.rating === "string" ? params.rating : "";
  const tagParam = typeof params.tag === "string" ? params.tag : "";

  const where: Prisma.ProblemWhereInput = {
    ...listableWhere(),
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

  const [totalCount, verifiedCount] = await Promise.all([
    prisma.problem.count({ where }),
    prisma.problem.count({
      where: { ...listableWhere(), reviewStatus: "VERIFIED" },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const safePage = totalCount === 0 ? 1 : Math.min(page, totalPages);

  if (safePage !== page) {
    redirect(buildPageUrl(params, safePage));
  }

  const problems = await prisma.problem.findMany({
    where,
    orderBy: [{ reviewStatus: "desc" }, { updatedAt: "desc" }],
    skip: (safePage - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      contestId: true,
      index: true,
      name: true,
      rating: true,
      tags: true,
      reviewStatus: true,
    },
  });

  const activeFilterCount = countActiveFilters({
    query,
    rating: ratingParam,
    tag: tagParam,
  });

  return (
    <main className="min-h-screen pb-16">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <section className="relative overflow-hidden rounded-[2rem] border border-border/70 bg-card/80 p-6 shadow-[0_28px_70px_-40px_rgba(15,23,42,0.45)] backdrop-blur sm:p-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.12),transparent_32%),radial-gradient(circle_at_85%_15%,rgba(245,158,11,0.16),transparent_28%)]" />

          <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/80 px-3 py-1 text-xs font-medium tracking-wide text-muted-foreground shadow-sm">
                <Sparkles className="size-3.5" />
                Competitive programming, slower and smarter
              </span>

              <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
                Get unstuck without skipping straight to the answer.
              </h1>

              <p className="mt-4 max-w-2xl text-base/7 text-muted-foreground sm:text-lg/8">
                Nudge stores completed Codeforces problems with progressive
                hints, a clean editorial, and the full C++ write-up once you
                actually want it.
              </p>

              <div className="mt-6">
                <LuckyButton />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              <StatCard
                label={
                  activeFilterCount ? "Matching problems" : "Completed problems"
                }
                value={totalCount.toLocaleString()}
                detail={
                  activeFilterCount
                    ? `${activeFilterCount} active filter${activeFilterCount === 1 ? "" : "s"}`
                    : "ready to read"
                }
              />
              <StatCard
                label="Verified writeups"
                value={verifiedCount.toLocaleString()}
                detail="manually checked so far"
              />
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-[1.75rem] border border-border/70 bg-card/75 p-4 shadow-[0_18px_50px_-36px_rgba(15,23,42,0.45)] backdrop-blur sm:p-6">
          <ProblemFilters
            query={query}
            ratingFilter={ratingParam}
            tagFilter={tagParam}
            totalCount={totalCount}
          />
        </section>

        <section className="mt-8">
          <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">
                Browse problems
              </h2>
              <p className="text-sm text-muted-foreground">
                Problem IDs link straight to the full hint stack and editorial.
              </p>
            </div>
          </div>

          {problems.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-[1.75rem] border border-dashed border-border/60 bg-card/65 px-6 py-18 text-center shadow-[0_18px_50px_-36px_rgba(15,23,42,0.45)]">
              <div className="mb-4 rounded-full border border-border/60 bg-background/80 p-3 text-muted-foreground shadow-sm">
                <SearchX className="size-5" />
              </div>
              <div className="text-sm text-muted-foreground">
                {query || ratingParam || tagParam
                  ? "No problems match your filters."
                  : "No problems available yet. Check back soon."}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {problems.map((problem) => (
                <Link
                  key={problem.id}
                  href={`/problem/${problem.contestId}/${problem.index}`}
                  className="group relative block overflow-hidden rounded-[1.5rem] border border-border/60 bg-card/75 p-4 shadow-[0_18px_50px_-36px_rgba(15,23,42,0.45)] transition duration-200 hover:-translate-y-0.5 hover:border-foreground/15 hover:shadow-[0_24px_60px_-36px_rgba(15,23,42,0.5)] sm:p-5"
                >
                  <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(56,189,248,0.08),transparent_32%,rgba(245,158,11,0.1))] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

                  <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-mono font-medium text-muted-foreground">
                          {formatProblemId(problem.contestId, problem.index)}
                        </span>

                        {reviewBadge(problem.reviewStatus)}

                        {problem.rating && (
                          <span
                            className={`inline-flex items-center rounded-full border px-2.5 py-1 font-mono text-[11px] font-semibold sm:hidden ${ratingTone(problem.rating)}`}
                          >
                            {problem.rating}
                          </span>
                        )}
                      </div>

                      <h3 className="mt-3 text-lg font-semibold tracking-tight sm:text-xl">
                        <span className="inline-flex items-baseline gap-2 text-balance">
                          <span>{problem.name}</span>
                          <ArrowRight className="size-4 shrink-0 translate-y-[0.02em] text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-foreground" />
                        </span>
                      </h3>

                      {problem.tags.length > 0 && (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {problem.tags.map((tag) => (
                            <span
                              key={tag}
                              className="inline-flex items-center rounded-full border border-border/60 bg-background/70 px-2.5 py-1 text-xs text-muted-foreground"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="hidden shrink-0 sm:block">
                      <span
                        className={`inline-flex items-center rounded-full border px-3 py-1.5 font-mono text-xs font-semibold ${ratingTone(problem.rating)}`}
                      >
                        {problem.rating ?? "unrated"}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {totalPages > 1 && (
          <Pagination
            currentPage={safePage}
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
  const pages: Array<number | "ellipsis-left" | "ellipsis-right"> = [];

  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (currentPage > 3) pages.push("ellipsis-left");
    for (
      let i = Math.max(2, currentPage - 1);
      i <= Math.min(totalPages - 1, currentPage + 1);
      i++
    ) {
      pages.push(i);
    }
    if (currentPage < totalPages - 2) pages.push("ellipsis-right");
    pages.push(totalPages);
  }

  return (
    <nav className="mt-10 flex items-center justify-center gap-1.5">
      {currentPage > 1 ? (
        <Link
          href={buildPageUrl(searchParams, currentPage - 1)}
          scroll={false}
          className="inline-flex size-10 items-center justify-center rounded-full border border-border/60 bg-card/75 text-muted-foreground transition hover:border-foreground/15 hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
        </Link>
      ) : (
        <span className="inline-flex size-10 items-center justify-center rounded-full border border-border/40 bg-card/40 text-muted-foreground/30">
          <ChevronLeft className="size-4" />
        </span>
      )}

      {pages.map((p) =>
        p === "ellipsis-left" || p === "ellipsis-right" ? (
          <span
            key={p}
            className="inline-flex size-10 items-center justify-center text-sm text-muted-foreground/40"
          >
            ...
          </span>
        ) : (
          <Link
            key={p}
            href={buildPageUrl(searchParams, p)}
            scroll={false}
            className={`inline-flex size-10 items-center justify-center rounded-full border text-sm transition ${
              p === currentPage
                ? "border-foreground bg-foreground font-medium text-background shadow-sm"
                : "border-border/60 bg-card/75 text-muted-foreground hover:border-foreground/15 hover:text-foreground"
            }`}
          >
            {p}
          </Link>
        ),
      )}

      {currentPage < totalPages ? (
        <Link
          href={buildPageUrl(searchParams, currentPage + 1)}
          scroll={false}
          className="inline-flex size-10 items-center justify-center rounded-full border border-border/60 bg-card/75 text-muted-foreground transition hover:border-foreground/15 hover:text-foreground"
        >
          <ChevronRight className="size-4" />
        </Link>
      ) : (
        <span className="inline-flex size-10 items-center justify-center rounded-full border border-border/40 bg-card/40 text-muted-foreground/30">
          <ChevronRight className="size-4" />
        </span>
      )}
    </nav>
  );
}

function StatCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-[1.4rem] border border-border/70 bg-background/78 p-4 shadow-sm backdrop-blur">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
    </div>
  );
}
