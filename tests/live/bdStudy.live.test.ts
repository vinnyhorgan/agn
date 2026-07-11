import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { createDeepInfraChatCompletionStream, DEEPINFRA_STRUCTURED_MODEL } from "../../lib/llm/openAiCompatible";
import { chunkSlides } from "../../lib/search/chunkSlides";
import { parseSirFile } from "../../lib/sir/importSir";
import {
  chunksForChapter,
  buildCompactChapterOrganizerMessages,
  createDeterministicChapterPlan,
  parseCompactChapterPlan,
} from "../../lib/study/chapterPlanner";
import { buildStudyPageMessages, finalizeStudyPage, selectStudyPageEvidence, splitStudyPageEvidence } from "../../lib/study/studyPage";
import { repairModelCitations } from "../../lib/llm/citations";

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
    const organizationStream = await createDeepInfraChatCompletionStream({
      settings: { apiKey: key },
      messages: buildCompactChapterOrganizerMessages(plan, chunks),
      reasoningEffort: "low",
      maxTokens: 1_500,
      responseFormat: "json_object",
      model: DEEPINFRA_STRUCTURED_MODEL,
    });
    const organized = parseCompactChapterPlan(await new Response(organizationStream).text(), plan, chunks);
    const representative = organized.chapters.find((chapter) => /introduzione|modello relazionale|progettazione concettuale/i.test(chapter.title)) ?? organized.chapters[0]!;
    const chapterChunks = chunksForChapter(chunks, representative);
    const evidence = selectStudyPageEvidence(chapterChunks);
    expect(evidence.length).toBeGreaterThan(3);
    expect(evidence.reduce((sum, chunk) => sum + chunk.text.length, 0)).toBeLessThanOrEqual(28_000);

    const evidenceParts = splitStudyPageEvidence(evidence);
    const pages = await Promise.all(evidenceParts.map(async (partChunks, index) => {
      const pageStream = await createDeepInfraChatCompletionStream({
        settings: { apiKey: key },
        messages: buildStudyPageMessages({
          chapter: representative,
          chunks: partChunks,
          language: "Italian",
          part: { index, total: evidenceParts.length },
        }),
        reasoningEffort: "low",
        maxTokens: evidenceParts.length > 1 ? 2_600 : 3_800,
      });
      return new Response(pageStream).text();
    }));
    const page = pages.join("\n\n");
    const repairedPage = finalizeStudyPage(repairModelCitations(page, evidence), true);
    expect(repairedPage.length).toBeGreaterThan(1_000);
    expect(repairedPage).toMatch(/\[Source\s+\d+\s*,\s*Slide\s+\d+\]/);

    // Safe diagnostics: no keys, full prompts, or source text.
    console.info(JSON.stringify({
      archiveSlides: deck.manifest.slide_count,
      indexedChunks: chunks.length,
      chapters: organized.chapters.map((chapter) => chapter.title),
      sampleChapter: representative.title,
      sampleEvidenceChunks: evidence.length,
      sampleEvidenceCharacters: evidence.reduce((sum, chunk) => sum + chunk.text.length, 0),
      samplePageCharacters: page.length,
    }, null, 2));
  }, 300_000);
});
