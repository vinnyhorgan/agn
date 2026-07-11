"use client";

import { BookOpen, CheckCircle2, Loader2, RefreshCw, Sparkles, Square, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

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

interface BulkGenerationState {
  status: "running" | "stopped" | "complete";
  total: number;
  completed: number;
  failed: number;
  currentTitle?: string;
}

class StudyStorageError extends Error {}

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
  const pagesRef = useRef<Record<string, StudyPage>>({});
  const [selectedId, setSelectedId] = useState<string>();
  const [busy, setBusy] = useState<"plan" | "page" | "bulk">();
  const [bulk, setBulk] = useState<BulkGenerationState>();
  const bulkRef = useRef<BulkGenerationState | undefined>(undefined);
  const bulkController = useRef<AbortController | undefined>(undefined);
  const [draftPage, setDraftPage] = useState("");
  const [error, setError] = useState<string>();
  const initialActiveChapterId = useRef(activeChapterId);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      try {
        const stored = JSON.parse(localStorage.getItem(storageKey) ?? "null") as {
          plan?: StudyChapterPlan;
          pages?: Record<string, StudyPage>;
          bulk?: BulkGenerationState;
        } | null;
        if (stored?.plan?.libraryKey === libraryKey) {
          setPlan(stored.plan);
          const storedPages = stored.pages ?? {};
          setPages(storedPages);
          pagesRef.current = storedPages;
          const storedBulk = stored.bulk?.status === "running"
            ? { ...stored.bulk, status: "stopped" as const, currentTitle: undefined }
            : stored.bulk;
          setBulk(storedBulk);
          bulkRef.current = storedBulk;
          setSelectedId((current) => current ?? initialActiveChapterId.current ?? stored.plan!.chapters[0]?.id);
        } else {
          setPlan(undefined);
          setPages({});
          pagesRef.current = {};
          setBulk(undefined);
          bulkRef.current = undefined;
          setSelectedId(undefined);
        }
      } catch {
        setPlan(undefined);
        setPages({});
        pagesRef.current = {};
      }
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [libraryKey, storageKey]);

  useEffect(() => () => bulkController.current?.abort(), [libraryKey]);

  useEffect(() => {
    if (busy !== "bulk") return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [busy]);

  if (!open) return null;
  const selected = plan?.chapters.find((chapter) => chapter.id === selectedId);
  const showingNotebook = selectedId === "__notebook";

  async function createPlan() {
    if (!apiKey.trim()) return setError("Add a DeepInfra API key to organize this corpus into meaningful study chapters.");
    const candidatePlan = createDeterministicChapterPlan(chunks, inferStudyLanguage(chunks));
    setPlan(candidatePlan); setPages({}); setSelectedId(candidatePlan.chapters[0]?.id);
    persist(storageKey, candidatePlan, {}, undefined);
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
      pagesRef.current = {};
      setBulk(undefined); bulkRef.current = undefined;
      persist(storageKey, nextPlan, {}, undefined);
    } catch (cause) {
      const detail = cause instanceof Error && cause.name !== "AbortError" ? cause.message : "The provider did not finish within two minutes.";
      setError(`The AI organizer was unavailable, so AGN kept the complete local draft instead of losing your work. ${detail}`);
    } finally { window.clearTimeout(timeout); setBusy(undefined); }
  }

  function createBasicPlan() {
    const nextPlan = createDeterministicChapterPlan(chunks, inferStudyLanguage(chunks));
    setPlan(nextPlan); setPages({}); setSelectedId(nextPlan.chapters[0]?.id);
    pagesRef.current = {};
    setBulk(undefined); bulkRef.current = undefined;
    persist(storageKey, nextPlan, {}, undefined);
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
      pagesRef.current = {};
      setBulk(undefined); bulkRef.current = undefined;
      persist(storageKey, nextPlan, {}, undefined);
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

  async function generatePage(chapter: StudyChapter, signal: AbortSignal, onDraft?: (draft: string) => void): Promise<StudyPage> {
    const chapterChunks = chunksForChapter(chunks, chapter);
    const evidence = selectStudyPageEvidence(chapterChunks);
    const evidenceParts = splitStudyPageEvidence(evidence);
    if (evidenceParts.length === 0) throw new Error(`No source evidence was found for “${chapter.title}”.`);
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
          onDraft?.(drafts.join("\n\n"));
        },
        reasoningEffort: "low",
        maxTokens: evidenceParts.length > 1 ? 2_600 : 3_800,
        signal,
      })
    ));
    const completed = responses.map((response, index) => response.content || drafts[index]).join("\n\n");
    return {
      version: 1,
      chapterId: chapter.id,
      generatedAt: Date.now(),
      markdown: finalizeStudyPage(repairModelCitations(completed, evidence), evidence.length > 0),
      sourceChunkIds: evidence.map((chunk) => chunk.id),
    };
  }

  function savePage(chapterId: string, page: StudyPage, currentBulk = bulkRef.current) {
    const nextPages = { ...pagesRef.current, [chapterId]: page };
    if (plan && !persist(storageKey, plan, nextPages, currentBulk)) {
      throw new StudyStorageError("The paper was generated, but browser storage could not save it. Generation stopped to avoid wasting more inference. Free browser storage and retry.");
    }
    pagesRef.current = nextPages;
    setPages(nextPages);
  }

  async function createPage(chapter: StudyChapter) {
    if (!apiKey.trim()) return setError("Add a DeepInfra API key before generating a study page.");
    setBusy("page"); setError(undefined); setDraftPage("");
    const controller = new AbortController();
    try {
      const page = await generatePage(chapter, controller.signal, setDraftPage);
      savePage(chapter.id, page);
    } catch (cause) {
      setError(cause instanceof Error && cause.name !== "AbortError" ? cause.message : "Generation stopped. Nothing was saved.");
    } finally { setDraftPage(""); setBusy(undefined); }
  }

  function updateBulk(next: BulkGenerationState) {
    bulkRef.current = next;
    setBulk(next);
    if (plan) persist(storageKey, plan, pagesRef.current, next);
  }

  async function createAllPages() {
    if (!plan) return;
    if (!apiKey.trim()) return setError("Add a DeepInfra API key before generating all study papers.");
    const pending = plan.chapters.filter((chapter) => !pagesRef.current[chapter.id]);
    if (pending.length === 0) return;
    const controller = new AbortController();
    bulkController.current = controller;
    setBusy("bulk"); setError(undefined); setDraftPage("");
    let completed = 0;
    let failed = 0;
    let storageFailure: string | undefined;
    updateBulk({ status: "running", total: pending.length, completed, failed });

    for (const chapter of pending) {
      if (controller.signal.aborted) break;
      updateBulk({ status: "running", total: pending.length, completed, failed, currentTitle: chapter.title });
      try {
        const page = await generatePage(chapter, controller.signal);
        completed += 1;
        const progress = { status: "running" as const, total: pending.length, completed, failed, currentTitle: chapter.title };
        bulkRef.current = progress;
        savePage(chapter.id, page, progress);
        setBulk(progress);
      } catch (cause) {
        if (controller.signal.aborted) break;
        if (cause instanceof StudyStorageError) {
          storageFailure = cause.message;
          controller.abort();
          break;
        }
        failed += 1;
        updateBulk({ status: "running", total: pending.length, completed, failed, currentTitle: chapter.title });
        console.warn(`Study paper generation failed for chapter ${chapter.id}:`, cause instanceof Error ? cause.message : "Unknown error");
      }
    }

    const stopped = controller.signal.aborted;
    const finalState: BulkGenerationState = {
      status: stopped || failed > 0 ? "stopped" : "complete",
      total: pending.length,
      completed,
      failed,
    };
    updateBulk(finalState);
    if (storageFailure) setError(storageFailure);
    else if (failed > 0) setError(`${failed} ${failed === 1 ? "paper" : "papers"} failed quality checks or provider requests. Completed papers were saved; use Generate remaining to retry only missing chapters.`);
    bulkController.current = undefined;
    setBusy(undefined);
  }

  function stopBulkGeneration() {
    bulkController.current?.abort();
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
          {plan ? <div className="mb-4 space-y-3 rounded-xl border border-border/70 bg-muted/30 px-3 py-3"><div className="flex items-center justify-between gap-3"><p className="text-xs text-muted-foreground">{busy === "plan" ? "A complete local draft is ready. AI is improving its topics and prerequisite order…" : "This curriculum and every completed paper are saved locally in this browser."}</p><Button size="sm" variant="ghost" disabled={Boolean(busy)} title="Improve chapter boundaries, titles, goals, and prerequisite order from the compact local draft." onClick={() => void refinePlan()}>{busy === "plan" ? <Loader2 className="animate-spin" /> : null}Reorganize with AI</Button></div><BulkGenerationControls plan={plan} pages={pages} busy={busy} bulk={bulk} onGenerate={() => void createAllPages()} onStop={stopBulkGeneration} /></div> : null}
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

function BulkGenerationControls({
  plan,
  pages,
  busy,
  bulk,
  onGenerate,
  onStop,
}: {
  plan: StudyChapterPlan;
  pages: Record<string, StudyPage>;
  busy?: "plan" | "page" | "bulk";
  bulk?: BulkGenerationState;
  onGenerate: () => void;
  onStop: () => void;
}) {
  const saved = plan.chapters.filter((chapter) => pages[chapter.id]).length;
  const remaining = plan.chapters.length - saved;
  const running = busy === "bulk";
  const attempted = bulk ? bulk.completed + bulk.failed : 0;
  const percent = running && bulk?.total ? Math.round((attempted / bulk.total) * 100) : Math.round((saved / plan.chapters.length) * 100);
  return <div className="border-t border-border/70 pt-3"><div className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-3 text-xs"><span className="font-medium">{running ? `Generating ${bulk?.currentTitle ?? "study papers"}…` : remaining === 0 ? "All study papers are ready" : `${saved} of ${plan.chapters.length} papers saved`}</span><span className="text-muted-foreground">{percent}%</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border"><div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${percent}%` }} /></div><p className="mt-2 text-xs text-muted-foreground">{running ? "Each paper is validated and saved immediately. You may close this study view, but keep the AGN browser tab open while the queue runs." : bulk?.status === "stopped" && remaining > 0 ? "The previous run stopped or had failures. Starting again skips every paper already saved." : "Generate missing papers sequentially to reduce provider failures. Existing papers are never regenerated."}</p></div>{running ? <Button size="sm" variant="outline" onClick={onStop}><Square className="size-3 fill-current" />Stop</Button> : <Button size="sm" disabled={Boolean(busy) || remaining === 0} onClick={onGenerate}><Sparkles />{saved === 0 ? "Generate all papers" : `Generate remaining (${remaining})`}</Button>}</div></div>;
}

function persist(key: string, plan: StudyChapterPlan, pages: Record<string, StudyPage>, bulk?: BulkGenerationState): boolean {
  try {
    localStorage.setItem(key, JSON.stringify({ plan, pages, bulk }));
    return true;
  } catch {
    return false;
  }
}
