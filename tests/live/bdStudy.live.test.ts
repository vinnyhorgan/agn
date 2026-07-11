import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { createDeepInfraChatCompletion } from "../../lib/llm/openAiCompatible";
import { chunkSlides } from "../../lib/search/chunkSlides";
import { parseSirFile } from "../../lib/sir/importSir";
import {
  buildChapterPlannerMessages,
  chunksForChapter,
  parseChapterPlan,
} from "../../lib/study/chapterPlanner";
import { buildStudyPageMessages, selectStudyPageEvidence } from "../../lib/study/studyPage";

const archivePath = process.env.AGN_STUDY_SIR ?? "/home/dvh/bd-sir/bd.sir";

describe("live large-corpus study harness", () => {
  it("plans the Basi di Dati corpus and generates one grounded study-page sample", async () => {
    const key = process.env.DEEPINFRA_API_KEY?.trim();
    if (!key) throw new Error("DEEPINFRA_API_KEY is required.");
    const buffer = await readFile(archivePath);
    const deck = await parseSirFile(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
    const chunks = chunkSlides(deck, { deckId: "bd", sourceLabel: "Source 1" });
    const plannerMessages = buildChapterPlannerMessages(chunks, "Italian");
    const plannerCharacters = plannerMessages.reduce((sum, message) => sum + message.content.length, 0);
    expect(plannerCharacters).toBeLessThan(32_000);

    const result = await createDeepInfraChatCompletion({ settings: { apiKey: key }, messages: plannerMessages, reasoningEffort: "low", maxTokens: 8_000 });
    const plan = parseChapterPlan(result.content, chunks, "Italian");
    expect(plan.chapters.length).toBeGreaterThanOrEqual(6);
    expect(plan.chapters.length).toBeLessThanOrEqual(20);

    if (process.env.AGN_LIVE_PLAN_ONLY === "1") {
      console.info(JSON.stringify({
        archiveSlides: deck.manifest.slide_count,
        indexedChunks: chunks.length,
        plannerCharacters,
        chapters: plan.chapters.map((chapter) => chapter.title),
      }, null, 2));
      return;
    }

    const representative = plan.chapters.find((chapter) => /entit|relaz|concett/i.test(chapter.title)) ?? plan.chapters[0]!;
    const chapterChunks = chunksForChapter(chunks, representative);
    const evidence = selectStudyPageEvidence(chapterChunks);
    expect(evidence.length).toBeGreaterThan(3);
    expect(evidence.reduce((sum, chunk) => sum + chunk.text.length, 0)).toBeLessThanOrEqual(72_000);

    const page = await createDeepInfraChatCompletion({
      settings: { apiKey: key },
      messages: buildStudyPageMessages({ chapter: representative, chunks: chapterChunks, language: "Italian" }),
      reasoningEffort: "medium",
      maxTokens: 8_000,
    });
    expect(page.content.length).toBeGreaterThan(1_000);
    expect(page.content).toMatch(/\[Source\s+\d+\s*,\s*Slide\s+\d+\]/);
    expect(page.content).toMatch(/```agn-artifact/);

    // Safe diagnostics: no keys, full prompts, or source text.
    console.info(JSON.stringify({
      archiveSlides: deck.manifest.slide_count,
      indexedChunks: chunks.length,
      plannerCharacters,
      chapters: plan.chapters.map((chapter) => chapter.title),
      sampleChapter: representative.title,
      sampleEvidenceChunks: evidence.length,
      sampleEvidenceCharacters: evidence.reduce((sum, chunk) => sum + chunk.text.length, 0),
      samplePageCharacters: page.content.length,
    }, null, 2));
  }, 240_000);
});
