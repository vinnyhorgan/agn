import { buildSourceBlock } from "@/lib/llm/groundedPrompt";
import type { LlmMessage } from "@/lib/llm/types";
import type { SourceChunk } from "@/lib/search/types";
import type { StudyChapter } from "@/lib/study/types";
import { parseStudyContent } from "@/lib/study/artifacts";

export const maxStudyPageEvidenceCharacters = 28_000;
const maxStudyPageParts = 2;

export function finalizeStudyPage(content: string, requiresCitations: boolean): string {
  const parts = parseStudyContent(content);
  const markdown = parts.map((part) => {
    if (part.type === "markdown") return part.content ?? "";
    return part.artifact
      ? `\n\n\`\`\`agn-artifact\n${JSON.stringify(part.artifact)}\n\`\`\`\n\n`
      : "";
  }).join("").trim();
  if (markdown.length < 800) {
    throw new Error("The model returned an incomplete study page. Nothing was saved; please retry.");
  }
  if (requiresCitations && !/\[Source\s+\d+\s*,\s*Slide\s+\d+\]/i.test(markdown)) {
    throw new Error("The model returned an ungrounded study page without valid source citations. Nothing was saved; please retry.");
  }
  return markdown;
}

export function selectStudyPageEvidence(chunks: SourceChunk[]): SourceChunk[] {
  const totalCharacters = chunks.reduce((sum, chunk) => sum + chunk.text.length, 0);
  if (totalCharacters <= maxStudyPageEvidenceCharacters) return chunks;

  const bySlide = new Map<string, SourceChunk[]>();
  for (const chunk of chunks) {
    const key = `${chunk.deckId}:${chunk.slideNumber}`;
    bySlide.set(key, [...(bySlide.get(key) ?? []), chunk]);
  }
  const slides = [...bySlide.values()];
  const sampledIndexes = new Set<number>();
  const sampleCount = Math.min(32, slides.length);
  for (let index = 0; index < sampleCount; index += 1) {
    sampledIndexes.add(Math.round((index * (slides.length - 1)) / Math.max(1, sampleCount - 1)));
  }
  slides.forEach((slideChunks, index) => {
    const title = slideChunks[0]?.slideTitle ?? "";
    if (/\b(?:definiz|definition|teorema|theorem|regola|rule|esempio|example|eserciz|exercise|errore|mistake|riepilogo|summary)\b/i.test(title)) {
      sampledIndexes.add(index);
    }
  });

  const candidates = [...sampledIndexes]
    .sort((left, right) => left - right)
    .flatMap((index) => slides[index] ?? []);
  const selected: SourceChunk[] = [];
  let characters = 0;
  for (const chunk of candidates) {
    if (characters + chunk.text.length > maxStudyPageEvidenceCharacters) break;
    selected.push(chunk);
    characters += chunk.text.length;
  }
  return selected;
}

export function splitStudyPageEvidence(chunks: SourceChunk[]): SourceChunk[][] {
  if (chunks.length < 2) return chunks.length === 0 ? [] : [chunks];
  const total = chunks.reduce((sum, chunk) => sum + chunk.text.length, 0);
  if (total <= 14_000) return [chunks];
  const target = Math.ceil(total / maxStudyPageParts);
  const parts: SourceChunk[][] = [[]];
  let characters = 0;
  for (const chunk of chunks) {
    if (parts.length < maxStudyPageParts && characters >= target) {
      parts.push([]);
      characters = 0;
    }
    parts.at(-1)!.push(chunk);
    characters += chunk.text.length;
  }
  return parts.filter((part) => part.length > 0);
}

export function buildStudyPageMessages({
  chapter,
  chunks,
  language,
  part,
}: {
  chapter: StudyChapter;
  chunks: SourceChunk[];
  language: string;
  part?: { index: number; total: number };
}): LlmMessage[] {
  const evidence = selectStudyPageEvidence(chunks);
  const partInstruction = part && part.total > 1
    ? `This is section ${part.index + 1} of ${part.total} independently generated sections. Cover only this evidence packet. ${part.index === 0 ? "Begin with the chapter title and foundational concepts; do not write the final mastery checklist." : "Do not repeat the chapter introduction. Continue with the remaining concepts, applications, traps, and finish with one mastery checklist for the whole chapter."}`
    : "Create one complete study page and finish with a mastery checklist.";
  return [
    {
      role: "system",
      content: `You create a self-contained, exam-quality study page from uploaded course evidence.
The uploaded evidence is authoritative. Do not add web knowledge. Distinguish any necessary general knowledge.
Write in ${language}. Be dense but teach clearly: intuition, exact concepts and rules, worked examples, common traps, and a final mastery checklist.
${part && part.total > 1 ? "Target 450-750 words for this section." : "Target 800-1,400 words."} Prioritize complete coverage and clarity over length. Cover only the chapter's examinable learning goals. Do not pad the page with course schedules, instructor information, communications, textbooks, or exam logistics.
Remove administrative filler and repetition. Preserve course notation and terminology.
Every source-grounded section must cite [Source N, Slide M]. Never invent citations.
Use Markdown. When a diagram materially improves understanding, include one or more strict agn-artifact JSON fences.
Supported artifact shapes:
flowchart: {"artifact":"flowchart","version":1,"title":"...","nodes":[{"id":"a","label":"..."}],"edges":[{"from":"a","to":"b","label":"..."}]}
hierarchy: {"artifact":"hierarchy","version":1,"title":"...","root":{"label":"...","children":[...]}}
er-diagram: {"artifact":"er-diagram","version":1,"title":"...","entities":[{"id":"entity_a","name":"Entity A","attributes":[{"name":"identifier","key":true},{"name":"attribute"}]}],"relationships":[{"from":"entity_a","to":"entity_b","label":"relationship","fromCardinality":"0..N","toCardinality":"1..1"}]}
Use normal Markdown tables for comparisons and tabular information; do not emit table or comparison artifacts. Use an er-diagram artifact for conceptual data models, with faithful entities, keys, relationships, and cardinalities.
Use hierarchy only for genuine parent-child containment. Place the broadest parent at the top. For ordered layers, pipelines, or transformations, use a flowchart and preserve the direction stated by the evidence. Check every diagram's semantics against the source before emitting it.
Put each artifact JSON object on one line inside a correctly closed agn-artifact fence. Do not nest fences.
Do not emit HTML, SVG, Mermaid, scripts, or coordinates. Keep artifacts small and semantic.`,
    },
    {
      role: "user",
      content: `Create the study page for this chapter.
Title: ${chapter.title}
Purpose: ${chapter.description}
Learning goals: ${chapter.goals.join("; ") || "Infer them from the material."}
Generation assignment: ${partInstruction}

Uploaded evidence:
${buildSourceBlock(evidence)}`,
    },
  ];
}
