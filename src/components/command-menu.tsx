"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
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

type SearchStatus = "idle" | "loading" | "success" | "error";

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
  const [status, setStatus] = useState<SearchStatus>("idle");
  const requestSequence = useRef(0);
  const [, startTransition] = useTransition();

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
    const normalizedQuery = query.trim();
    const requestId = ++requestSequence.current;

    if (normalizedQuery.length === 0) {
      setResults([]);
      setStatus("idle");
      return;
    }

    setStatus("loading");
    const delayDebounceFn = setTimeout(() => {
      void searchProblems(normalizedQuery)
        .then((data) => {
          if (requestSequence.current !== requestId) return;
          startTransition(() => {
            setResults(data);
            setStatus("success");
          });
        })
        .catch(() => {
          if (requestSequence.current !== requestId) return;
          setResults([]);
          setStatus("error");
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
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Search problems"
      description="Search completed Codeforces problems by ID or name."
      showCloseButton
    >
      <Command shouldFilter={false}>
        <CommandInput
          placeholder="Search by ID (e.g. 1500A) or name..."
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          <CommandEmpty
            className={status === "error" ? "text-destructive" : ""}
          >
            {status === "idle" && "Start typing to search."}
            {status === "loading" && "Searching..."}
            {status === "success" && "No problems found."}
            {status === "error" && "Search failed. Try again."}
          </CommandEmpty>
          {results.length > 0 && (
            <CommandGroup heading="Results">
              {results.map((problem) => (
                <CommandItem
                  key={problem.id}
                  value={`${problem.contestId}${problem.index} ${problem.name}`}
                  aria-label={`${problem.contestId}${problem.index}: ${problem.name}`}
                  onSelect={() => onSelect(problem)}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="shrink-0 font-mono text-muted-foreground">
                      {problem.contestId}
                      {problem.index}
                    </span>
                    <span className="min-w-0 truncate">{problem.name}</span>
                    {problem.rating !== null && (
                      <span
                        className={`ml-auto inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold ${ratingTone(
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
