import { describe, expect, it } from "vitest";

import { inferStudyLanguage } from "../../lib/study/language";
import type { SourceChunk } from "../../lib/search/types";

describe("study language", () => {
  it("uses declared SIR language rather than subject-specific vocabulary", () => {
    expect(inferStudyLanguage([chunk("it", "Rivoluzione industriale")])).toBe("Italian");
    expect(inferStudyLanguage([chunk("en", "Database design and relations")])).toBe("English");
  });

  it("chooses the dominant declared language for a mixed corpus", () => {
    expect(inferStudyLanguage([chunk("fr", "A"), chunk("fr-FR", "B"), chunk("en", "C")])).toBe("French");
  });
});

function chunk(sourceLanguage: string, text: string): SourceChunk {
  return {
    id: text, deckId: "deck", deckTitle: "Course", sourceLabel: "Source 1",
    sourceTitle: "Lectures", sourcePath: "lectures.pdf", sourceMediaType: "pdf",
    sourceLanguage, slideNumber: 1, sourceSlideNumber: 1, slideTitle: text,
    text, slideImagePath: "slides/0001.webp",
  };
}
