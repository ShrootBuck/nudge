"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";

export function CurrentModel() {
  const [currentModel, setCurrentModel] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/current-model", {
          signal: controller.signal,
        });
        if (!response.ok) return;
        const data: unknown = await response.json();
        if (
          !controller.signal.aborted &&
          data !== null &&
          typeof data === "object" &&
          "currentModel" in data &&
          typeof data.currentModel === "string"
        ) {
          setCurrentModel(data.currentModel);
        }
      } catch {
        // This optional badge should never prevent navigation or reading a page.
      }
    }
    void load();
    return () => controller.abort();
  }, []);

  if (!currentModel) return null;

  return (
    <Badge
      variant="secondary"
      className="max-w-full min-w-0"
      title={`Nudge currently uses ${currentModel} to generate hints, editorials, and code writeups.`}
    >
      <span className="hidden shrink-0 sm:inline">Current AI model:</span>
      <span className="truncate">{currentModel}</span>
    </Badge>
  );
}
