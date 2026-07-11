"use client";

import { BookOpen, CheckCircle2, Loader2, RefreshCw, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { ChatMessage } from "@/components/chat/ChatMessage";
import { Button } from "@/components/ui/button";
import { repairModelCitations } from "@/lib/llm/citations";
import { DEEPINFRA_STRUCTURED_MODEL, streamDeepInfraChatCompletionViaRoute } from "@/lib/llm/openAiCompatible";
import type { SourceChunk } from "@/lib/search/types";
import {
  buildChapterPlannerMessages,
  buildChapterPlanRepairMessages,
  buildCompactChapterOrganizerMessages,
  chunksForChapter,
  createDeterministicChapterPlan,
  createLibraryKey,
  parseChapterPlan,
  parseCompactChapterPlan,
} from "@/lib/study/chapterPlanner";
import { buildStudyPageMessages, finalizeStudyPage, selectStudyPageEvidence, splitStudyPageEvidence } from "@/lib/study/studyPage";
import type { StudyChapter, StudyChapterPlan, StudyPage } from "@/lib/study/types";
import { inferStudyLanguage } from "@/lib/study/language";

export function StudyWorkspace({
  open,
  apiKey,
  chunks,
  activeChapterId,
  onClose,
  onStartTest,
}: {
  open: boolean;
  apiKey: string;
  chunks: SourceChunk[];
  activeChapterId?: string;
  onClose: () => void;
  onStartTest: (chapter: StudyChapter) => void;
}) {
  const libraryKey = useMemo(() => createLibraryKey(chunks), [chunks]);
  const storageKey = `agn.study.v3.${libraryKey}`;
  const [plan, setPlan] = useState<StudyChapterPlan>();
  const [pages, setPages] = useState<Record<string, StudyPage>>({});
  const [selectedId, setSelectedId] = useState<string>();
  const [busy, setBusy] = useState<"plan" | "page">();
  const [draftPage, setDraftPage] = useState("");
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
  const showingNotebook = selectedId === "__notebook";

  async function createPlan() {
    if (!apiKey.trim()) return setError("Add a DeepInfra API key to organize this corpus into meaningful study chapters.");
    const candidatePlan = createDeterministicChapterPlan(chunks, inferStudyLanguage(chunks));
    setPlan(candidatePlan); setPages({}); setSelectedId(candidatePlan.chapters[0]?.id);
    persist(storageKey, candidatePlan, {});
    setBusy("plan"); setError(undefined);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 120_000);
    try {
      const response = await streamDeepInfraChatCompletionViaRoute({
        settings: { apiKey },
        messages: buildCompactChapterOrganizerMessages(candidatePlan, chunks),
        onDelta() {},
        reasoningEffort: "low",
        maxTokens: 1_500,
        responseFormat: "json_object",
        model: DEEPINFRA_STRUCTURED_MODEL,
        signal: controller.signal,
      });
      const nextPlan = await parseOrRepairCompactPlan(response.content, candidatePlan, controller.signal);
      setPlan(nextPlan); setPages({}); setSelectedId(nextPlan.chapters[0]?.id);
      persist(storageKey, nextPlan, {});
    } catch (cause) {
      const detail = cause instanceof Error && cause.name !== "AbortError" ? cause.message : "The provider did not finish within two minutes.";
      setError(`The AI organizer was unavailable, so AGN kept the complete local draft instead of losing your work. ${detail}`);
    } finally { window.clearTimeout(timeout); setBusy(undefined); }
  }

  function createBasicPlan() {
    const nextPlan = createDeterministicChapterPlan(chunks, inferStudyLanguage(chunks));
    setPlan(nextPlan); setPages({}); setSelectedId(nextPlan.chapters[0]?.id);
    persist(storageKey, nextPlan, {});
  }

  async function refinePlan() {
    if (!apiKey.trim()) return setError("Add a DeepInfra API key before building chapters.");
    setBusy("plan"); setError(undefined);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 120_000);
    try {
      const response = await streamDeepInfraChatCompletionViaRoute({
        settings: { apiKey },
        messages: plan
          ? buildCompactChapterOrganizerMessages(plan, chunks)
          : buildChapterPlannerMessages(chunks, inferStudyLanguage(chunks)),
        onDelta() {},
        reasoningEffort: "low",
        maxTokens: 1_500,
        responseFormat: "json_object",
        model: DEEPINFRA_STRUCTURED_MODEL,
        signal: controller.signal,
      });
      const nextPlan = plan
        ? await parseOrRepairCompactPlan(response.content, plan, controller.signal)
        : await parseOrRepairPlan(response.content, controller.signal);
      setPlan(nextPlan); setPages({}); setSelectedId(nextPlan.chapters[0]?.id);
      persist(storageKey, nextPlan, {});
    } catch (cause) {
      setError(cause instanceof Error && cause.name !== "AbortError" ? cause.message : "The provider did not finish within two minutes. The existing curriculum is unchanged.");
    } finally { window.clearTimeout(timeout); setBusy(undefined); }
  }

  async function parseOrRepairPlan(content: string, signal?: AbortSignal): Promise<StudyChapterPlan> {
    try {
      return parseChapterPlan(content, chunks, inferStudyLanguage(chunks));
    } catch {
      setError("The model returned malformed curriculum data. Repairing it now…");
      const repaired = await streamDeepInfraChatCompletionViaRoute({
        settings: { apiKey },
        messages: buildChapterPlanRepairMessages(content),
        onDelta() {},
        reasoningEffort: "low",
        maxTokens: 3_500,
        responseFormat: "json_object",
        model: DEEPINFRA_STRUCTURED_MODEL,
        signal,
      });
      setError(undefined);
      try {
        return parseChapterPlan(repaired.content, chunks, inferStudyLanguage(chunks));
      } catch {
        throw new Error("The provider returned invalid curriculum data twice. Your existing study data was not changed; please retry.");
      }
    }
  }

  async function parseOrRepairCompactPlan(content: string, candidate: StudyChapterPlan, signal?: AbortSignal) {
    try {
      return parseCompactChapterPlan(content, candidate, chunks);
    } catch {
      setError("The model returned malformed curriculum data. Repairing it now…");
      const repaired = await streamDeepInfraChatCompletionViaRoute({
        settings: { apiKey }, messages: buildChapterPlanRepairMessages(content), onDelta() {},
        reasoningEffort: "low", maxTokens: 1_500, responseFormat: "json_object",
        model: DEEPINFRA_STRUCTURED_MODEL, signal,
      });
      setError(undefined);
      return parseCompactChapterPlan(repaired.content, candidate, chunks);
    }
  }

  async function createPage(chapter: StudyChapter) {
    if (!apiKey.trim()) return setError("Add a DeepInfra API key before generating a study page.");
    setBusy("page"); setError(undefined);
    setDraftPage("");
    const chapterChunks = chunksForChapter(chunks, chapter);
    const evidence = selectStudyPageEvidence(chapterChunks);
    let streamed = "";
    try {
      const controller = new AbortController();
      const evidenceParts = splitStudyPageEvidence(evidence);
      const drafts = evidenceParts.map(() => "");
      const responses = await Promise.all(evidenceParts.map((partChunks, index) =>
        streamDeepInfraChatCompletionViaRoute({
          settings: { apiKey },
          messages: buildStudyPageMessages({
            chapter,
            chunks: partChunks,
            language: inferStudyLanguage(chapterChunks),
            part: { index, total: evidenceParts.length },
          }),
          onDelta(delta) {
            drafts[index] += delta;
            streamed = drafts.join("\n\n");
            setDraftPage(streamed);
          },
          reasoningEffort: "low",
          maxTokens: evidenceParts.length > 1 ? 2_600 : 3_800,
          signal: controller.signal,
        })
      ));
      const completed = responses.map((response, index) => response.content || drafts[index]).join("\n\n");
      const page: StudyPage = {
        version: 1,
        chapterId: chapter.id,
        generatedAt: Date.now(),
        markdown: finalizeStudyPage(
          repairModelCitations(completed, evidence),
          evidence.length > 0,
        ),
        sourceChunkIds: evidence.map((chunk) => chunk.id),
      };
      setPages((current) => {
        const nextPages = { ...current, [chapter.id]: page };
        if (plan) persist(storageKey, plan, nextPages);
        return nextPages;
      });
      setDraftPage("");
    } catch (cause) {
      setError(cause instanceof Error && cause.name !== "AbortError" ? cause.message : "Generation stopped. Nothing was saved.");
    } finally { setDraftPage(""); setBusy(undefined); }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Study chapters" className="fixed inset-0 z-50 flex bg-background/95 backdrop-blur-xl">
      <aside className="hidden w-80 shrink-0 overflow-y-auto border-r border-border p-4 md:block">
        <h2 className="text-base font-semibold">Study chapters</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">Cached locally for this library. Course study never searches the web automatically.</p>
        <ChapterList plan={plan} pages={pages} selectedId={selectedId} onSelect={setSelectedId} />
      </aside>
      <section className="min-w-0 flex-1 overflow-y-auto">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/90 px-4 py-3 backdrop-blur">
          <div><h2 className="font-semibold">{selected?.title ?? "Build your study curriculum"}</h2><p className="text-xs text-muted-foreground">{plan?.title ?? `${chunks.length} indexed source chunks`}</p></div>
          <Button variant="ghost" size="icon" aria-label="Close study chapters" onClick={onClose}><X /></Button>
        </header>
        <div className="mx-auto max-w-4xl p-4 sm:p-7">
          <div className="mb-4 md:hidden"><ChapterList plan={plan} pages={pages} selectedId={selectedId} onSelect={setSelectedId} /></div>
          {error ? <p className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p> : null}
          {plan ? <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/30 px-3 py-2"><p className="text-xs text-muted-foreground">{busy === "plan" ? "A complete local draft is ready. AI is improving its topics and prerequisite order…" : "This curriculum is saved locally. AI organization can be retried without losing it."}</p><Button size="sm" variant="ghost" disabled={Boolean(busy)} title="Improve chapter boundaries, titles, goals, and prerequisite order from the compact local draft." onClick={() => void refinePlan()}>{busy === "plan" ? <Loader2 className="animate-spin" /> : null}Reorganize with AI</Button></div> : null}
          {!plan ? (
            <div className="rounded-2xl border border-border bg-card p-6 text-center"><BookOpen className="mx-auto mb-3 size-7 text-primary" /><h3 className="font-semibold">Turn the corpus into a curriculum</h3><p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">AGN uses the model to identify examinable concepts, combine overlapping sources and exercises, and order chapters by prerequisite—not by filename.</p><div className="mt-5 flex flex-wrap justify-center gap-2"><Button disabled={chunks.length === 0 || busy === "plan"} onClick={() => void createPlan()}>{busy === "plan" ? <Loader2 className="animate-spin" /> : null}{busy === "plan" ? "Organizing course…" : "Organize chapters with AI"}</Button><Button variant="ghost" disabled={chunks.length === 0 || Boolean(busy)} title="Fast fallback based only on source boundaries and slide titles; less accurate." onClick={createBasicPlan}>Use basic outline</Button></div></div>
          ) : showingNotebook ? (
            <StudyNotebook plan={plan} pages={pages} onSelect={setSelectedId} />
          ) : selected ? (
            <>
              <div className="mb-5 rounded-2xl border border-border bg-card p-4"><p className="text-sm leading-6">{selected.description}</p><ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">{selected.goals.map((goal) => <li key={goal}>{goal}</li>)}</ul><div className="mt-4 flex flex-wrap gap-2"><Button size="sm" onClick={() => onStartTest(selected)}>Start oral exam</Button><Button size="sm" variant="outline" disabled={busy === "page"} onClick={() => void createPage(selected)}>{busy === "page" ? <Loader2 className="animate-spin" /> : pages[selected.id] ? <RefreshCw /> : null}{pages[selected.id] ? "Regenerate notes" : "Generate chapter notes"}</Button></div></div>
              {draftPage ? <ChatMessage role="assistant" content={draftPage} /> : pages[selected.id] ? <ChatMessage role="assistant" content={pages[selected.id]!.markdown} /> : <p className="py-12 text-center text-sm text-muted-foreground">Generate a durable study page with explanations, examples, traps, citations, and diagrams where useful.</p>}
            </>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function ChapterList({ plan, pages, selectedId, onSelect }: { plan?: StudyChapterPlan; pages: Record<string, StudyPage>; selectedId?: string; onSelect: (id: string) => void }) {
  if (!plan) return null;
  return <nav className="mt-4 space-y-1"><button className={`mb-2 w-full rounded-lg px-3 py-2 text-left text-sm font-medium ${selectedId === "__notebook" ? "bg-primary text-primary-foreground" : "bg-accent hover:bg-accent/70"}`} onClick={() => onSelect("__notebook")}>All chapter notes <span className="float-right opacity-70">{Object.keys(pages).length}/{plan.chapters.length}</span></button>{plan.chapters.map((chapter, index) => <button key={chapter.id} className={`flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left text-sm ${selectedId === chapter.id ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`} onClick={() => onSelect(chapter.id)}><span className="opacity-60">{index + 1}.</span><span className="min-w-0 flex-1">{chapter.title}</span>{pages[chapter.id] ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : null}</button>)}</nav>;
}

function StudyNotebook({ plan, pages, onSelect }: { plan: StudyChapterPlan; pages: Record<string, StudyPage>; onSelect: (id: string) => void }) {
  return <div><div className="mb-5"><h3 className="font-semibold">Your study notebook</h3><p className="mt-1 text-sm text-muted-foreground">Generated notes are saved per chapter in this browser. Open any chapter to read or regenerate it.</p></div><div className="grid gap-3 sm:grid-cols-2">{plan.chapters.map((chapter, index) => <button key={chapter.id} className="rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/35 hover:bg-accent/40" onClick={() => onSelect(chapter.id)}><div className="flex gap-3"><span className="text-sm text-muted-foreground">{index + 1}</span><div><p className="text-sm font-semibold">{chapter.title}</p><p className="mt-1 text-xs text-muted-foreground">{pages[chapter.id] ? "Notes ready" : "Not generated yet"}</p></div></div></button>)}</div></div>;
}

function persist(key: string, plan: StudyChapterPlan, pages: Record<string, StudyPage>) {
  try { localStorage.setItem(key, JSON.stringify({ plan, pages })); } catch { /* Remain usable in memory. */ }
}
