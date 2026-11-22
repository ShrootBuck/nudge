"use client";

import type { MouseEvent } from "react";
import { useEffect, useRef } from "react";

const EXTENSIONS: Record<string, string> = {
  "c++": "cpp",
  cc: "cpp",
  cxx: "cpp",
  javascript: "js",
  plaintext: "txt",
  python: "py",
  py3: "py",
  rust: "rs",
  shell: "sh",
  bash: "sh",
  text: "txt",
  typescript: "ts",
};

function fileExtension(language: string | null | undefined) {
  const normalized = (language ?? "").toLowerCase();
  if (!/^[a-z0-9+#]+$/.test(normalized)) return "txt";
  return EXTENSIONS[normalized] ?? normalized.replace(/[^a-z0-9]/g, "");
}

async function writeClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  try {
    if (!document.execCommand("copy")) throw new Error("Copy command failed");
  } finally {
    textarea.remove();
  }
}

/**
 * Displays Markdown that the server already rendered and sanitized with
 * Pierre Words. The only client work is wiring the code block buttons.
 */
export function ProblemMarkdown({
  html,
  downloadName,
}: {
  html: string;
  /** Base file name (without extension) for code block downloads. */
  downloadName?: string;
}) {
  const timers = useRef(new Map<HTMLButtonElement, number>());

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) window.clearTimeout(timer);
    };
  }, []);

  function flash(button: HTMLButtonElement, state: "copied" | "error") {
    const label = button.querySelector("span");
    button.dataset.state = state;
    if (label) label.textContent = state === "copied" ? "Copied" : "Failed";
    window.clearTimeout(timers.current.get(button));
    timers.current.set(
      button,
      window.setTimeout(() => {
        delete button.dataset.state;
        if (label) label.textContent = "Copy";
        timers.current.delete(button);
      }, 1800),
    );
  }

  async function handleClick(event: MouseEvent<HTMLDivElement>) {
    const button = (event.target as Element).closest<HTMLButtonElement>(
      "button[data-code-action]",
    );
    if (!button || !event.currentTarget.contains(button)) return;
    const block = button.closest<HTMLElement>('[data-markdown="code-block"]');
    const code = block?.querySelector("pre code")?.textContent ?? "";

    if (button.dataset.codeAction === "copy") {
      try {
        await writeClipboard(code);
        flash(button, "copied");
      } catch {
        flash(button, "error");
      }
      return;
    }

    const extension = fileExtension(block?.getAttribute("data-language"));
    const url = URL.createObjectURL(
      new Blob([code], { type: "text/plain;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `${downloadName ?? "nudge-snippet"}.${extension}`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents lint/a11y/noStaticElementInteractions: Delegates clicks to the real <button> elements inside; keyboard activation of those buttons fires click too.
    <div
      data-markdown="root"
      className="nudge-markdown"
      onClick={handleClick}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: Rendered on the server by Pierre Words with raw HTML disabled, images removed, and URLs restricted to http(s), mailto, and in-page anchors.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
