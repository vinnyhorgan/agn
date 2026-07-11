import { describe, expect, it } from "vitest";

import { parseStudyContent, repairIncompleteArtifactFences, validateStudyArtifact } from "../../lib/study/artifacts";
import {
  buildCorpusOutline,
  chunksForChapter,
  createDeterministicChapterPlan,
  parseChapterPlan,
} from "../../lib/study/chapterPlanner";
import { selectStudyPageEvidence } from "../../lib/study/studyPage";
import type { SourceChunk } from "../../lib/search/types";

const chunks = [1, 2, 3, 4].map(createChunk);

describe("study chapters", () => {
  it("builds a compact outline with stable slide references", () => {
    const outline = buildCorpusOutline(chunks);
    expect(outline).toContain("DECK \"deck\"");
    expect(outline).toContain("global 1, local 1: Topic 1");
  });

  it("parses and validates a chapter plan", () => {
    const plan = parseChapterPlan(
      JSON.stringify({
        version: 1,
        title: "Course",
        language: "en",
        chapters: [
          { title: "Foundations", description: "Core ideas", goals: ["Explain them"], scopes: [{ deckId: "deck", slideStart: 1, slideEnd: 2 }] },
          { title: "Practice", description: "Apply them", goals: [], scopes: [{ deckId: "deck", slideStart: 3, slideEnd: 4 }] },
        ],
      }),
      chunks,
    );
    expect(plan.chapters.map((chapter) => chapter.id)).toEqual(["chapter-1", "chapter-2"]);
    expect(chunksForChapter(chunks, plan.chapters[1]!)).toHaveLength(2);
  });

  it("rejects overlapping chapter scopes", () => {
    expect(() => parseChapterPlan(JSON.stringify({ chapters: [
      { scopes: [{ deckId: "deck", slideStart: 1, slideEnd: 3 }] },
      { scopes: [{ deckId: "deck", slideStart: 3, slideEnd: 4 }] },
    ] }), chunks)).toThrow("more than one chapter");
  });

  it("bounds study-page evidence", () => {
    const large = Array.from({ length: 100 }, (_, index) => ({ ...createChunk(index + 1), text: "x".repeat(1_000) }));
    const selected = selectStudyPageEvidence(large);
    expect(selected.reduce((sum, chunk) => sum + chunk.text.length, 0)).toBeLessThanOrEqual(72_000);
  });

  it("creates a complete deterministic plan without a provider call", () => {
    const plan = createDeterministicChapterPlan(chunks, "en");
    expect(plan.chapters).toHaveLength(1);
    expect(chunksForChapter(chunks, plan.chapters[0]!)).toEqual(chunks);
  });
});

describe("study artifacts", () => {
  it("parses a semantic flowchart embedded in Markdown", () => {
    const parts = parseStudyContent('Before\n```agn-artifact\n{"artifact":"flowchart","version":1,"title":"Plan","nodes":[{"id":"a","label":"A"},{"id":"b","label":"B"}],"edges":[{"from":"a","to":"b"}]}\n```\nAfter');
    expect(parts).toHaveLength(3);
    expect(parts[1]?.artifact?.artifact).toBe("flowchart");
  });

  it("normalizes supported artifacts emitted in json fences", () => {
    const parts = parseStudyContent('```json\n{"artifact":"comparison","version":1,"title":"Keys","columns":["Key","Meaning"],"rows":[["PK","Primary"]]}\n```');
    expect(parts[0]?.artifact?.artifact).toBe("comparison");
  });

  it("rejects executable and dangling artifact structures", () => {
    expect(() => validateStudyArtifact({ artifact: "html", version: 1, title: "x", html: "<script>" })).toThrow("Unknown");
    expect(() => validateStudyArtifact({ artifact: "flowchart", version: 1, title: "x", nodes: [{ id: "a", label: "A" }], edges: [{ from: "a", to: "missing" }] })).toThrow("unknown node");
  });

  it("validates a conceptual ER diagram with keys and cardinalities", () => {
    const artifact = validateStudyArtifact({
      artifact: "er-diagram", version: 1, title: "University",
      entities: [
        { id: "student", name: "Student", attributes: [{ name: "id", key: true }] },
        { id: "exam", name: "Exam", attributes: [{ name: "date" }] },
      ],
      relationships: [{ from: "student", to: "exam", label: "takes", fromCardinality: "0..N", toCardinality: "1..1" }],
    });
    expect(artifact.artifact).toBe("er-diagram");
    if (artifact.artifact === "er-diagram") expect(artifact.entities[0]?.attributes[0]?.key).toBe(true);
  });

  it("recovers a complete artifact when the model omits its closing fence", () => {
    const content = 'Before\n```agn-artifact\n{"artifact":"comparison","version":1,"title":"Exam","columns":["Part","Score"],"rows":[["Oral","30"]]}\nAfter the table.';
    const parts = parseStudyContent(content);
    expect(parts.some((part) => part.artifact?.artifact === "comparison")).toBe(true);
    expect(parts.at(-1)?.content).toContain("After the table.");
  });

  it("removes an unterminated fence so later prose is not rendered as one code block", () => {
    const repaired = repairIncompleteArtifactFences("```json\n{broken\n## Later section");
    expect(repaired).not.toContain("```");
    expect(repaired).toContain("## Later section");
  });
});

function createChunk(slideNumber: number): SourceChunk {
  return {
    id: `deck:slide-${slideNumber}-chunk-1`, deckId: "deck", deckTitle: "Course",
    sourceLabel: "Source 1", sourceTitle: "Lectures", sourcePath: "course.pdf", sourceMediaType: "pdf",
    slideNumber, sourceSlideNumber: slideNumber, slideTitle: `Topic ${slideNumber}`,
    text: `Content ${slideNumber}`, slideImagePath: `slides/${String(slideNumber).padStart(4, "0")}.webp`,
  };
}
