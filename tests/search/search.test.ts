import { describe, expect, it } from "vitest";

import { chunkSlides } from "../../lib/search/chunkSlides";
import { lexicalSearch } from "../../lib/search/lexicalSearch";
import type { ParsedSirFile } from "../../lib/sir/types";

describe("source chunking", () => {
  it("retains slide metadata for every chunk", () => {
    const chunks = chunkSlides(createParsedDeck());

    expect(chunks.map((chunk) => chunk.slideNumber)).toEqual([1, 1, 2]);
    expect(chunks[0]).toMatchObject({
      deckTitle: "Local Search Deck",
      slideNumber: 1,
      slideTitle: "Photosynthesis",
      slideImagePath: "slides/0001.webp",
    });
    expect(chunks[1]?.headingPath).toEqual(["Photosynthesis", "Chlorophyll"]);
    expect(chunks[2]).toMatchObject({
      slideNumber: 2,
      slideTitle: "Cellular Respiration",
      slideImagePath: "slides/0002.webp",
    });
  });

  it("creates one chunk for a slide without subheadings", () => {
    const chunks = chunkSlides({
      manifest: {
        sir: 1,
        title: "Single Chunk Deck",
        language: "en",
        slide_count: 1,
      },
      sources: [createV1Source("Single Chunk Deck", "en", 1)],
      imagePaths: ["slides/0001.webp"],
      slides: [
        {
          slideNumber: 1,
          sourceNumber: 1,
          sourceSlideNumber: 1,
          title: "Plain Slide",
          markdown: "# Plain Slide\n\nA short slide without subheadings.",
        },
      ],
    });

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.text).toContain("A short slide without subheadings.");
    expect(chunks[0]?.headingPath).toBeUndefined();
  });
});

describe("lexical search", () => {
  it("finds relevant chunks and returns snippets", () => {
    const chunks = chunkSlides(createParsedDeck());

    const results = lexicalSearch(chunks, "mitochondria energy");

    expect(results[0]?.chunk.slideNumber).toBe(2);
    expect(results[0]?.snippet).toContain("Mitochondria");
    expect(results[0]?.matchedTerms).toEqual(["mitochondria", "energy"]);
  });

  it("ranks title and heading matches ahead of body-only matches", () => {
    const chunks = chunkSlides(createParsedDeck());

    const results = lexicalSearch(chunks, "chlorophyll");

    expect(results).toHaveLength(2);
    expect(results[0]?.chunk.slideNumber).toBe(1);
    expect(results[0]?.chunk.headingPath).toEqual([
      "Photosynthesis",
      "Chlorophyll",
    ]);
  });

  it("searches non-Latin source text", () => {
    const chunks = chunkSlides({
      manifest: { sir: 1, title: "日本語", language: "ja", slide_count: 1 },
      sources: [createV1Source("日本語", "ja", 1)],
      imagePaths: ["slides/0001.webp"],
      slides: [
        {
          slideNumber: 1,
          sourceNumber: 1,
          sourceSlideNumber: 1,
          title: "光合成",
          markdown: "# 光合成\n\n植物は光エネルギーを使います。",
        },
      ],
    });

    expect(lexicalSearch(chunks, "光合成")).toHaveLength(1);
  });

  it("supports prefix and conservative fuzzy matches", () => {
    const chunks = chunkSlides(createParsedDeck());

    expect(lexicalSearch(chunks, "chloro")[0]?.chunk.slideNumber).toBe(1);
    expect(lexicalSearch(chunks, "mitocondria")[0]?.chunk.slideNumber).toBe(2);
  });
});

function createParsedDeck(): ParsedSirFile {
  return {
    manifest: {
      sir: 1,
      title: "Local Search Deck",
      language: "en",
      slide_count: 2,
    },
    sources: [createV1Source("Local Search Deck", "en", 2)],
    imagePaths: ["slides/0001.webp", "slides/0002.webp"],
    slides: [
      {
        slideNumber: 1,
        sourceNumber: 1,
        sourceSlideNumber: 1,
        title: "Photosynthesis",
        markdown: `
# Photosynthesis

Plants convert light into sugar.

## Chlorophyll

Chlorophyll captures light in leaves.
`,
      },
      {
        slideNumber: 2,
        sourceNumber: 1,
        sourceSlideNumber: 2,
        title: "Cellular Respiration",
        markdown: `
# Cellular Respiration

Mitochondria release stored energy from glucose. Chlorophyll appears here only as supporting context.
`,
      },
    ],
  };
}

function createV1Source(title: string, language: string, slideCount: number) {
  return {
    sourceNumber: 1,
    title,
    originalPath: "",
    mediaType: "sir-v1" as const,
    language,
    slideStart: 1,
    slideCount,
  };
}
