"use client";

import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import { CodeBlock } from "@/components/code-block";

export function ProblemMarkdown({ content }: { content: string }) {
  return (
    <div className="prose prose-neutral max-w-none text-[0.98rem] leading-7 dark:prose-invert prose-headings:font-semibold prose-headings:tracking-tight prose-p:text-foreground/80 prose-li:text-foreground/80 prose-strong:text-foreground prose-a:font-medium prose-a:text-foreground prose-a:underline prose-code:rounded-md prose-code:bg-muted/70 prose-code:px-1.5 prose-code:py-0.5 prose-code:font-mono prose-code:text-[0.9em] prose-code:before:content-none prose-code:after:content-none prose-pre:bg-transparent prose-pre:p-0 prose-pre:shadow-none prose-blockquote:border-l-2 prose-blockquote:border-border prose-blockquote:text-muted-foreground">
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          pre({ children }) {
            return <>{children}</>;
          },
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || "");
            const code = String(children).replace(/\n$/, "");

            if (match) {
              return <CodeBlock code={code} language={match[1]} />;
            }

            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
          a({ href, children, ...props }) {
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
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
