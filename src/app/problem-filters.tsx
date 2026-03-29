"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useRef } from "react";
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
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function handleSearch(term: string) {
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
    <div className="space-y-3">
      {/* Search + count */}
      <div className="flex items-center gap-3">
        <Input
          placeholder="Search by name or contest ID..."
          defaultValue={query}
          onChange={(e) => handleSearch(e.target.value)}
          className="flex-1"
        />
        <span className="text-xs text-muted-foreground whitespace-nowrap tabular-nums">
          {totalCount.toLocaleString()} {totalCount === 1 ? "problem" : "problems"}
        </span>
      </div>

      {/* Rating filter pills */}
      <div className="flex flex-wrap gap-1.5">
        {RATING_TIERS.map((tier) => (
          <button
            key={tier.value}
            type="button"
            onClick={() => handleRating(tier.value)}
            className={`px-2.5 py-1 text-xs rounded-md border transition-colors cursor-pointer ${
              ratingFilter === tier.value
                ? "border-foreground/20 bg-foreground/10 text-foreground"
                : "border-border/50 text-muted-foreground hover:text-foreground hover:border-border"
            }`}
          >
            {tier.label}
          </button>
        ))}
      </div>

      {/* Active tag filter */}
      {tagFilter && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Tag:</span>
          <button
            type="button"
            onClick={clearTag}
            className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-md bg-foreground/10 text-foreground cursor-pointer hover:bg-foreground/20 transition-colors"
          >
            {tagFilter}
            <span className="text-muted-foreground">&times;</span>
          </button>
        </div>
      )}
    </div>
  );
}
