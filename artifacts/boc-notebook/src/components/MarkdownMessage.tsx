import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { cn } from "@/lib/utils";

interface MarkdownMessageProps {
  content: string;
  className?: string;
}

export function MarkdownMessage({ content, className }: MarkdownMessageProps) {
  return (
    <div
      className={cn(
        "prose prose-sm dark:prose-invert max-w-none break-words",
        "prose-p:my-2 prose-p:leading-relaxed first:prose-p:mt-0 last:prose-p:mb-0",
        "prose-headings:my-2 prose-headings:font-semibold",
        "prose-h1:text-base prose-h2:text-base prose-h3:text-sm prose-h4:text-sm",
        "prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5",
        "prose-blockquote:my-2 prose-blockquote:border-l-2 prose-blockquote:pl-3 prose-blockquote:italic",
        "prose-code:before:content-none prose-code:after:content-none",
        "prose-code:rounded prose-code:bg-background/60 prose-code:px-1 prose-code:py-0.5 prose-code:text-[0.85em] prose-code:font-mono",
        "prose-pre:my-2 prose-pre:rounded-md prose-pre:bg-background/80 prose-pre:p-2 prose-pre:text-xs prose-pre:overflow-x-auto",
        "prose-a:text-primary prose-a:underline-offset-2 hover:prose-a:underline",
        "prose-hr:my-3",
        className,
      )}
      data-testid="markdown-content"
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          a: ({ node, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer nofollow" />
          ),
          table: ({ node, ...props }) => (
            <div className="my-2 overflow-x-auto">
              <table
                {...props}
                className="min-w-full border-collapse text-xs"
              />
            </div>
          ),
          th: ({ node, ...props }) => (
            <th
              {...props}
              className="border border-border bg-background/60 px-2 py-1 text-left font-semibold"
            />
          ),
          td: ({ node, ...props }) => (
            <td {...props} className="border border-border px-2 py-1 align-top" />
          ),
          pre: ({ node, ...props }) => (
            <pre {...props} className="my-2 overflow-x-auto rounded-md bg-background/80 p-2 text-xs" />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
