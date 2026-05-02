"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { searchProblems } from "@/app/actions";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { ratingTone } from "@/lib/utils";

type SearchResult = {
  id: string;
  contestId: number;
  index: string;
  name: string;
  rating: number | null;
  tags: string[];
};

export function CommandMenu({
  open,
  setOpen,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [setOpen]);

  useEffect(() => {
    if (query.trim().length === 0) {
      setResults([]);
      return;
    }

    const delayDebounceFn = setTimeout(() => {
      startTransition(async () => {
        const data = await searchProblems(query);
        setResults(data);
      });
    }, 200);

    return () => clearTimeout(delayDebounceFn);
  }, [query]);

  const onSelect = (problem: SearchResult) => {
    setOpen(false);
    setQuery("");
    router.push(`/problem/${problem.contestId}/${problem.index}`);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <Command>
        <CommandInput
          placeholder="Search by ID (e.g. 1500A) or name..."
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          <CommandEmpty>
            {isPending ? "Searching..." : "No problems found."}
          </CommandEmpty>
          {results.length > 0 && (
            <CommandGroup heading="Results">
              {results.map((problem) => (
                <CommandItem
                  key={problem.id}
                  value={`${problem.contestId}${problem.index} ${problem.name}`}
                  onSelect={() => onSelect(problem)}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-muted-foreground">
                      {problem.contestId}
                      {problem.index}
                    </span>
                    <span>{problem.name}</span>
                    {problem.rating && (
                      <span
                        className={`ml-auto inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold ${ratingTone(
                          problem.rating,
                        )}`}
                      >
                        {problem.rating}
                      </span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
