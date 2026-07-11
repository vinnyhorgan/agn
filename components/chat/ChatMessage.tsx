"use client";

import { Badge } from "@/components/ui/badge";
import { StudyArtifactView } from "@/components/study/StudyArtifactView";
import { parseStudyContent } from "@/lib/study/artifacts";
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
        "rounded-lg px-3.5 py-3",
        role === "user"
          ? "ml-auto max-w-[88%] rounded-2xl rounded-br-md border border-primary/15 bg-accent text-accent-foreground shadow-sm sm:max-w-[82%]"
          : "mr-auto w-full max-w-[94%] px-1 text-foreground sm:max-w-[90%]",
      )}
    >
      <div
        className={cn(
          "mb-1.5 text-xs font-semibold",
          role === "user" ? "text-primary/80" : "text-muted-foreground",
        )}
      >
        {role === "user" ? "You" : "AGN"}
      </div>
      {role === "assistant" ? (
        <AssistantContent
          content={content}
          validCitations={validCitations}
          onCitationClick={onCitationClick}
        />
      ) : (
        <div className="whitespace-pre-wrap text-sm leading-6 text-foreground">{content}</div>
      )}
    </div>
  );
}

function AssistantContent({
  content,
  validCitations,
  onCitationClick,
}: Omit<ChatMessageProps, "role">) {
  return parseStudyContent(content).map((part, index) => {
    if (part.type === "artifact") {
      return part.artifact ? (
        <StudyArtifactView key={index} artifact={part.artifact} />
      ) : (
        <div key={index} className="my-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Diagram unavailable: {part.error}
        </div>
      );
    }
    return (
        <ReactMarkdown
          key={index}
          remarkPlugins={[remarkGfm]}
          components={{
            p: ({ children }) => (
              <p className="mb-3 text-sm leading-6 text-foreground/90 last:mb-0">
                {renderMarkdownChildren(children, validCitations, onCitationClick)}
              </p>
            ),
            li: ({ children }) => (
              <li>{renderMarkdownChildren(children, validCitations, onCitationClick)}</li>
            ),
            ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5 text-sm leading-6 text-foreground/90 marker:text-primary">{children}</ul>,
            ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5 text-sm leading-6 text-foreground/90 marker:text-primary">{children}</ol>,
            h1: ({ children }) => <h1 className="mb-2 mt-1 text-base font-semibold text-foreground">{children}</h1>,
            h2: ({ children }) => <h2 className="mb-2 mt-3 text-sm font-semibold text-foreground">{children}</h2>,
            h3: ({ children }) => <h3 className="mb-2 mt-3 text-sm font-semibold text-foreground">{children}</h3>,
            code: ({ children }) => <code className="rounded bg-accent px-1 py-0.5 font-mono text-[0.85em] text-accent-foreground">{children}</code>,
            pre: ({ children }) => <pre className="mb-3 overflow-x-auto rounded-xl border border-border bg-muted/65 p-3 text-sm leading-6 [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-foreground">{children}</pre>,
            blockquote: ({ children }) => <blockquote className="mb-3 border-l-2 border-primary pl-3 text-muted-foreground">{children}</blockquote>,
            table: ({ children }) => <div className="my-4 overflow-x-auto rounded-xl border border-border"><table className="w-full min-w-[520px] border-collapse text-left text-sm">{children}</table></div>,
            th: ({ children }) => <th className="border-b border-border bg-muted/60 p-3 font-semibold">{children}</th>,
            td: ({ children }) => <td className="border-b border-border/60 p-3 align-top leading-6">{renderMarkdownChildren(children, validCitations, onCitationClick)}</td>,
            hr: () => null,
          }}
        >
          {part.content ?? ""}
        </ReactMarkdown>
    );
  });
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
          className="mx-1 border border-primary/20 bg-accent align-baseline text-accent-foreground hover:bg-primary/15"
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
