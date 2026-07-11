"use client";

import { BookOpen, Loader2, RefreshCw, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { ChatMessage } from "@/components/chat/ChatMessage";
import { Button } from "@/components/ui/button";
import { repairModelCitations } from "@/lib/llm/citations";
import { streamDeepInfraChatCompletionViaRoute } from "@/lib/llm/openAiCompatible";
import type { SourceChunk } from "@/lib/search/types";
import {
  buildChapterPlannerMessages,
  chunksForChapter,
  createLibraryKey,
  parseChapterPlan,
} from "@/lib/study/chapterPlanner";
import { buildStudyPageMessages, selectStudyPageEvidence } from "@/lib/study/studyPage";
import type { StudyChapter, StudyChapterPlan, StudyPage } from "@/lib/study/types";

export function StudyWorkspace({
  open,
  apiKey,
  chunks,
  activeChapterId,
  onClose,
  onActivateChapter,
  onStartTest,
}: {
  open: boolean;
  apiKey: string;
  chunks: SourceChunk[];
  activeChapterId?: string;
  onClose: () => void;
  onActivateChapter: (chapter?: StudyChapter) => void;
  onStartTest: (chapter: StudyChapter) => void;
}) {
  const libraryKey = useMemo(() => createLibraryKey(chunks), [chunks]);
  const storageKey = `agn.study.${libraryKey}`;
  const [plan, setPlan] = useState<StudyChapterPlan>();
  const [pages, setPages] = useState<Record<string, StudyPage>>({});
  const [selectedId, setSelectedId] = useState<string>();
  const [busy, setBusy] = useState<"plan" | "page">();
  const [error, setError] = useState<string>();

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      try {
        const stored = JSON.parse(localStorage.getItem(storageKey) ?? "null") as {
          plan?: StudyChapterPlan;
          pages?: Record<string, StudyPage>;
        } | null;
        if (stored?.plan?.libraryKey === libraryKey) {
          setPlan(stored.plan);
          setPages(stored.pages ?? {});
          setSelectedId(activeChapterId ?? stored.plan.chapters[0]?.id);
        } else {
          setPlan(undefined);
          setPages({});
          setSelectedId(undefined);
        }
      } catch {
        setPlan(undefined);
        setPages({});
      }
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [activeChapterId, libraryKey, storageKey]);

  if (!open) return null;
  const selected = plan?.chapters.find((chapter) => chapter.id === selectedId);

  async function createPlan() {
    if (!apiKey.trim()) return setError("Add a DeepInfra API key before building chapters.");
    setBusy("plan"); setError(undefined);
    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 90_000);
      const response = await streamDeepInfraChatCompletionViaRoute({
        settings: { apiKey },
        messages: buildChapterPlannerMessages(chunks, inferLanguage(chunks)),
        onDelta() {},
        reasoningEffort: "low",
        maxTokens: 8_000,
        signal: controller.signal,
      });
      window.clearTimeout(timeout);
      const nextPlan = parseChapterPlan(response.content, chunks, inferLanguage(chunks));
      setPlan(nextPlan); setPages({}); setSelectedId(nextPlan.chapters[0]?.id);
      persist(storageKey, nextPlan, {});
    } catch (cause) {
      setError(cause instanceof Error && cause.name !== "AbortError" ? cause.message : "Chapter planning exceeded the 90-second budget. Try again later.");
    } finally { setBusy(undefined); }
  }

  async function createPage(chapter: StudyChapter) {
    if (!apiKey.trim()) return setError("Add a DeepInfra API key before generating a study page.");
    setBusy("page"); setError(undefined);
    try {
      const chapterChunks = chunksForChapter(chunks, chapter);
      const evidence = selectStudyPageEvidence(chapterChunks);
      let streamed = "";
      const response = await streamDeepInfraChatCompletionViaRoute({
        settings: { apiKey },
        messages: buildStudyPageMessages({ chapter, chunks: chapterChunks, language: inferLanguage(chapterChunks) }),
        onDelta(delta) { streamed += delta; },
        reasoningEffort: "medium",
        maxTokens: 8_000,
      });
      const page: StudyPage = {
        version: 1,
        chapterId: chapter.id,
        generatedAt: Date.now(),
        markdown: repairModelCitations(response.content || streamed, evidence),
        sourceChunkIds: evidence.map((chunk) => chunk.id),
      };
      const nextPages = { ...pages, [chapter.id]: page };
      setPages(nextPages);
      if (plan) persist(storageKey, plan, nextPages);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not generate the study page.");
    } finally { setBusy(undefined); }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Study chapters" className="fixed inset-0 z-50 flex bg-background/95 backdrop-blur-xl">
      <aside className="hidden w-80 shrink-0 overflow-y-auto border-r border-border p-4 md:block">
        <h2 className="text-base font-semibold">Study chapters</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">Cached locally for this library. Course study never searches the web automatically.</p>
        <ChapterList plan={plan} selectedId={selectedId} onSelect={setSelectedId} />
      </aside>
      <section className="min-w-0 flex-1 overflow-y-auto">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/90 px-4 py-3 backdrop-blur">
          <div><h2 className="font-semibold">{selected?.title ?? "Build your study curriculum"}</h2><p className="text-xs text-muted-foreground">{plan?.title ?? `${chunks.length} indexed source chunks`}</p></div>
          <Button variant="ghost" size="icon" aria-label="Close study chapters" onClick={onClose}><X /></Button>
        </header>
        <div className="mx-auto max-w-4xl p-4 sm:p-7">
          <div className="mb-4 md:hidden"><ChapterList plan={plan} selectedId={selectedId} onSelect={setSelectedId} /></div>
          {error ? <p className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p> : null}
          {!plan ? (
            <div className="rounded-2xl border border-border bg-card p-6 text-center"><BookOpen className="mx-auto mb-3 size-7 text-primary" /><h3 className="font-semibold">Turn the corpus into a curriculum</h3><p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">AGN reads the compact slide outline once, groups concepts and exercises into coherent chapters, and stores the plan in this browser.</p><Button className="mt-5" disabled={busy === "plan" || chunks.length === 0} onClick={() => void createPlan()}>{busy === "plan" ? <Loader2 className="animate-spin" /> : null}Build chapters</Button></div>
          ) : selected ? (
            <>
              <div className="mb-5 rounded-2xl border border-border bg-card p-4"><p className="text-sm leading-6">{selected.description}</p><ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">{selected.goals.map((goal) => <li key={goal}>{goal}</li>)}</ul><div className="mt-4 flex flex-wrap gap-2"><Button size="sm" variant={activeChapterId === selected.id ? "secondary" : "default"} onClick={() => onActivateChapter(activeChapterId === selected.id ? undefined : selected)}>{activeChapterId === selected.id ? "Studying this chapter" : "Study this chapter in chat"}</Button><Button size="sm" variant="secondary" onClick={() => onStartTest(selected)}>Test me thoroughly</Button><Button size="sm" variant="outline" disabled={busy === "page"} onClick={() => void createPage(selected)}>{busy === "page" ? <Loader2 className="animate-spin" /> : pages[selected.id] ? <RefreshCw /> : null}{pages[selected.id] ? "Regenerate page" : "Generate study page"}</Button></div></div>
              {pages[selected.id] ? <ChatMessage role="assistant" content={pages[selected.id]!.markdown} /> : <p className="py-12 text-center text-sm text-muted-foreground">Generate a durable study page with explanations, examples, traps, citations, and diagrams where useful.</p>}
            </>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function ChapterList({ plan, selectedId, onSelect }: { plan?: StudyChapterPlan; selectedId?: string; onSelect: (id: string) => void }) {
  if (!plan) return null;
  return <nav className="mt-4 space-y-1">{plan.chapters.map((chapter, index) => <button key={chapter.id} className={`w-full rounded-lg px-3 py-2 text-left text-sm ${selectedId === chapter.id ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`} onClick={() => onSelect(chapter.id)}><span className="mr-2 opacity-60">{index + 1}.</span>{chapter.title}</button>)}</nav>;
}

function inferLanguage(chunks: SourceChunk[]): string {
  const italian = chunks.filter((chunk) => /\b(?:dati|progettazione|esercizio|relazione|interrogazioni)\b/i.test(`${chunk.sourceTitle} ${chunk.slideTitle}`)).length;
  return italian > chunks.length / 5 ? "Italian" : "the corpus language";
}

function persist(key: string, plan: StudyChapterPlan, pages: Record<string, StudyPage>) {
  try { localStorage.setItem(key, JSON.stringify({ plan, pages })); } catch { /* Remain usable in memory. */ }
}
