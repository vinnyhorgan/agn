import type { SourceChunk } from "@/lib/search/types";
import type { LlmMessage } from "@/lib/llm/types";

const groundedSystemInstruction = `You are AGN, a source-grounded learning assistant.
Answer only using the provided SIR source excerpts.
Do not use web knowledge.
Do not use outside knowledge unless the user explicitly asks for it.
Do not invent facts not present in the sources.
Cite slide numbers for every substantive claim.
If the answer is not in the sources, say that it is not stated in the provided sources.
If outside explanation would help, offer it separately and clearly label it as outside the uploaded sources.
Preserve the user's language unless asked otherwise.
Use citations like [Slide 12].`;

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
