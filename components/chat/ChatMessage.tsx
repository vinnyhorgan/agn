"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  validSlideNumbers?: Set<number>;
}

const citationPattern = /(\[Slide\s+(\d+)\])/gi;

export function ChatMessage({
  role,
  content,
  validSlideNumbers,
}: ChatMessageProps) {
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2",
        role === "user"
          ? "border-zinc-200 bg-zinc-50"
          : "border-zinc-200 bg-white",
      )}
    >
      <div className="mb-1 text-xs font-medium uppercase tracking-normal text-zinc-500">
        {role === "user" ? "Question" : "Answer"}
      </div>
      <div className="whitespace-pre-wrap text-sm leading-6 text-zinc-800">
        {renderCitationText(content, validSlideNumbers)}
      </div>
    </div>
  );
}

function renderCitationText(content: string, validSlideNumbers?: Set<number>) {
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

      nodes.push(
        <Badge
          key={`${citation}-${index}`}
          variant={isValid ? "secondary" : "destructive"}
          className="mx-1 align-baseline"
        >
          {citation}
        </Badge>,
      );
    }
  }

  return nodes;
}
