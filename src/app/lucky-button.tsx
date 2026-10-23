"use client";

import { Dices } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { getRandomProblem } from "./actions";

export function LuckyButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await getRandomProblem();
        if (result) {
          router.push(`/problem/${result.contestId}/${result.index}`);
        } else {
          setError("No problems are ready yet. Check back soon.");
        }
      } catch {
        setError("Couldn't pick a problem. Please try again.");
      }
    });
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        type="button"
        variant="outline"
        size="lg"
        onClick={handleClick}
        disabled={isPending}
        className="rounded-full"
      >
        <Dices data-icon="inline-start" />
        {isPending ? "Finding..." : "I'm Feeling Lucky"}
      </Button>
      {error && (
        <output className="text-sm text-muted-foreground">{error}</output>
      )}
    </div>
  );
}
