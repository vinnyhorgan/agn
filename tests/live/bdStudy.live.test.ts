import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { createDeepInfraChatCompletionStream } from "../../lib/llm/openAiCompatible";
import { chunkSlides } from "../../lib/search/chunkSlides";
import { parseSirFile } from "../../lib/sir/importSir";
import {
  chunksForChapter,
  createDeterministicChapterPlan,
} from "../../lib/study/chapterPlanner";
import { buildStudyPageMessages, selectStudyPageEvidence } from "../../lib/study/studyPage";
import { repairModelCitations } from "../../lib/llm/citations";
import { parseStudyContent } from "../../lib/study/artifacts";

const archivePath = process.env.AGN_STUDY_SIR ?? "/home/dvh/bd-sir/bd.sir";

describe("live large-corpus study harness", () => {
  it("generates one grounded study page from the local Basi di Dati curriculum", async () => {
    const key = process.env.DEEPINFRA_API_KEY?.trim();
    if (!key) throw new Error("DEEPINFRA_API_KEY is required.");
    const buffer = await readFile(archivePath);
    const deck = await parseSirFile(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
    const chunks = chunkSlides(deck, { deckId: "bd", sourceLabel: "Source 1" });
    const plan = createDeterministicChapterPlan(chunks, "Italian");
    expect(plan.chapters.length).toBeGreaterThanOrEqual(6);
    expect(plan.chapters.length).toBeLessThanOrEqual(20);

    const representative = plan.chapters.find((chapter) => /entit|relaz|concett/i.test(chapter.title)) ?? plan.chapters[0]!;
    const chapterChunks = chunksForChapter(chunks, representative);
    const evidence = selectStudyPageEvidence(chapterChunks);
    expect(evidence.length).toBeGreaterThan(3);
    expect(evidence.reduce((sum, chunk) => sum + chunk.text.length, 0)).toBeLessThanOrEqual(72_000);

    const pageStream = await createDeepInfraChatCompletionStream({
      settings: { apiKey: key },
      messages: buildStudyPageMessages({ chapter: representative, chunks: chapterChunks, language: "Italian" }),
      reasoningEffort: "low",
      maxTokens: 4_500,
    });
    const page = await new Response(pageStream).text();
    const repairedPage = repairModelCitations(page, evidence);
    expect(repairedPage.length).toBeGreaterThan(1_000);
    expect(repairedPage).toMatch(/\[Source\s+\d+\s*,\s*Slide\s+\d+\]/);
    expect(parseStudyContent(repairedPage).some((part) => part.artifact)).toBe(true);

    // Safe diagnostics: no keys, full prompts, or source text.
    console.info(JSON.stringify({
      archiveSlides: deck.manifest.slide_count,
      indexedChunks: chunks.length,
      chapters: plan.chapters.map((chapter) => chapter.title),
      sampleChapter: representative.title,
      sampleEvidenceChunks: evidence.length,
      sampleEvidenceCharacters: evidence.reduce((sum, chunk) => sum + chunk.text.length, 0),
      samplePageCharacters: page.length,
    }, null, 2));
  }, 180_000);
});
