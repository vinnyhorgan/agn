"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  validCitations?: Set<string>;
  onCitationClick?: (sourceNumber: number, slideNumber: number) => void;
}

const citationPattern = /(\[Source\s+(\d+)\s*,\s*Slide\s+(\d+)\])/gi;

export function ChatMessage({
  role,
  content,
  validCitations,
  onCitationClick,
}: ChatMessageProps) {
  return (
    <div
      className={cn(
        "rounded-lg border px-3.5 py-3 shadow-sm",
        role === "user"
          ? "ml-auto max-w-[88%] border-emerald-300 bg-emerald-300 text-zinc-950 sm:max-w-[82%]"
          : "mr-auto max-w-[94%] border-zinc-800 bg-zinc-900/70 text-zinc-100 sm:max-w-[88%]",
      )}
    >
      <div className={cn("mb-1.5 text-xs font-semibold", role === "user" ? "text-emerald-950/70" : "text-zinc-500")}>
        {role === "user" ? "You" : "AGN"}
      </div>
      {role === "assistant" ? (
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            p: ({ children }) => (
              <p className="mb-3 text-sm leading-6 text-zinc-200 last:mb-0">
                {renderMarkdownChildren(children, validCitations, onCitationClick)}
              </p>
            ),
            li: ({ children }) => (
              <li>{renderMarkdownChildren(children, validCitations, onCitationClick)}</li>
            ),
            ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5 text-sm leading-6 text-zinc-200">{children}</ul>,
            ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5 text-sm leading-6 text-zinc-200">{children}</ol>,
            h1: ({ children }) => <h1 className="mb-2 mt-1 text-base font-semibold text-zinc-50">{children}</h1>,
            h2: ({ children }) => <h2 className="mb-2 mt-3 text-sm font-semibold text-zinc-50">{children}</h2>,
            h3: ({ children }) => <h3 className="mb-2 mt-3 text-sm font-semibold text-zinc-100">{children}</h3>,
            code: ({ children }) => <code className="rounded bg-black/40 px-1 py-0.5 font-mono text-[0.85em] text-emerald-200">{children}</code>,
            pre: ({ children }) => <pre className="mb-3 overflow-x-auto rounded-lg border border-zinc-800 bg-black/50 p-3 text-sm leading-6">{children}</pre>,
            blockquote: ({ children }) => <blockquote className="mb-3 border-l-2 border-emerald-400 pl-3 text-zinc-400">{children}</blockquote>,
          }}
        >
          {content}
        </ReactMarkdown>
      ) : (
        <div className="whitespace-pre-wrap text-sm leading-6 text-zinc-950">{content}</div>
      )}
    </div>
  );
}

function renderMarkdownChildren(
  children: React.ReactNode,
  validCitations?: Set<string>,
  onCitationClick?: (sourceNumber: number, slideNumber: number) => void,
) {
  return React.Children.map(children, (child) =>
    typeof child === "string"
      ? renderCitationText(child, validCitations, onCitationClick)
      : child,
  );
}

function renderCitationText(
  content: string,
  validCitations?: Set<string>,
  onCitationClick?: (sourceNumber: number, slideNumber: number) => void,
) {
  const parts = content.split(citationPattern);
  const nodes: React.ReactNode[] = [];

  for (let index = 0; index < parts.length; index += 4) {
    const text = parts[index];
    const citation = parts[index + 1];
    const sourceNumberText = parts[index + 2];
    const slideNumberText = parts[index + 3];

    if (text) {
      nodes.push(text);
    }

    if (citation && sourceNumberText && slideNumberText) {
      const sourceNumber = Number(sourceNumberText);
      const slideNumber = Number(slideNumberText);
      const isValid =
        validCitations === undefined ||
        validCitations.has(`${sourceNumber}:${slideNumber}`);
      const badge = (
        <Badge
          variant={isValid ? "secondary" : "destructive"}
          className="mx-1 border border-emerald-500/20 bg-emerald-500/15 align-baseline text-emerald-200 hover:bg-emerald-500/25"
        >
          {citation}
        </Badge>
      );

      nodes.push(
        onCitationClick && isValid ? (
          <button
            key={`${citation}-${index}`}
            type="button"
            className="align-baseline outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => onCitationClick(sourceNumber, slideNumber)}
          >
            {badge}
          </button>
        ) : (
          <span key={`${citation}-${index}`}>{badge}</span>
        ),
      );
    }
  }

  return nodes;
}
