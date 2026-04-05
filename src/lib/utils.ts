import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function ratingTone(rating: number | null): string {
  if (!rating) {
    return "border-border/70 bg-background/80 text-muted-foreground";
  }
  if (rating < 1200) {
    return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300 dark:text-emerald-200";
  }
  if (rating < 1600) {
    return "border-sky-500/20 bg-sky-500/10 text-sky-300 dark:text-sky-200";
  }
  if (rating < 1900) {
    return "border-violet-500/20 bg-violet-500/10 text-violet-300 dark:text-violet-200";
  }
  if (rating < 2200) {
    return "border-amber-500/20 bg-amber-500/10 text-amber-400 dark:text-amber-200";
  }
  if (rating < 2400) {
    return "border-orange-500/20 bg-orange-500/10 text-orange-400 dark:text-orange-200";
  }
  return "border-rose-500/20 bg-rose-500/10 text-rose-400 dark:text-rose-200";
}
