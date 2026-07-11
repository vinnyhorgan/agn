import { describe, expect, it } from "vitest";

import {
  getRetrievalMode,
  isOverviewQuery,
  retrieveSourceChunks,
  retrieveSourceChunksWithDiagnostics,
} from "../../lib/search/retrieveSources";
import type { SourceChunk } from "../../lib/search/types";

describe("source retrieval", () => {
  it("recognizes broad deck explanation requests", () => {
    expect(isOverviewQuery("explain the slides")).toBe(true);
    expect(isOverviewQuery("spiega le slide")).toBe(true);
    expect(isOverviewQuery("What is a candidate key?")).toBe(false);
  });

  it("routes conversational and library-inventory questions without retrieval", () => {
    expect(getRetrievalMode("hey!")).toBe("none");
    expect(getRetrievalMode("who are you?")).toBe("none");
    expect(getRetrievalMode("what can you do?")).toBe("none");
    expect(getRetrievalMode("which LLM model are you?")).toBe("none");
    expect(getRetrievalMode("tell me which llm model you are")).toBe("none");
    expect(getRetrievalMode("can you see all sources from 1 to 29?")).toBe(
      "catalog",
    );
    expect(
      getRetrievalMode("tell me everything you see about the resources I uploaded"),
    ).toBe("catalog");
  });

  it("does not attach arbitrary chunks to conversational or catalog questions", () => {
    const chunks = [createChunk(1, 1, "model sources uploaded")];

    expect(retrieveSourceChunks({ chunks, query: "who are you?" })).toEqual([]);
    expect(
      retrieveSourceChunks({ chunks, query: "which sources are uploaded?" }),
    ).toEqual([]);
  });

  it("covers each slide before repeating chunks for overview requests", () => {
    const chunks = [
      createChunk(1, 1),
      createChunk(1, 2),
      createChunk(2, 1),
      createChunk(3, 1),
    ];

    const results = retrieveSourceChunks({
      chunks,
      query: "Explain the slides",
    });

    expect(results.slice(0, 3).map((chunk) => chunk.slideNumber)).toEqual([
      1, 2, 3,
    ]);
  });

  it("returns slide-diverse results for focused questions", () => {
    const chunks = [
      createChunk(1, 1, "candidate key definition"),
      createChunk(1, 2, "candidate key example"),
      createChunk(2, 1, "candidate key minimal attributes"),
    ];

    const results = retrieveSourceChunks({
      chunks,
      query: "candidate key",
    });

    expect(results.slice(0, 2).map((chunk) => chunk.slideNumber)).toEqual([1, 2]);
  });

  it("reports ranked candidates and whether conversation evidence was reused", () => {
    const previous = createChunk(9, 1, "earlier active topic");
    const result = retrieveSourceChunksWithDiagnostics({
      chunks: [createChunk(1, 1, "candidate key definition")],
      query: "candidate key",
      previousSources: [previous],
    });

    expect(result.mode).toBe("focused");
    expect(result.candidates[0]).toMatchObject({
      chunk: { slideNumber: 1 },
      matchedTerms: ["candidate", "key"],
    });
    expect(result.candidates[0]?.score).toBeGreaterThan(0);
    expect(result.previousSourcesUsed).toBe(true);
    expect(result.chunks.map((chunk) => chunk.slideNumber)).toEqual([1, 9]);
  });

  it("resolves explicit source-local slide references without lexical guessing", () => {
    const chunks = [
      { ...createChunk(8, 1, "unrelated words"), sourceLabel: "Source 2", sourceSlideNumber: 3 },
      { ...createChunk(3, 1, "slide three elsewhere"), sourceLabel: "Source 1" },
    ];
    const result = retrieveSourceChunksWithDiagnostics({
      chunks,
      query: "Read Source 2, Slide 3",
    });

    expect(result.chunks).toHaveLength(1);
    expect(result.chunks[0]).toMatchObject({
      sourceLabel: "Source 2",
      sourceSlideNumber: 3,
      slideNumber: 8,
    });
    expect(result.expansions[0]?.reason).toBe("explicit source and slide reference");
  });

  it("expands a strong continuation-title match with its adjacent teaching slide", () => {
    const chunks = [
      { ...createChunk(1, 1, "candidate key definition"), slideTitle: "Candidate keys" },
      { ...createChunk(2, 1, "worked minimality example"), slideTitle: "Continued" },
      { ...createChunk(3, 1, "other topic"), slideTitle: "Normalization" },
    ];
    const result = retrieveSourceChunksWithDiagnostics({
      chunks,
      query: "What is a candidate key?",
    });

    expect(result.chunks.map((chunk) => chunk.slideNumber)).toEqual([1, 2]);
    expect(result.expansions).toEqual([
      {
        chunkId: "deck:slide-2-chunk-1",
        reason: "adjacent slide with a shared or continuation title",
      },
    ]);
  });
});

function createChunk(
  slideNumber: number,
  chunkNumber: number,
  text = `Slide ${slideNumber} content ${chunkNumber}`,
): SourceChunk {
  return {
    id: `deck:slide-${slideNumber}-chunk-${chunkNumber}`,
    deckId: "deck",
    deckTitle: "Deck",
    sourceLabel: "Source 1",
    sourceTitle: "Deck",
    sourcePath: "deck.pdf",
    sourceMediaType: "pdf",
    slideNumber,
    sourceSlideNumber: slideNumber,
    slideTitle: `Slide ${slideNumber}`,
    text,
    slideImagePath: `slides/${String(slideNumber).padStart(4, "0")}.webp`,
  };
}
