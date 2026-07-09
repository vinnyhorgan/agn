import { describe, expect, it } from "vitest";

import { buildGroundedMessages } from "../../lib/llm/groundedPrompt";
import type { SourceChunk } from "../../lib/search/types";

describe("grounded prompt construction", () => {
  it("includes source chunks and slide numbers", () => {
    const messages = buildGroundedMessages({
      question: "What does the deck say about chlorophyll?",
      sourceChunks: [createChunk()],
    });
    const promptText = messages.map((message) => message.content).join("\n");

    expect(promptText).toContain("Chlorophyll absorbs light energy.");
    expect(promptText).toContain("Slide: 3");
    expect(promptText).toContain("Heading path: Photosynthesis > Chlorophyll");
  });

  it("prioritizes SIR sources without blocking general answers", () => {
    const messages = buildGroundedMessages({
      question: "What is ATP?",
      sourceChunks: [createChunk()],
    });
    const systemMessage = messages[0]?.content ?? "";

    expect(systemMessage).toContain(
      "When SIR source excerpts are provided and relevant, prioritize them over general knowledge.",
    );
    expect(systemMessage).toContain(
      "If the provided SIR excerpts do not contain enough support, answer normally using general knowledge.",
    );
    expect(systemMessage).toContain(
      "Cite slide numbers for claims that rely on SIR source excerpts.",
    );
  });

  it("handles messages with no retrieved source chunks", () => {
    const messages = buildGroundedMessages({
      question: "Hello",
      sourceChunks: [],
    });
    const promptText = messages.map((message) => message.content).join("\n");

    expect(promptText).toContain(
      "No relevant SIR source excerpts were retrieved for this message.",
    );
    expect(promptText).toContain("User question:\nHello");
  });
});

function createChunk(): SourceChunk {
  return {
    id: "slide-3-chunk-1",
    deckId: "biology",
    deckTitle: "Biology",
    slideNumber: 3,
    slideTitle: "Photosynthesis",
    headingPath: ["Photosynthesis", "Chlorophyll"],
    text: "Chlorophyll absorbs light energy.",
    slideImagePath: "slides/0003.webp",
  };
}
