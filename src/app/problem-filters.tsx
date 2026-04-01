"use client";

import { Search, SlidersHorizontal, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Input } from "@/components/ui/input";

const RATING_TIERS = [
  { label: "< 1200", value: "0-1199" },
  { label: "1200\u20131599", value: "1200-1599" },
  { label: "1600\u20131899", value: "1600-1899" },
  { label: "1900\u20132199", value: "1900-2199" },
  { label: "2200+", value: "2200-9999" },
];

export function ProblemFilters({
  query,
  ratingFilter,
  tagFilter,
  totalCount,
}: {
  query: string;
  ratingFilter: string;
  tagFilter: string;
  totalCount: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [searchValue, setSearchValue] = useState(query);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setSearchValue(query);
  }, [query]);

  useEffect(() => {
    return () => clearTimeout(timeoutRef.current);
  }, []);

  function updateParams(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }
    params.delete("page");
    const qs = params.toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }

  function handleSearch(term: string) {
    setSearchValue(term);
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      updateParams({ q: term || null });
    }, 300);
  }

  function handleRating(value: string) {
    updateParams({ rating: ratingFilter === value ? null : value });
  }

  function clearTag() {
    updateParams({ tag: null });
  }

  return (
    <div className="space-y-5" aria-busy={isPending}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground/60" />
          <Input
            placeholder="Search by name or contest ID..."
            value={searchValue}
            onChange={(e) => handleSearch(e.target.value)}
            className="h-12 rounded-2xl border-border/60 bg-background/80 pr-4 pl-11 text-sm shadow-sm transition-all placeholder:text-muted-foreground/50 focus:bg-background"
          />
        </div>

        <div className="inline-flex items-center gap-2 self-start rounded-full border border-border/60 bg-background/80 px-4 py-2 text-xs text-muted-foreground shadow-sm">
          <SlidersHorizontal className="size-3.5" />
          <span className="tabular-nums">{totalCount.toLocaleString()}</span>
          <span>{totalCount === 1 ? "match" : "matches"}</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {RATING_TIERS.map((tier) => (
          <button
            key={tier.value}
            type="button"
            onClick={() => handleRating(tier.value)}
            className={`cursor-pointer rounded-full border px-3.5 py-2 text-xs font-medium transition-all ${
              ratingFilter === tier.value
                ? "border-foreground bg-foreground text-background shadow-sm"
                : "border-border/60 bg-background/70 text-muted-foreground hover:border-foreground/15 hover:text-foreground"
            }`}
          >
            {tier.label}
          </button>
        ))}
      </div>

      {tagFilter && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground/70">
            Filtered by tag
          </span>
          <button
            type="button"
            onClick={clearTag}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border/60 bg-background/80 px-3 py-1.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:border-foreground/15"
          >
            {tagFilter}
            <X className="size-3.5 text-muted-foreground/60" />
          </button>
        </div>
      )}
    </div>
  );
}
