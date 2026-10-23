"use server";

import {
  getCachedProblemSearchResults,
  getRandomProblemPool,
} from "@/lib/problem-read-cache";
import { normalizeProblemSearch } from "@/lib/problem-search";

export async function getRandomProblem() {
  const pool = await getRandomProblemPool();
  if (pool.length === 0) return null;

  return pool[Math.floor(Math.random() * pool.length)];
}

export async function searchProblems(query: string) {
  if (typeof query !== "string") return [];

  const normalizedQuery = normalizeProblemSearch(query).toLowerCase();
  return getCachedProblemSearchResults(normalizedQuery);
}
