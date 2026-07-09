import type { SourceChunk } from "@/lib/search/types";
import type { LlmMessage } from "@/lib/llm/types";

const groundedSystemInstruction = `You are AGN, a learning assistant with optional SIR source context.
Behave like a normal helpful chat assistant.
When SIR source excerpts are provided and relevant, prioritize them over general knowledge.
Cite slide numbers for claims that rely on SIR source excerpts.
Use citations like [Slide 12].
If the provided SIR excerpts do not contain enough support, answer normally using general knowledge.
When mixing SIR context and general knowledge, make it clear which claims come from the slides.
Preserve the user's language unless asked otherwise.
Do not claim that something is in the uploaded sources unless it is supported by the provided excerpts.`;

export function buildGroundedMessages({
  question,
  sourceChunks,
}: {
  question: string;
  sourceChunks: SourceChunk[];
}): LlmMessage[] {
  return [
    {
      role: "system",
      content: groundedSystemInstruction,
    },
    {
      role: "user",
      content: [
        "SIR source excerpts:",
        buildSourceBlock(sourceChunks),
        "",
        "User question:",
        question.trim(),
      ].join("\n"),
    },
  ];
}

export function buildSourceBlock(sourceChunks: SourceChunk[]): string {
  if (sourceChunks.length === 0) {
    return "No relevant SIR source excerpts were retrieved for this message.";
  }

  return sourceChunks.map(formatSourceChunk).join("\n\n");
}

function formatSourceChunk(chunk: SourceChunk, index: number): string {
  const lines = [
    `<source index="${index + 1}">`,
    ...(chunk.sourceLabel ? [`Source label: ${chunk.sourceLabel}`] : []),
    `Deck: ${chunk.deckTitle}`,
    `Slide: ${chunk.slideNumber}`,
    `Slide title: ${chunk.slideTitle ?? "Untitled slide"}`,
  ];

  if (chunk.headingPath?.length) {
    lines.push(`Heading path: ${chunk.headingPath.join(" > ")}`);
  }

  lines.push("Text:");
  lines.push(chunk.text);
  lines.push("</source>");

  return lines.join("\n");
}
