"use client";

import {
  Check,
  ChevronDown,
  ListFilter,
  Search,
  SlidersHorizontal,
  Tag,
  X,
} from "lucide-react";
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
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import {
  DEFAULT_PROBLEM_SORT,
  PROBLEM_SORT_OPTIONS,
  type ProblemSort,
  problemSortLabel,
} from "./problem-sort";
import { MAX_RATING, MIN_RATING, RATING_STEP } from "./rating-constants";

export function ProblemFilters({
  query,
  tags,
  minRating,
  maxRating,
  sort,
  availableTags,
  totalCount,
}: {
  query: string;
  tags: string[];
  minRating: number;
  maxRating: number;
  sort: ProblemSort;
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
  const [ratingPopoverOpen, setRatingPopoverOpen] = useState(false);
  const [sortPopoverOpen, setSortPopoverOpen] = useState(false);

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

  function clearSearch() {
    clearTimeout(searchTimeoutRef.current);
    setSearchValue("");
    updateParams({ q: null });
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

  function updateSort(nextSort: ProblemSort) {
    setSortPopoverOpen(false);
    updateParams({
      sort: nextSort === DEFAULT_PROBLEM_SORT ? null : nextSort,
    });
  }

  function clearFilters() {
    clearTimeout(searchTimeoutRef.current);
    setSearchValue("");
    setSliderValue([MIN_RATING, MAX_RATING]);
    updateParams({
      q: null,
      tags: null,
      minRating: null,
      maxRating: null,
      sort: null,
    });
  }

  function resetRating() {
    setSliderValue([MIN_RATING, MAX_RATING]);
    updateParams({ minRating: null, maxRating: null });
  }

  const committedRatingActive =
    minRating !== MIN_RATING || maxRating !== MAX_RATING;
  const sliderRatingActive =
    sliderValue[0] !== MIN_RATING || sliderValue[1] !== MAX_RATING;
  const activeFilterCount =
    (query ? 1 : 0) +
    (committedRatingActive ? 1 : 0) +
    (tags.length > 0 ? 1 : 0);
  const sortLabel = problemSortLabel(sort);

  // Push selected tags to the top of the tag list for nicer UX.
  const sortedTagList = useMemo(() => {
    const selected = new Set(tags);
    const others = availableTags.filter((t) => !selected.has(t));
    return [...tags.filter((t) => availableTags.includes(t)), ...others];
  }, [availableTags, tags]);

  return (
    <div className="flex flex-col gap-4" aria-busy={isPending}>
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start">
        <div className="min-w-0 flex-1">
          <InputGroup className="h-11 rounded-xl border-border/60 bg-background/80 shadow-sm">
            <InputGroupInput
              placeholder="Search by name or contest ID..."
              value={searchValue}
              onChange={(e) => handleSearch(e.target.value)}
              className="text-sm placeholder:text-muted-foreground/50"
            />
            <InputGroupAddon align="inline-start">
              <Search />
            </InputGroupAddon>
            {searchValue && (
              <InputGroupAddon
                align="inline-end"
                aria-label="Clear search"
                className="cursor-pointer pr-2"
                onClick={clearSearch}
              >
                <X />
              </InputGroupAddon>
            )}
          </InputGroup>

          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>
              <span className="tabular-nums">
                {totalCount.toLocaleString()}
              </span>{" "}
              {totalCount === 1 ? "match" : "matches"}
            </span>
            {activeFilterCount > 0 && (
              <span>
                {activeFilterCount} active filter
                {activeFilterCount === 1 ? "" : "s"}
              </span>
            )}
            {isPending && <span>Updating...</span>}
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 xl:w-auto xl:grid-cols-[auto_auto_auto_auto]">
          <Popover open={sortPopoverOpen} onOpenChange={setSortPopoverOpen}>
            <PopoverTrigger
              render={
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full justify-between border-border/60 bg-background/80 shadow-sm xl:w-56"
                />
              }
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <ListFilter data-icon="inline-start" />
                <span className="truncate">{sortLabel}</span>
              </span>
              <ChevronDown data-icon="inline-end" />
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-0" sideOffset={6}>
              <Command>
                <CommandList>
                  <CommandGroup heading="Sort by">
                    {PROBLEM_SORT_OPTIONS.map((option) => (
                      <CommandItem
                        key={option.value}
                        value={option.value}
                        onSelect={() => updateSort(option.value)}
                        data-checked={option.value === sort}
                        className="cursor-pointer"
                      >
                        <div className="min-w-0">
                          <div className="truncate">{option.label}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {option.description}
                          </div>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          <Popover open={ratingPopoverOpen} onOpenChange={setRatingPopoverOpen}>
            <PopoverTrigger
              render={
                <Button
                  variant={committedRatingActive ? "secondary" : "outline"}
                  size="lg"
                  className="w-full justify-between border-border/60 shadow-sm xl:w-44"
                />
              }
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <SlidersHorizontal data-icon="inline-start" />
                <span className="truncate">
                  {sliderRatingActive
                    ? `${sliderValue[0]} - ${sliderValue[1]}`
                    : "Rating"}
                </span>
              </span>
              <ChevronDown data-icon="inline-end" />
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-4" sideOffset={6}>
              <div className="flex flex-col gap-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">Rating range</div>
                    <div className="mt-1 font-mono text-xs tabular-nums text-muted-foreground">
                      {sliderValue[0]} - {sliderValue[1]}
                    </div>
                  </div>
                  {sliderRatingActive && (
                    <Button variant="ghost" size="xs" onClick={resetRating}>
                      Reset
                    </Button>
                  )}
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
                />
                <div className="flex justify-between font-mono text-[10px] tabular-nums text-muted-foreground/70">
                  <span>{MIN_RATING}</span>
                  <span>{MAX_RATING}</span>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          <Popover open={tagPopoverOpen} onOpenChange={setTagPopoverOpen}>
            <PopoverTrigger
              render={
                <Button
                  variant={tags.length > 0 ? "secondary" : "outline"}
                  size="lg"
                  className="w-full justify-between border-border/60 shadow-sm xl:w-36"
                />
              }
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <Tag data-icon="inline-start" />
                <span className="truncate">
                  {tags.length > 0 ? `Tags (${tags.length})` : "Tags"}
                </span>
              </span>
              <ChevronDown data-icon="inline-end" />
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-0" sideOffset={6}>
              <Command
                // cmdk needs explicit filter for our string items
                filter={(value, search) =>
                  value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
                }
              >
                <CommandInput placeholder="Search tags..." />
                <CommandList>
                  <CommandEmpty>No tags found.</CommandEmpty>
                  <CommandGroup heading="Tags">
                    {sortedTagList.map((tag) => {
                      const selected = tags.includes(tag);
                      return (
                        <CommandItem
                          key={tag}
                          value={tag}
                          onSelect={() => toggleTag(tag)}
                          className="cursor-pointer"
                        >
                          <span
                            className={cn(
                              "flex size-4 items-center justify-center rounded border",
                              selected
                                ? "border-foreground bg-foreground text-background"
                                : "border-border",
                            )}
                          >
                            {selected && <Check />}
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

          {activeFilterCount > 0 && (
            <Button
              variant="ghost"
              size="lg"
              className="w-full xl:w-auto"
              onClick={clearFilters}
            >
              Clear filters
            </Button>
          )}
        </div>
      </div>

      {(tags.length > 0 || committedRatingActive) && (
        <div className="flex flex-wrap items-center gap-2">
          {committedRatingActive && (
            <Badge
              variant="outline"
              className="h-7 cursor-pointer gap-1 border-foreground/25 bg-background/80 pr-1.5 text-xs"
              render={<button type="button" onClick={resetRating} />}
            >
              {minRating} - {maxRating}
              <X data-icon="inline-end" />
            </Badge>
          )}

          {tags.map((tag) => (
            <Badge
              key={tag}
              variant="outline"
              className="h-7 cursor-pointer gap-1 border-foreground/25 bg-background/80 pr-1.5 text-xs"
              render={<button type="button" onClick={() => toggleTag(tag)} />}
            >
              {tag}
              <X data-icon="inline-end" />
            </Badge>
          ))}

          {tags.length > 1 && (
            <Button variant="ghost" size="xs" onClick={clearTags}>
              Clear tags
            </Button>
          )}
        </div>
      )}

      {tags.length === 0 && availableTags.length === 0 && (
        <div className="text-xs text-muted-foreground/50">No tags yet</div>
      )}
    </div>
  );
}
