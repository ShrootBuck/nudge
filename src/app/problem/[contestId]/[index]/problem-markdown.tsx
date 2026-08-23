"use client";

import { MarkdownClient } from "@comark/react";
import { Math as MathBlock } from "@comark/react/plugins/math";
import type { ComponentProps } from "react";
import { markdownOptions, markdownPlugins } from "@/lib/markdown";
import { cn } from "@/lib/utils";

export function StyledPre({
  className,
  children,
  ...props
}: ComponentProps<"pre">) {
  return (
    <pre
      className={cn(
        "m-0 max-w-full overflow-x-auto p-4 text-[13px] sm:p-6 sm:text-sm [&_code]:bg-transparent [&_code]:p-0",
        className,
      )}
      {...props}
    >
      {children}
    </pre>
  );
}

function ProsePre(props: ComponentProps<"pre">) {
  return (
    <div className="max-w-full overflow-hidden rounded-xl border border-border/70 shadow-[0_16px_40px_-28px_rgba(15,23,42,0.55)] sm:rounded-2xl">
      <StyledPre {...props} />
    </div>
  );
}

function ProseLink({ href, children, ...props }: ComponentProps<"a">) {
  const isExternal = href?.startsWith("http");

  return (
    <a
      href={href}
      target={isExternal ? "_blank" : undefined}
      rel={isExternal ? "noreferrer noopener" : undefined}
      {...props}
    >
      {children}
    </a>
  );
}

export function ProblemMarkdown({ content }: { content: string }) {
  return (
    <div className="prose prose-neutral max-w-full min-w-0 overflow-hidden text-[0.95rem] leading-7 dark:prose-invert sm:text-[0.98rem] prose-headings:font-semibold prose-headings:tracking-tight prose-p:break-words prose-p:text-foreground/80 prose-li:break-words prose-li:text-foreground/80 prose-strong:text-foreground prose-a:break-words prose-a:font-medium prose-a:text-foreground prose-a:underline prose-code:break-words prose-code:rounded-md prose-code:bg-muted/70 prose-code:px-1.5 prose-code:py-0.5 prose-code:font-mono prose-code:text-[0.9em] prose-code:before:content-none prose-code:after:content-none prose-pre:max-w-full prose-pre:bg-transparent prose-pre:p-0 prose-pre:shadow-none prose-blockquote:border-l-2 prose-blockquote:border-border prose-blockquote:text-muted-foreground [&_.katex-display]:max-w-full [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto">
      <MarkdownClient
        value={content}
        options={markdownOptions}
        plugins={markdownPlugins}
        components={{ Math: MathBlock, pre: ProsePre, a: ProseLink }}
      />
    </div>
  );
}
