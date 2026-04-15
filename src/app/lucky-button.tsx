"use client";

import { Dices } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { getRandomProblem } from "./actions";

export function LuckyButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await getRandomProblem();
      if (result) {
        router.push(`/problem/${result.contestId}/${result.index}`);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-border/70 bg-background/80 px-4 py-2 text-sm font-medium text-muted-foreground shadow-sm transition hover:-translate-y-0.5 hover:border-foreground/15 hover:text-foreground hover:shadow-md disabled:pointer-events-none disabled:opacity-50"
    >
      <Dices className="size-4" />
      {isPending ? "Finding..." : "I'm Feeling Lucky"}
    </button>
  );
}
