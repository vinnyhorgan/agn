import { describe, expect, it } from "vitest";

import { repairModelCitations } from "../../lib/llm/citations";
import type { SourceChunk } from "../../lib/search/types";

describe("citation repair", () => {
  it("keeps valid qualified citations and removes invented ones", () => {
    const answer = repairModelCitations(
      "Supported [Source 1, Slide 3]. Invented [Source 2, Slide 9].",
      [createChunk("Source 1", 3)],
    );

    expect(answer).toBe("Supported [Source 1, Slide 3]. Invented.");
  });

  it("qualifies an unambiguous legacy slide citation", () => {
    expect(
      repairModelCitations("Supported [Slide 3].", [createChunk("Source 2", 3)]),
    ).toBe("Supported [Source 2, Slide 3].");
  });

  it("removes an ambiguous legacy citation", () => {
    expect(
      repairModelCitations("Claim [Slide 3].", [
        createChunk("Source 1", 3),
        createChunk("Source 2", 3),
      ]),
    ).toBe("Claim.");
  });

  it("validates citations against source-local rather than global slides", () => {
    const source = {
      ...createChunk("Source 7", 103),
      sourceSlideNumber: 3,
    };

    expect(
      repairModelCitations(
        "Local [Source 7, Slide 3]. Global [Source 7, Slide 103].",
        [source],
      ),
    ).toBe("Local [Source 7, Slide 3]. Global.");
  });

  it("splits and validates citations grouped inside one bracket pair", () => {
    expect(
      repairModelCitations(
        "Policies [Source 20, Slide 15; Source 20, Slide 13].",
        [createChunk("Source 20", 15), createChunk("Source 20", 13)],
      ),
    ).toBe("Policies [Source 20, Slide 15] [Source 20, Slide 13].");
  });

  it("expands valid citation ranges and removes source-only markers", () => {
    expect(
      repairModelCitations(
        "Sequence [Source 4, Slide 3-5]. Generic [Source 4].",
        [createChunk("Source 4", 3), createChunk("Source 4", 4), createChunk("Source 4", 5)],
      ),
    ).toBe("Sequence [Source 4, Slide 3] [Source 4, Slide 4] [Source 4, Slide 5]. Generic.");
  });
});

function createChunk(sourceLabel: string, slideNumber: number): SourceChunk {
  return {
    id: `${sourceLabel}-${slideNumber}`,
    deckId: sourceLabel,
    deckTitle: sourceLabel,
    sourceLabel,
    sourceTitle: sourceLabel,
    sourcePath: `${sourceLabel}.pdf`,
    sourceMediaType: "pdf",
    slideNumber,
    sourceSlideNumber: slideNumber,
    text: "Evidence",
    slideImagePath: `slides/${String(slideNumber).padStart(4, "0")}.webp`,
  };
}
