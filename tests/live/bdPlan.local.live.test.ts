import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { chunkSlides } from "../../lib/search/chunkSlides";
import { parseSirFile } from "../../lib/sir/importSir";
import { chunksForChapter, createDeterministicChapterPlan } from "../../lib/study/chapterPlanner";

describe("local Basi di Dati curriculum", () => {
  it("covers the complete large corpus with bounded study chapters", async () => {
    const buffer = await readFile(process.env.AGN_STUDY_SIR ?? "/home/dvh/bd-sir/bd.sir");
    const deck = await parseSirFile(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
    const chunks = chunkSlides(deck, { deckId: "bd", sourceLabel: "Source 1" });
    const plan = createDeterministicChapterPlan(chunks, "Italian");
    const uniqueSlides = new Set(chunks.map((chunk) => `${chunk.deckId}:${chunk.slideNumber}`));
    const plannedSlides = new Set(plan.chapters.flatMap((chapter) =>
      chunksForChapter(chunks, chapter).map((chunk) => `${chunk.deckId}:${chunk.slideNumber}`),
    ));

    expect(plan.chapters.length).toBeGreaterThanOrEqual(10);
    // These are narrow deterministic candidate units; the AI organizer merges
    // them into the smaller user-facing curriculum.
    expect(plan.chapters.length).toBeLessThanOrEqual(48);
    expect(plannedSlides).toEqual(uniqueSlides);
    expect(plan.chapters.every((chapter) => chunksForChapter(chunks, chapter).length > 0)).toBe(true);

    console.info(JSON.stringify(plan.chapters.map((chapter) => ({
      title: chapter.title,
      slides: new Set(chunksForChapter(chunks, chapter).map((chunk) => chunk.slideNumber)).size,
      sources: chapter.scopes.length,
    })), null, 2));
  }, 30_000);
});
