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
});

function createChunk(sourceLabel: string, slideNumber: number): SourceChunk {
  return {
    id: `${sourceLabel}-${slideNumber}`,
    deckId: sourceLabel,
    deckTitle: sourceLabel,
    sourceLabel,
    slideNumber,
    text: "Evidence",
    slideImagePath: `slides/${String(slideNumber).padStart(4, "0")}.webp`,
  };
}
