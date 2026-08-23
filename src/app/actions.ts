"use server";

import {
  getCachedProblemSearchResults,
  getRandomProblemPool,
} from "@/lib/problem-read-cache";

export async function getRandomProblem() {
  const pool = await getRandomProblemPool();
  if (pool.length === 0) return null;

  return pool[Math.floor(Math.random() * pool.length)];
}

export async function searchProblems(query: string) {
  if (typeof query !== "string") return [];

  const normalizedQuery = query.trim().toLowerCase().slice(0, 100);
  return getCachedProblemSearchResults(normalizedQuery);
}
