"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  validSlideNumbers?: Set<number>;
  onCitationClick?: (slideNumber: number) => void;
}

const citationPattern = /(\[Slide\s+(\d+)\])/gi;

export function ChatMessage({
  role,
  content,
  validSlideNumbers,
  onCitationClick,
}: ChatMessageProps) {
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2",
        role === "user"
          ? "ml-auto max-w-[82%] border-zinc-700 bg-zinc-800 text-zinc-100"
          : "mr-auto max-w-[86%] border-zinc-800 bg-zinc-950 text-zinc-100",
      )}
    >
      <div className="mb-1 text-xs font-medium uppercase tracking-normal text-zinc-500">
        {role === "user" ? "You" : "AGN"}
      </div>
      <div className="whitespace-pre-wrap text-sm leading-6 text-zinc-200">
        {renderCitationText(content, validSlideNumbers, onCitationClick)}
      </div>
    </div>
  );
}

function renderCitationText(
  content: string,
  validSlideNumbers?: Set<number>,
  onCitationClick?: (slideNumber: number) => void,
) {
  const parts = content.split(citationPattern);
  const nodes: React.ReactNode[] = [];

  for (let index = 0; index < parts.length; index += 3) {
    const text = parts[index];
    const citation = parts[index + 1];
    const slideNumberText = parts[index + 2];

    if (text) {
      nodes.push(text);
    }

    if (citation && slideNumberText) {
      const slideNumber = Number(slideNumberText);
      const isValid =
        validSlideNumbers === undefined || validSlideNumbers.has(slideNumber);
      const badge = (
        <Badge
          variant={isValid ? "secondary" : "destructive"}
          className="mx-1 align-baseline"
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
            onClick={() => onCitationClick(slideNumber)}
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
