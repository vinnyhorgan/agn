import { describe, expect, it } from "vitest";

import { repairModelCitations } from "../../lib/llm/citations";
import {
  DEEPINFRA_STRUCTURED_MODEL,
  createDeepInfraChatCompletionStream,
} from "../../lib/llm/openAiCompatible";
import type { SourceChunk } from "../../lib/search/types";
import {
  buildCompactChapterOrganizerMessages,
  chunksForChapter,
  createDeterministicChapterPlan,
  parseCompactChapterPlan,
} from "../../lib/study/chapterPlanner";
import { buildStudyPageMessages, finalizeStudyPage, selectStudyPageEvidence } from "../../lib/study/studyPage";

describe("live subject-neutral study harness", () => {
  it("organizes and teaches a non-database biology corpus", async () => {
    const apiKey = process.env.DEEPINFRA_API_KEY?.trim();
    if (!apiKey) throw new Error("DEEPINFRA_API_KEY is required.");
    const chunks = biologyCorpus();
    const candidate = createDeterministicChapterPlan(chunks, "English");
    const organizationStream = await createDeepInfraChatCompletionStream({
      settings: { apiKey },
      messages: buildCompactChapterOrganizerMessages(candidate, chunks),
      reasoningEffort: "low",
      maxTokens: 1_500,
      responseFormat: "json_object",
    });
    const organization = await new Response(organizationStream).text();
    const plan = parseCompactChapterPlan(organization, candidate, chunks);
    expect(plan.chapters.length).toBeGreaterThanOrEqual(4);
    expect(plan.chapters.some((chapter) => /cell|membrane|genetic|metabol|signal/i.test(chapter.title))).toBe(true);
    expect(plan.chapters.some((chapter) => /SQL|DBMS|relational database/i.test(chapter.title))).toBe(false);

    const chapter = plan.chapters.find((item) => /membrane|cell/i.test(item.title)) ?? plan.chapters[0]!;
    const chapterChunks = chunksForChapter(chunks, chapter);
    const evidence = selectStudyPageEvidence(chapterChunks);
    const pageStream = await createDeepInfraChatCompletionStream({
      settings: { apiKey },
      messages: buildStudyPageMessages({ chapter, chunks: chapterChunks, language: "English" }),
      reasoningEffort: "low",
      maxTokens: 4_500,
      model: DEEPINFRA_STRUCTURED_MODEL,
    });
    const rawPage = await new Response(pageStream).text();
    const page = finalizeStudyPage(repairModelCitations(rawPage, evidence), true);
    expect(page.length).toBeGreaterThan(1_000);
    expect(page).toMatch(/\[Source\s+\d+\s*,\s*Slide\s+\d+\]/);
    expect(page).not.toMatch(/\b(?:SQL|DBMS|relational database)\b/i);

    console.info(JSON.stringify({
      candidateUnits: candidate.chapters.length,
      chapters: plan.chapters.map((item) => item.title),
      sampleChapter: chapter.title,
      sampleEvidenceChunks: evidence.length,
      samplePageCharacters: page.length,
    }, null, 2));
  }, 300_000);
});

function biologyCorpus(): SourceChunk[] {
  const topics = [
    ["Cell structure", "Organelles, cytoskeleton, and compartmentalization"],
    ["Biological membranes", "Phospholipids, membrane proteins, diffusion, and active transport"],
    ["Cellular metabolism", "Enzymes, ATP, glycolysis, respiration, and metabolic regulation"],
    ["Genetics and gene expression", "DNA replication, transcription, translation, and mutation"],
    ["Cell signaling", "Receptors, second messengers, signaling cascades, and feedback"],
    ["Experimental cell biology", "Microscopy, controls, fractionation, and interpreting experimental results"],
  ] as const;
  let globalSlide = 0;
  return topics.flatMap(([title, detail], sourceIndex) =>
    Array.from({ length: 12 }, (_, slideIndex): SourceChunk => {
      globalSlide += 1;
      const sourceNumber = sourceIndex + 1;
      const sourceSlide = slideIndex + 1;
      return {
        id: `biology:${globalSlide}`,
        deckId: "general-biology",
        deckTitle: "Introduction to Cell Biology",
        sourceLabel: `Source ${sourceNumber}`,
        sourceTitle: title,
        sourcePath: `biology/${sourceNumber}-${title.toLocaleLowerCase().replaceAll(" ", "-")}.pdf`,
        sourceMediaType: "pdf",
        sourceLanguage: "en",
        slideNumber: globalSlide,
        sourceSlideNumber: sourceSlide,
        slideTitle: `${title}: concept ${sourceSlide}`,
        text: `${title}. ${detail}. This slide develops concept ${sourceSlide} with a definition, mechanism, example, and a common experimental interpretation.`,
        slideImagePath: `slides/${String(globalSlide).padStart(4, "0")}.webp`,
      };
    }),
  );
}
