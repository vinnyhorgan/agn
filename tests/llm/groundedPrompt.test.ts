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

  it("includes source-only and not-in-sources instructions", () => {
    const messages = buildGroundedMessages({
      question: "What is ATP?",
      sourceChunks: [createChunk()],
    });
    const systemMessage = messages[0]?.content ?? "";

    expect(systemMessage).toContain(
      "Answer only using the provided SIR source excerpts.",
    );
    expect(systemMessage).toContain(
      "If the answer is not in the sources, say that it is not stated in the provided sources.",
    );
    expect(systemMessage).toContain("Do not use web knowledge.");
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
