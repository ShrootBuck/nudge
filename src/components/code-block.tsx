"use client";

import { Check, Copy, Download } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type CopyState = "idle" | "copied" | "error";

export function CodeBlock({
  code,
  language = "cpp",
  showActions = false,
  downloadFileName,
  children,
}: {
  code: string;
  language?: string;
  showActions?: boolean;
  downloadFileName?: string;
  children: ReactNode;
}) {
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const copyResetTimeoutRef = useRef<number | null>(null);
  const fileName = downloadFileName ?? `snippet.${language}`;

  useEffect(() => {
    return () => {
      if (copyResetTimeoutRef.current !== null) {
        window.clearTimeout(copyResetTimeoutRef.current);
      }
    };
  }, []);

  function queueCopyStateReset() {
    if (copyResetTimeoutRef.current !== null) {
      window.clearTimeout(copyResetTimeoutRef.current);
    }

    copyResetTimeoutRef.current = window.setTimeout(() => {
      setCopyState("idle");
      copyResetTimeoutRef.current = null;
    }, 1800);
  }

  async function handleCopy() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(code);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = code;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "absolute";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();

        try {
          if (!document.execCommand("copy")) {
            throw new Error("Copy command failed");
          }
        } finally {
          textarea.remove();
        }
      }

      setCopyState("copied");
    } catch {
      setCopyState("error");
    }

    queueCopyStateReset();
  }

  function handleDownload() {
    const blob = new Blob([code], {
      type: "text/x-c++src;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="max-w-full overflow-hidden rounded-xl border border-border/70 shadow-[0_16px_40px_-28px_rgba(15,23,42,0.55)] sm:rounded-2xl">
      {showActions && (
        <div className="flex items-center justify-end gap-2 border-b border-border/70 bg-gradient-to-r from-background/95 via-background/90 to-muted/55 px-3 py-2 sm:px-4">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            className={cn(
              "cursor-pointer rounded-lg border-border/60 bg-background/80 text-muted-foreground shadow-sm transition hover:bg-background hover:text-foreground",
              copyState === "copied" &&
                "border-emerald-500/30 text-emerald-600 hover:text-emerald-700 dark:text-emerald-300 dark:hover:text-emerald-200",
              copyState === "error" &&
                "border-destructive/30 text-destructive hover:text-destructive",
            )}
            onClick={handleCopy}
            aria-label={
              copyState === "copied"
                ? "Code copied"
                : copyState === "error"
                  ? "Copy failed"
                  : "Copy code"
            }
            title={
              copyState === "copied"
                ? "Copied"
                : copyState === "error"
                  ? "Copy failed"
                  : "Copy code"
            }
          >
            {copyState === "copied" ? (
              <Check className="size-3.5" />
            ) : (
              <Copy className="size-3.5" />
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            className="cursor-pointer rounded-lg border-border/60 bg-background/80 text-muted-foreground shadow-sm transition hover:bg-background hover:text-foreground"
            onClick={handleDownload}
            aria-label={`Download ${fileName}`}
            title={`Download ${fileName}`}
          >
            <Download className="size-3.5" />
          </Button>
        </div>
      )}
      {children}
    </div>
  );
}
