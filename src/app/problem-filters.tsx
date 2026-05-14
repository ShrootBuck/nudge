"use client";

import { Check, Plus, Search, SlidersHorizontal, Tag, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { Badge } from "@/components/ui/badge";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { MAX_RATING, MIN_RATING, RATING_STEP } from "./rating-constants";

export function ProblemFilters({
  query,
  tags,
  minRating,
  maxRating,
  availableTags,
  totalCount,
}: {
  query: string;
  tags: string[];
  minRating: number;
  maxRating: number;
  availableTags: string[];
  totalCount: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [searchValue, setSearchValue] = useState(query);
  const [isPending, startTransition] = useTransition();

  // Local slider state for smooth dragging; commits to URL on release.
  const [sliderValue, setSliderValue] = useState<[number, number]>([
    minRating,
    maxRating,
  ]);

  const [tagPopoverOpen, setTagPopoverOpen] = useState(false);

  useEffect(() => {
    setSearchValue(query);
  }, [query]);

  useEffect(() => {
    setSliderValue([minRating, maxRating]);
  }, [minRating, maxRating]);

  useEffect(() => {
    return () => clearTimeout(searchTimeoutRef.current);
  }, []);

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }
      params.delete("page");
      // Drop legacy single-tag param if we're writing the new one.
      if ("tags" in updates) params.delete("tag");
      const qs = params.toString();
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    },
    [pathname, router, searchParams],
  );

  function handleSearch(term: string) {
    setSearchValue(term);
    clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      updateParams({ q: term || null });
    }, 300);
  }

  function commitRating(next: readonly number[]) {
    const [nextMin, nextMax] = next;
    updateParams({
      minRating: nextMin === MIN_RATING ? null : String(nextMin),
      maxRating: nextMax === MAX_RATING ? null : String(nextMax),
    });
  }

  function toggleTag(tag: string) {
    const next = tags.includes(tag)
      ? tags.filter((t) => t !== tag)
      : [...tags, tag];
    updateParams({ tags: next.length === 0 ? null : next.join(",") });
  }

  function clearTags() {
    updateParams({ tags: null });
  }

  function resetRating() {
    setSliderValue([MIN_RATING, MAX_RATING]);
    updateParams({ minRating: null, maxRating: null });
  }

  const ratingActive =
    sliderValue[0] !== MIN_RATING || sliderValue[1] !== MAX_RATING;

  // Push selected tags to the top of the tag list for nicer UX.
  const sortedTagList = useMemo(() => {
    const selected = new Set(tags);
    const others = availableTags.filter((t) => !selected.has(t));
    return [...tags.filter((t) => availableTags.includes(t)), ...others];
  }, [availableTags, tags]);

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

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="rounded-2xl border border-border/60 bg-background/60 px-4 py-3 shadow-sm">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Rating
            </span>
            <div className="flex items-center gap-2 text-xs">
              <span className="font-mono tabular-nums text-foreground">
                {sliderValue[0]}
              </span>
              <span className="text-muted-foreground/60">–</span>
              <span className="font-mono tabular-nums text-foreground">
                {sliderValue[1]}
              </span>
              {ratingActive && (
                <button
                  type="button"
                  onClick={resetRating}
                  className="ml-1 cursor-pointer rounded-full border border-border/60 px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:border-foreground/15 hover:text-foreground"
                >
                  Reset
                </button>
              )}
            </div>
          </div>
          <Slider
            min={MIN_RATING}
            max={MAX_RATING}
            step={RATING_STEP}
            minStepsBetweenValues={1}
            value={sliderValue}
            onValueChange={(value) => {
              if (Array.isArray(value)) {
                setSliderValue([value[0], value[1]] as [number, number]);
              }
            }}
            onValueCommitted={(value) => {
              if (Array.isArray(value)) {
                commitRating(value);
              }
            }}
            className="mt-1 mb-2"
          />
          <div className="mt-3 flex justify-between text-[10px] font-mono tabular-nums text-muted-foreground/60">
            <span>{MIN_RATING}</span>
            <span>{MAX_RATING}</span>
          </div>
        </div>

        <div className="rounded-2xl border border-border/60 bg-background/60 px-4 py-3 shadow-sm">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Tags
            </span>
            {tags.length > 0 && (
              <button
                type="button"
                onClick={clearTags}
                className="cursor-pointer rounded-full border border-border/60 px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:border-foreground/15 hover:text-foreground"
              >
                Clear ({tags.length})
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {tags.map((tag) => (
              <Badge
                key={tag}
                variant="outline"
                className="h-7 cursor-pointer gap-1 border-foreground/30 bg-background pr-1.5 text-xs"
                render={<button type="button" onClick={() => toggleTag(tag)} />}
              >
                {tag}
                <X className="size-3 opacity-60" />
              </Badge>
            ))}

            <Popover open={tagPopoverOpen} onOpenChange={setTagPopoverOpen}>
              <PopoverTrigger
                render={
                  <button
                    type="button"
                    className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-full border border-dashed border-border/70 bg-background/80 px-2.5 text-xs text-muted-foreground shadow-sm transition-colors hover:border-foreground/30 hover:text-foreground"
                  />
                }
              >
                {tags.length === 0 ? (
                  <>
                    <Tag className="size-3" />
                    <span>Pick tags</span>
                  </>
                ) : (
                  <>
                    <Plus className="size-3" />
                    <span>Add</span>
                  </>
                )}
              </PopoverTrigger>
              <PopoverContent align="start" className="w-72 p-0" sideOffset={6}>
                <Command
                  // cmdk needs explicit filter for our string items
                  filter={(value, search) =>
                    value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
                  }
                >
                  <CommandInput placeholder="Search tags..." />
                  <CommandList>
                    <CommandEmpty>No tags found.</CommandEmpty>
                    <CommandGroup>
                      {sortedTagList.map((tag) => {
                        const selected = tags.includes(tag);
                        return (
                          <CommandItem
                            key={tag}
                            value={tag}
                            onSelect={() => toggleTag(tag)}
                            data-checked={selected}
                          >
                            <span
                              className={`flex size-4 items-center justify-center rounded border ${
                                selected
                                  ? "border-foreground bg-foreground text-background"
                                  : "border-border"
                              }`}
                            >
                              {selected && <Check className="size-3" />}
                            </span>
                            <span className="truncate">{tag}</span>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            {tags.length === 0 && availableTags.length === 0 && (
              <span className="text-xs text-muted-foreground/50">
                No tags yet
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
