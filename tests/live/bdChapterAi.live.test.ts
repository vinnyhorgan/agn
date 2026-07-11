import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { createDeepInfraChatCompletionStream, DEEPINFRA_STRUCTURED_MODEL } from "../../lib/llm/openAiCompatible";
import { chunkSlides } from "../../lib/search/chunkSlides";
import { parseSirFile } from "../../lib/sir/importSir";
import {
  buildCompactChapterOrganizerMessages,
  createDeterministicChapterPlan,
  parseCompactChapterPlan,
} from "../../lib/study/chapterPlanner";

describe("live Basi di Dati AI curriculum", () => {
  it("returns a valid AI-refined plan through the production provider settings", async () => {
    const key = process.env.DEEPINFRA_API_KEY?.trim();
    if (!key) throw new Error("DEEPINFRA_API_KEY is required.");
    const buffer = await readFile(process.env.AGN_STUDY_SIR ?? "/home/dvh/bd-sir/bd.sir");
    const deck = await parseSirFile(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
    const chunks = chunkSlides(deck, { deckId: "bd", sourceLabel: "Source 1" });
    const candidate = createDeterministicChapterPlan(chunks, "Italian");
    const startedAt = Date.now();
    const stream = await createDeepInfraChatCompletionStream({
      settings: { apiKey: key },
      messages: buildCompactChapterOrganizerMessages(candidate, chunks),
      reasoningEffort: "low",
      maxTokens: 1_500,
      responseFormat: "json_object",
      model: DEEPINFRA_STRUCTURED_MODEL,
    });
    const content = await new Response(stream).text();
    const plan = parseCompactChapterPlan(content, candidate, chunks);
    expect(plan.chapters.length).toBeGreaterThanOrEqual(8);
    expect(plan.chapters.some((chapter) => /organizzazione del corso|modalità d.esame/i.test(chapter.title))).toBe(false);
    console.info(JSON.stringify({
      elapsedMs: Date.now() - startedAt,
      responseCharacters: content.length,
      candidateChapters: candidate.chapters.length,
      aiChapters: plan.chapters.length,
      chapterTitles: plan.chapters.map((chapter) => chapter.title),
    }, null, 2));
  }, 300_000);
});
