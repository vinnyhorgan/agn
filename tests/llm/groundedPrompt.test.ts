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

  it("gives SIR sources highest priority without blocking general answers", () => {
    const messages = buildGroundedMessages({
      question: "What is ATP?",
      sourceChunks: [createChunk()],
    });
    const systemMessage = messages[0]?.content ?? "";

    expect(systemMessage).toContain(
      "Uploaded SIR source material is your highest-priority evidence.",
    );
    expect(systemMessage).toContain(
      "you may supplement with general knowledge",
    );
    expect(systemMessage).toContain(
      "[Source N, Slide M]",
    );
  });

  it("includes recent conversation turns before the current question", () => {
    const messages = buildGroundedMessages({
      question: "Can you expand on that?",
      sourceChunks: [createChunk()],
      history: [
        {
          question: "What is chlorophyll?",
          answer: "It absorbs light energy. [Source 1, Slide 3]",
        },
      ],
    });

    expect(messages.slice(1, 3)).toEqual([
      { role: "user", content: "What is chlorophyll?" },
      {
        role: "assistant",
        content: "It absorbs light energy. [Source 1, Slide 3]",
      },
    ]);
  });

  it("handles messages with no retrieved source chunks", () => {
    const messages = buildGroundedMessages({
      question: "Hello",
      sourceChunks: [],
    });
    const promptText = messages.map((message) => message.content).join("\n");

    expect(promptText).toContain(
      "No relevant uploaded source material was found for this message.",
    );
    expect(promptText).toContain("User question:\nHello");
  });

  it("includes the complete library catalog separately from retrieved evidence", () => {
    const messages = buildGroundedMessages({
      question: "Can you see every uploaded source?",
      sourceChunks: [],
      runtimeModel: "test-model via DeepInfra",
      librarySources: [
        {
          deckId: "database",
          deckTitle: "Database corpus",
          sourceLabel: "Source 29",
          sourceTitle: "Final exam",
          sourcePath: "exams/final.pdf",
          sourceMediaType: "pdf",
          slideCount: 4,
        },
      ],
    });
    const promptText = messages.at(-1)?.content ?? "";

    expect(promptText).toContain("Runtime model: test-model via DeepInfra");
    expect(promptText).toContain("Total uploaded sources: 1");
    expect(promptText).toContain("Source 29: Final exam");
    expect(promptText).toContain(
      "No relevant uploaded source material was found for this message.",
    );
  });
});

function createChunk(): SourceChunk {
  return {
    id: "slide-3-chunk-1",
    deckId: "biology",
    deckTitle: "Biology",
    sourceTitle: "Biology",
    sourcePath: "biology.pdf",
    sourceMediaType: "pdf",
    slideNumber: 3,
    sourceSlideNumber: 3,
    slideTitle: "Photosynthesis",
    headingPath: ["Photosynthesis", "Chlorophyll"],
    text: "Chlorophyll absorbs light energy.",
    slideImagePath: "slides/0003.webp",
  };
}
