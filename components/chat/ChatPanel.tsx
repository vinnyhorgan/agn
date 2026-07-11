"use client";

import { AlertCircle, BookOpen, Check, Copy, Send, Square, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { ChatMessage } from "@/components/chat/ChatMessage";
import { ProviderSettings } from "@/components/chat/ProviderSettings";
import { StudyWorkspace } from "@/components/study/StudyWorkspace";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Badge } from "@/components/ui/badge";
import {
  HARNESS_VERSION,
  estimateTokens,
  type TurnDiagnostics,
} from "@/lib/harness/diagnostics";
import { Button } from "@/components/ui/button";
import { repairModelCitations } from "@/lib/llm/citations";
import { buildGroundedMessages } from "@/lib/llm/groundedPrompt";
import {
  DEEPINFRA_MODEL,
  streamDeepInfraChatCompletionViaRoute,
} from "@/lib/llm/openAiCompatible";
import type { DeepInfraSettings, LibrarySource } from "@/lib/llm/types";
import {
  getRetrievalMode,
  retrieveSourceChunksWithDiagnostics,
} from "@/lib/search/retrieveSources";
import type { SourceChunk } from "@/lib/search/types";
import { chunksForChapter } from "@/lib/study/chapterPlanner";
import type { StudyChapter } from "@/lib/study/types";
import { cn } from "@/lib/utils";
import { repairWebCitations } from "@/lib/web/citations";
import {
  isExplicitWebSearch,
  searchWebViaRoute,
  shouldSearchWeb,
} from "@/lib/web/tavily";
import type { WebSearchResult } from "@/lib/web/types";

interface ChatPanelProps {
  sourceChunks: SourceChunk[];
  librarySources?: LibrarySource[];
  sourceCount?: number;
  onSelectSource?: (source: {
    deckId: string;
    slideNumber: number;
    chunkId?: string;
  }) => void;
}

type ChatTurnStatus = "streaming" | "complete" | "stopped" | "error";

interface ChatTurn {
  id: string;
  question: string;
  answer: string;
  sources: SourceChunk[];
  webResults: WebSearchResult[];
  status: ChatTurnStatus;
  error?: string;
  diagnostics: TurnDiagnostics;
}

interface StoredChatTurn {
  id: string;
  question: string;
  answer: string;
  sourceIds: string[];
  webResults?: WebSearchResult[];
  status: Exclude<ChatTurnStatus, "streaming">;
  error?: string;
  diagnostics?: TurnDiagnostics;
}

const historyLimit = 6;
const storedTurnLimit = 40;
const deepInfraApiKeyStorageKey = "agn.deepInfra.apiKey";
const deepInfraApiKeyChangedEvent = "agn:deepinfra-api-key-changed";
const tavilyApiKeyStorageKey = "agn.tavily.apiKey";
const tavilyApiKeyChangedEvent = "agn:tavily-api-key-changed";
const chatHistoryStorageKey = "agn.chat.history";
const chatHistoryChangedEvent = "agn:chat-history-changed";
const missingApiKeyMessage = "Add a valid DeepInfra API key before chatting.";

export function ChatPanel({
  sourceChunks,
  librarySources = [],
  sourceCount,
  onSelectSource,
}: ChatPanelProps) {
  const storedApiKey = useSyncExternalStore(
    subscribeToStoredDeepInfraApiKey,
    () => readStorage(deepInfraApiKeyStorageKey),
    () => "",
  );
  const storedTavilyApiKey = useSyncExternalStore(
    subscribeToStoredTavilyApiKey,
    () => readStorage(tavilyApiKeyStorageKey),
    () => "",
  );
  const storedTurnsJson = useSyncExternalStore(
    subscribeToStoredChatHistory,
    () => readStorage(chatHistoryStorageKey, "[]"),
    () => "[]",
  );
  const storedTurns = useMemo(
    () => parseStoredTurns(storedTurnsJson, sourceChunks),
    [storedTurnsJson, sourceChunks],
  );
  const settings = useMemo<DeepInfraSettings>(
    () => ({ apiKey: storedApiKey }),
    [storedApiKey],
  );
  const [sessionTurns, setSessionTurns] = useState<ChatTurn[]>();
  const [question, setQuestion] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [didCopyChat, setDidCopyChat] = useState(false);
  const [studyOpen, setStudyOpen] = useState(false);
  const [activeChapter, setActiveChapter] = useState<StudyChapter>();
  const abortControllerRef = useRef<AbortController | undefined>(undefined);
  const chatFormRef = useRef<HTMLFormElement>(null);
  const conversationEndRef = useRef<HTMLDivElement>(null);
  const turns = sessionTurns ?? storedTurns;
  const hasSources = sourceChunks.length > 0;

  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({
      behavior: isLoading ? "auto" : "smooth",
    });
  }, [turns, isLoading]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedQuestion = question.trim();

    if (!trimmedQuestion || isLoading) {
      return;
    }

    if (!settings.apiKey.trim()) {
      setError(missingApiKeyMessage);
      return;
    }

    if (isExplicitWebSearch(trimmedQuestion) && !storedTavilyApiKey.trim()) {
      setError("Add a Tavily API key before asking AGN to search the web.");
      return;
    }

    const currentTurns = turns;
    const wantsWeb = isExplicitWebSearch(trimmedQuestion) ||
      (!activeChapter && shouldSearchWeb(trimmedQuestion));
    const turnStartedAt = performance.now();
    const retrievalStartedAt = performance.now();
    const retrievalCorpus = activeChapter
      ? chunksForChapter(sourceChunks, activeChapter)
      : sourceChunks;
    const retrieval = retrieveSourceChunksWithDiagnostics({
      chunks: retrievalCorpus,
      query: trimmedQuestion,
      previousSources: currentTurns.at(-1)?.sources,
    });
    const retrievalMode = retrieval.mode;
    const sources = retrieval.chunks;
    const selectedChunkIds = new Set(sources.map((source) => source.id));
    const diagnostics: TurnDiagnostics = {
      version: 1,
      harnessVersion: HARNESS_VERSION,
      route: {
        kind: "deterministic",
        retrievalMode,
        webPolicy: isExplicitWebSearch(trimmedQuestion)
          ? "explicit"
          : wantsWeb
            ? "automatic"
            : "never",
      },
      retrieval: {
        query: trimmedQuestion.normalize("NFKC").trim(),
        previousEvidenceUsed: retrieval.previousSourcesUsed,
        candidates: retrieval.candidates.map((candidate) => ({
          chunkId: candidate.chunk.id,
          score: candidate.score,
          matchedTerms: candidate.matchedTerms,
          selected: selectedChunkIds.has(candidate.chunk.id),
        })),
        selectedChunkIds: [...selectedChunkIds],
        selectedCharacters: sources.reduce(
          (total, source) => total + source.text.length,
          0,
        ),
        expansions: retrieval.expansions,
      },
      web: { attempted: false, resultCount: 0 },
      timingsMs: { retrieval: elapsedMs(retrievalStartedAt) },
    };
    const pendingTurn: ChatTurn = {
      id: crypto.randomUUID(),
      question: trimmedQuestion,
      answer: "",
      sources,
      webResults: [],
      status: "streaming",
      diagnostics,
    };
    const nextTurns = [...currentTurns, pendingTurn];
    const abortController = new AbortController();
    let streamedAnswer = "";
    let errorStage: NonNullable<TurnDiagnostics["error"]>["stage"] = "web";

    abortControllerRef.current = abortController;
    setSessionTurns(nextTurns);
    setQuestion("");
    setIsLoading(true);
    setError(undefined);

    try {
      const webStartedAt = performance.now();
      diagnostics.web.attempted =
        wantsWeb && Boolean(storedTavilyApiKey.trim());
      const webResults =
        wantsWeb && storedTavilyApiKey.trim()
          ? await searchWebViaRoute({
              apiKey: storedTavilyApiKey,
              query: trimmedQuestion,
              signal: abortController.signal,
            })
          : [];
      diagnostics.web.resultCount = webResults.length;
      diagnostics.timingsMs.web = elapsedMs(webStartedAt);
      pendingTurn.webResults = webResults;
      setSessionTurns((current) =>
        (current ?? nextTurns).map((turn) =>
          turn.id === pendingTurn.id ? { ...turn, webResults } : turn,
        ),
      );
      errorStage = "prompt";
      const promptStartedAt = performance.now();
      const selectedCatalog = selectCatalogForRequest(
        librarySources,
        sources,
        retrievalMode,
      );
      const selectedHistory = currentTurns
        .filter((turn) => turn.answer && turn.status !== "error")
        .slice(-historyLimit)
        .map((turn) => ({ question: turn.question, answer: turn.answer }));
      const messages = buildGroundedMessages({
        question: trimmedQuestion,
        sourceChunks: sources,
        librarySources: selectedCatalog,
        runtimeModel: `${DEEPINFRA_MODEL} via DeepInfra`,
        webResults,
        history: selectedHistory,
      });
      const promptCharacters = messages.reduce(
        (total, message) => total + message.content.length,
        0,
      );
      diagnostics.context = {
        catalogCharacters: selectedCatalog.reduce(
          (total, source) => total + source.sourceTitle.length + source.sourcePath.length,
          0,
        ),
        localEvidenceCharacters: diagnostics.retrieval.selectedCharacters,
        webEvidenceCharacters: webResults.reduce(
          (total, result) => total + result.title.length + result.url.length + result.content.length,
          0,
        ),
        historyCharacters: selectedHistory.reduce(
          (total, turn) => total + turn.question.length + turn.answer.length,
          0,
        ),
        promptCharacters,
        estimatedPromptTokens: estimateTokens(promptCharacters),
        messageRoles: messages.map((message) => message.role),
      };
      diagnostics.timingsMs.promptAssembly = elapsedMs(promptStartedAt);
      errorStage = "provider";
      const response = await streamDeepInfraChatCompletionViaRoute({
        settings,
        messages,
        signal: abortController.signal,
        onDelta(delta) {
          if (diagnostics.timingsMs.timeToFirstToken === undefined) {
            diagnostics.timingsMs.timeToFirstToken = elapsedMs(turnStartedAt);
            errorStage = "stream";
          }
          streamedAnswer += delta;
          setSessionTurns((current) =>
            (current ?? nextTurns).map((turn) =>
              turn.id === pendingTurn.id
                ? { ...turn, answer: streamedAnswer }
                : turn,
            ),
          );
        },
      });
      const completedTurn: ChatTurn = {
        ...pendingTurn,
        answer: repairAnswerCitations(response.content, sources, webResults),
        status: "complete",
        diagnostics: {
          ...diagnostics,
          timingsMs: { ...diagnostics.timingsMs, total: elapsedMs(turnStartedAt) },
        },
      };
      const completedTurns = [...currentTurns, completedTurn];
      setSessionTurns(completedTurns);
      writeStoredTurns(completedTurns);
    } catch (chatError) {
      const wasStopped = abortController.signal.aborted;
      const failureMessage = wasStopped
        ? undefined
        : chatError instanceof Error
          ? chatError.message
          : "Could not complete the DeepInfra request.";
      diagnostics.timingsMs.total = elapsedMs(turnStartedAt);
      if (failureMessage) {
        diagnostics.error = { stage: errorStage, message: failureMessage };
      }
      const interruptedTurn: ChatTurn = {
        ...pendingTurn,
        answer: repairAnswerCitations(
          streamedAnswer,
          sources,
          pendingTurn.webResults,
        ),
        status: wasStopped ? "stopped" : "error",
        error: failureMessage,
        diagnostics,
      };
      const interruptedTurns = [...currentTurns, interruptedTurn];
      setSessionTurns(interruptedTurns);
      writeStoredTurns(interruptedTurns);

      if (!wasStopped) {
        setError(failureMessage);
      }
    } finally {
      abortControllerRef.current = undefined;
      setIsLoading(false);
    }
  }

  function stopGeneration() {
    abortControllerRef.current?.abort();
  }

  function clearConversation() {
    abortControllerRef.current?.abort();
    setSessionTurns([]);
    writeStoredTurns([]);
    setError(undefined);
  }

  async function copyConversation() {
    await navigator.clipboard.writeText(
      formatChatDiagnosticExport(turns, librarySources),
    );
    setDidCopyChat(true);
    window.setTimeout(() => setDidCopyChat(false), 2_000);
  }

  function selectSource(source: SourceChunk) {
    onSelectSource?.({
      deckId: source.deckId,
      slideNumber: source.slideNumber,
      chunkId: source.id,
    });
  }

  function handleQuestionKeyDown(
    event: React.KeyboardEvent<HTMLTextAreaElement>,
  ) {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }

    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  return (
    <section className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex min-h-14 items-center justify-between gap-2 border-b border-border bg-background/80 px-3 backdrop-blur-xl sm:gap-3 sm:px-4">
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold text-foreground">Chat</h1>
          <p className="truncate text-xs text-muted-foreground">
            Sources are used first when relevant
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="lg:hidden">
            <ThemeToggle />
          </div>
          <Badge
            variant="outline"
            className="hidden border-border bg-card/60 text-muted-foreground sm:inline-flex"
          >
            {sourceCount ?? 0} source{(sourceCount ?? 0) === 1 ? "" : "s"}
          </Badge>
          <ProviderSettings
            settings={settings}
            tavilyApiKey={storedTavilyApiKey}
            onChange={(nextSettings) =>
              writeStoredApiKey(nextSettings.apiKey)
            }
            onTavilyApiKeyChange={writeStoredTavilyApiKey}
          />
          <Button
            type="button"
            variant={activeChapter ? "secondary" : "ghost"}
            size="icon-sm"
            title={activeChapter ? `Studying: ${activeChapter.title}` : "Study chapters"}
            aria-label="Study chapters"
            onClick={() => setStudyOpen(true)}
          >
            <BookOpen aria-hidden="true" />
          </Button>
          {turns.length > 0 ? (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                title={didCopyChat ? "Chat copied" : "Copy chat for diagnosis"}
                aria-label={didCopyChat ? "Chat copied" : "Copy chat for diagnosis"}
                onClick={() => void copyConversation()}
              >
                {didCopyChat ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                title="Clear conversation"
                aria-label="Clear conversation"
                onClick={clearConversation}
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </>
          ) : null}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto bg-[radial-gradient(circle_at_50%_0%,color-mix(in_oklab,var(--primary)_5%,transparent),transparent_38%)] px-3 py-5 sm:px-4 sm:py-7">
        {turns.length === 0 ? (
          <div className="flex h-full min-h-[280px] items-center justify-center text-center">
            <div className="max-w-sm">
              <div
                className="mx-auto mb-4 size-8 rounded-full bg-primary shadow-sm shadow-primary/20"
                aria-hidden="true"
              />
              <h2 className="text-base font-semibold text-foreground">
                Ask about your library
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                AGN prioritizes your slides, cites the source, and can still
                answer beyond them when needed.
              </p>
            </div>
          </div>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-6">
            {turns.map((turn) => (
              <ChatTurnView
                key={turn.id}
                turn={turn}
                onSelectSource={selectSource}
              />
            ))}
          </div>
        )}
        <div ref={conversationEndRef} />
      </div>

      <footer className="border-t border-border bg-background/90 px-3 py-3 backdrop-blur-xl sm:px-4 sm:py-4">
        {error ? (
          <div className="mx-auto mb-3 flex max-w-3xl items-start gap-2 rounded-xl border border-destructive/25 bg-destructive/[0.07] px-3 py-2 text-sm leading-6 text-destructive">
            <AlertCircle className="mt-1 size-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : null}
        <form
          ref={chatFormRef}
          className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-border bg-card p-2 shadow-[0_8px_30px_rgb(0_0_0/0.06)] transition-[border-color,box-shadow] focus-within:border-primary/45 focus-within:shadow-[0_10px_36px_rgb(0_0_0/0.09)] dark:shadow-[0_10px_34px_rgb(0_0_0/0.2)]"
          onSubmit={handleSubmit}
        >
          <label className="sr-only" htmlFor="chat-question">
            Ask a question
          </label>
          <textarea
            id="chat-question"
            value={question}
            rows={1}
            placeholder={
              hasSources ? "Ask about your sources or anything else" : "Ask anything"
            }
            disabled={isLoading}
            className="min-h-9 max-h-32 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm leading-6 text-foreground outline-none [field-sizing:content] placeholder:text-muted-foreground disabled:opacity-60"
            onKeyDown={handleQuestionKeyDown}
            onChange={(event) => setQuestion(event.target.value)}
          />
          <Button
            type={isLoading ? "button" : "submit"}
            size="icon"
            variant={isLoading ? "secondary" : "default"}
            className="size-9 rounded-xl"
            disabled={!isLoading && !question.trim()}
            aria-label={isLoading ? "Stop generation" : "Send question"}
            onClick={isLoading ? stopGeneration : undefined}
          >
            {isLoading ? (
              <Square className="size-3.5 fill-current" aria-hidden="true" />
            ) : (
              <Send aria-hidden="true" />
            )}
          </Button>
        </form>
      </footer>
      <StudyWorkspace
        open={studyOpen}
        apiKey={settings.apiKey}
        chunks={sourceChunks}
        activeChapterId={activeChapter?.id}
        onClose={() => setStudyOpen(false)}
        onStartTest={(chapter) => {
          setActiveChapter(chapter);
          setStudyOpen(false);
          const language = sourceChunks.some((chunk) => chunk.sourceLanguage === "it") ? "Italian" : "the language of the uploaded material";
          setQuestion(`Conduct an adaptive oral exam on “${chapter.title}”. Ask exactly one substantive question now, then wait for my answer. Evaluate each answer precisely against the uploaded course sources, explain the first error or omission with citations, and adapt the next question to my weaknesses. Do not reveal answers to questions you have not asked. Conduct the entire exam in ${language}. Chapter goals: ${chapter.goals.join("; ")}.`);
          window.setTimeout(() => chatFormRef.current?.requestSubmit(), 0);
        }}
      />
    </section>
  );
}

function ChatTurnView({
  turn,
  onSelectSource,
}: {
  turn: ChatTurn;
  onSelectSource: (source: SourceChunk) => void;
}) {
  const validCitations = useMemo(
    () =>
      new Set(
        turn.sources.map((source) =>
          `${Number((source.sourceLabel ?? "Source 1").replace(/\D/g, "")) || 1}:${source.sourceSlideNumber}`,
        ),
      ),
    [turn.sources],
  );

  function selectCitation(sourceNumber: number, slideNumber: number) {
    const matchingSource = turn.sources.find(
      (source) =>
        source.sourceSlideNumber === slideNumber &&
        (source.sourceLabel ?? "Source 1") === `Source ${sourceNumber}`,
    );

    if (matchingSource) {
      onSelectSource(matchingSource);
    }
  }

  return (
    <article className="flex flex-col gap-2">
      <ChatMessage role="user" content={turn.question} />
      {turn.answer ? (
        <ChatMessage
          role="assistant"
          content={turn.answer}
          validCitations={validCitations}
          onCitationClick={selectCitation}
        />
      ) : turn.status === "streaming" ? (
        <div className="mr-auto flex items-center gap-1.5 px-1 py-2 text-sm text-muted-foreground">
          <span className="size-1.5 animate-pulse rounded-full bg-primary" />
          Thinking
        </div>
      ) : (
        <p
          className={cn(
            "mr-auto px-1 text-xs text-muted-foreground",
            turn.status === "error" && "text-destructive",
          )}
        >
          {turn.status === "stopped"
            ? "Generation stopped"
            : turn.error ?? "The model request failed before producing a response."}
        </p>
      )}
      {turn.sources.length > 0 && turn.status !== "streaming" && turn.status !== "error" ? (
        <RetrievedSources sources={turn.sources} onSelectSource={onSelectSource} />
      ) : null}
      {turn.webResults.length > 0 && turn.status !== "streaming" && turn.status !== "error" ? (
        <WebSources results={turn.webResults} />
      ) : null}
    </article>
  );
}

function WebSources({ results }: { results: WebSearchResult[] }) {
  return (
    <div className="mr-auto flex max-w-[94%] flex-wrap gap-1.5">
      {results.map((result, index) => (
        <a
          key={result.url}
          href={result.url}
          target="_blank"
          rel="noreferrer"
          className="min-w-0 max-w-full truncate rounded-full border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:bg-accent hover:text-accent-foreground"
        >
          Web {index + 1} · {result.title}
        </a>
      ))}
    </div>
  );
}

function RetrievedSources({
  sources,
  onSelectSource,
}: {
  sources: SourceChunk[];
  onSelectSource: (source: SourceChunk) => void;
}) {
  const slideSources = Array.from(
    new Map(
      sources.map((source) => [
        `${source.deckId}:${source.slideNumber}`,
        source,
      ]),
    ).values(),
  );
  const visibleSources = slideSources.slice(0, 6);
  const remainingCount = slideSources.length - visibleSources.length;

  return (
    <div className="mr-auto flex max-w-[94%] flex-wrap gap-1.5">
      {visibleSources.map((source) => (
        <button
          key={`${source.deckId}:${source.slideNumber}`}
          type="button"
          className={cn(
            "min-w-0 max-w-full rounded-full border border-border bg-card px-2.5 py-1 text-left text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:bg-accent hover:text-accent-foreground",
            "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
          )}
          onClick={() => onSelectSource(source)}
        >
          {source.sourceLabel} · Slide {source.sourceSlideNumber}
        </button>
      ))}
      {remainingCount > 0 ? (
        <span className="px-1.5 py-1 text-xs text-muted-foreground">
          +{remainingCount} more slides
        </span>
      ) : null}
    </div>
  );
}

function readStorage(key: string, fallback = ""): string {
  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    return window.localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeStoredApiKey(apiKey: string) {
  writeStorage(deepInfraApiKeyStorageKey, apiKey, deepInfraApiKeyChangedEvent);
}

function writeStoredTavilyApiKey(apiKey: string) {
  writeStorage(tavilyApiKeyStorageKey, apiKey, tavilyApiKeyChangedEvent);
}

function writeStoredTurns(turns: ChatTurn[]) {
  const completedTurns = turns
    .filter(
      (
        turn,
      ): turn is ChatTurn & {
        status: StoredChatTurn["status"];
      } => turn.status !== "streaming",
    )
    .slice(-storedTurnLimit)
    .map<StoredChatTurn>((turn) => ({
      id: turn.id,
      question: turn.question,
      answer: turn.answer,
      sourceIds: turn.sources.map((source) => source.id),
      webResults: turn.webResults,
      status: turn.status,
      error: turn.error,
      diagnostics: turn.diagnostics,
    }));
  writeStorage(
    chatHistoryStorageKey,
    JSON.stringify(completedTurns),
    chatHistoryChangedEvent,
  );
}

function writeStorage(key: string, value: string, changedEvent: string) {
  try {
    if (value) {
      window.localStorage.setItem(key, value);
    } else {
      window.localStorage.removeItem(key);
    }
    window.dispatchEvent(new Event(changedEvent));
  } catch {
    // Browser storage can be blocked; the in-memory session still works.
  }
}

function subscribeToStoredDeepInfraApiKey(onStoreChange: () => void) {
  return subscribeToStorage(
    deepInfraApiKeyStorageKey,
    deepInfraApiKeyChangedEvent,
    onStoreChange,
  );
}

function subscribeToStoredTavilyApiKey(onStoreChange: () => void) {
  return subscribeToStorage(
    tavilyApiKeyStorageKey,
    tavilyApiKeyChangedEvent,
    onStoreChange,
  );
}

function subscribeToStoredChatHistory(onStoreChange: () => void) {
  return subscribeToStorage(
    chatHistoryStorageKey,
    chatHistoryChangedEvent,
    onStoreChange,
  );
}

function subscribeToStorage(
  key: string,
  changedEvent: string,
  onStoreChange: () => void,
) {
  function handleStorage(event: StorageEvent) {
    if (event.key === key) {
      onStoreChange();
    }
  }

  window.addEventListener("storage", handleStorage);
  window.addEventListener(changedEvent, onStoreChange);
  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(changedEvent, onStoreChange);
  };
}

function parseStoredTurns(value: string, sourceChunks: SourceChunk[]): ChatTurn[] {
  try {
    const parsed = JSON.parse(value) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    const chunksById = new Map(sourceChunks.map((chunk) => [chunk.id, chunk]));

    return parsed
      .filter(isStoredChatTurn)
      .slice(-storedTurnLimit)
      .map((turn) => ({
        id: turn.id,
        question: turn.question,
        answer: turn.answer,
        sources: turn.sourceIds
          .map((sourceId) => chunksById.get(sourceId))
          .filter((source): source is SourceChunk => source !== undefined),
        webResults: turn.webResults ?? [],
        status: turn.status,
        error: turn.error,
        diagnostics: isTurnDiagnostics(turn.diagnostics)
          ? turn.diagnostics
          : createLegacyDiagnostics(turn.question),
      }));
  } catch {
    return [];
  }
}

function isStoredChatTurn(value: unknown): value is StoredChatTurn {
  if (!value || typeof value !== "object") {
    return false;
  }

  const turn = value as Partial<StoredChatTurn>;
  return (
    typeof turn.id === "string" &&
    typeof turn.question === "string" &&
    typeof turn.answer === "string" &&
    (turn.error === undefined || typeof turn.error === "string") &&
    (turn.diagnostics === undefined || isTurnDiagnostics(turn.diagnostics)) &&
    Array.isArray(turn.sourceIds) &&
    turn.sourceIds.every((sourceId) => typeof sourceId === "string") &&
    (turn.webResults === undefined ||
      (Array.isArray(turn.webResults) && turn.webResults.every(isWebSearchResult))) &&
    (turn.status === "complete" ||
      turn.status === "stopped" ||
      turn.status === "error")
  );
}

function isWebSearchResult(value: unknown): value is WebSearchResult {
  if (!value || typeof value !== "object") {
    return false;
  }

  const result = value as Partial<WebSearchResult>;
  return (
    typeof result.title === "string" &&
    typeof result.url === "string" &&
    typeof result.content === "string" &&
    typeof result.score === "number"
  );
}

function formatChatDiagnosticExport(
  turns: ChatTurn[],
  librarySources: LibrarySource[],
): string {
  const lines = [
    "# AGN chat diagnostic export",
    "",
    `Exported: ${new Date().toISOString()}`,
    `Turns: ${turns.length}`,
    `Runtime model: ${DEEPINFRA_MODEL} via DeepInfra`,
    "",
    `## Complete library catalog (${librarySources.length} sources)`,
    ...(librarySources.length > 0
      ? librarySources.map(
          (source) =>
            `- ${source.sourceLabel}: ${source.sourceTitle} | ${source.sourceMediaType} | ${source.slideCount} slide${source.slideCount === 1 ? "" : "s"} | ${source.sourcePath}`,
        )
      : ["", "(none)"]),
  ];

  turns.forEach((turn, turnIndex) => {
    lines.push(
      "",
      `## Turn ${turnIndex + 1}`,
      "",
      `Status: ${turn.status}`,
      ...(turn.error ? [`Error: ${turn.error}`] : []),
      `Harness: ${turn.diagnostics.harnessVersion} (diagnostic schema v${turn.diagnostics.version})`,
      `Route: deterministic / ${turn.diagnostics.route.retrievalMode} / web ${turn.diagnostics.route.webPolicy}`,
      `Timing: ${JSON.stringify(turn.diagnostics.timingsMs)}`,
      `Context: ${turn.diagnostics.context ? JSON.stringify(turn.diagnostics.context) : "(not recorded)"}`,
      `Web: attempted=${turn.diagnostics.web.attempted}, results=${turn.diagnostics.web.resultCount}`,
      `Adjacent expansions: ${turn.diagnostics.retrieval.expansions.length > 0 ? JSON.stringify(turn.diagnostics.retrieval.expansions) : "(none)"}`,
      ...(turn.diagnostics.error
        ? [`Error stage: ${turn.diagnostics.error.stage}`]
        : []),
      "",
      "### User",
      "",
      turn.question || "(empty)",
      "",
      "### AGN",
      "",
      turn.answer || "(no answer)",
      "",
      `### Retrieved source chunks (${turn.sources.length})`,
    );

    lines.push(
      "",
      `### Retrieval candidates (${turn.diagnostics.retrieval.candidates.length})`,
    );
    if (turn.diagnostics.retrieval.candidates.length === 0) {
      lines.push("", "(none)");
    } else {
      turn.diagnostics.retrieval.candidates.forEach((candidate) => {
        lines.push(
          `- ${candidate.chunkId} | score=${candidate.score ?? "n/a"} | selected=${candidate.selected} | terms=${candidate.matchedTerms.join(", ") || "(none)"}`,
        );
      });
    }

    if (turn.sources.length === 0) {
      lines.push("", "(none)");
    } else {
      turn.sources.forEach((source, sourceIndex) => {
        lines.push(
          "",
          `#### Chunk ${sourceIndex + 1}`,
          "",
          `- ID: ${source.id}`,
          `- Deck: ${source.deckTitle} (${source.deckId})`,
          `- Source: ${source.sourceLabel ?? "Unlabeled"} — ${source.sourceTitle}`,
          `- Original path: ${source.sourcePath}`,
          `- Media type: ${source.sourceMediaType}`,
          `- Global slide: ${source.slideNumber}`,
          `- Source-local slide: ${source.sourceSlideNumber}`,
          `- Slide title: ${source.slideTitle ?? "Untitled"}`,
          `- Heading path: ${source.headingPath?.join(" / ") || "(none)"}`,
          "",
          "Retrieved text:",
          "",
          source.text,
        );
      });
    }

    lines.push("", `### Web search results (${turn.webResults.length})`);
    if (turn.webResults.length === 0) {
      lines.push("", "(none)");
    } else {
      turn.webResults.forEach((result, resultIndex) => {
        lines.push(
          "",
          `#### Web ${resultIndex + 1}: ${result.title}`,
          "",
          `- URL: ${result.url}`,
          `- Relevance score: ${result.score}`,
          "",
          result.content,
        );
      });
    }
  });

  return `${lines.join("\n")}\n`;
}

function repairAnswerCitations(
  answer: string,
  sources: SourceChunk[],
  webResults: WebSearchResult[],
): string {
  return repairWebCitations(repairModelCitations(answer, sources), webResults);
}

function selectCatalogForRequest(
  librarySources: LibrarySource[],
  sourceChunks: SourceChunk[],
  retrievalMode: ReturnType<typeof getRetrievalMode>,
): LibrarySource[] {
  if (retrievalMode === "catalog" || retrievalMode === "overview") {
    return librarySources;
  }

  if (retrievalMode === "none") {
    return [];
  }

  const sourceLabels = new Set(
    sourceChunks
      .map((source) => source.sourceLabel)
      .filter((label): label is string => Boolean(label)),
  );
  return librarySources.filter((source) => sourceLabels.has(source.sourceLabel));
}

function elapsedMs(startedAt: number): number {
  return Math.round((performance.now() - startedAt) * 10) / 10;
}

function isTurnDiagnostics(value: unknown): value is TurnDiagnostics {
  if (!value || typeof value !== "object") {
    return false;
  }

  const diagnostic = value as Partial<TurnDiagnostics>;
  const route = diagnostic.route as Partial<TurnDiagnostics["route"]> | undefined;
  const retrieval = diagnostic.retrieval as
    | Partial<TurnDiagnostics["retrieval"]>
    | undefined;
  const web = diagnostic.web as Partial<TurnDiagnostics["web"]> | undefined;
  return (
    diagnostic.version === 1 &&
    typeof diagnostic.harnessVersion === "string" &&
    route?.kind === "deterministic" &&
    (route.retrievalMode === "none" ||
      route.retrievalMode === "catalog" ||
      route.retrievalMode === "overview" ||
      route.retrievalMode === "focused") &&
    typeof retrieval?.query === "string" &&
    Array.isArray(retrieval.candidates) &&
    Array.isArray(retrieval.selectedChunkIds) &&
    Array.isArray(retrieval.expansions) &&
    typeof web?.attempted === "boolean" &&
    typeof web.resultCount === "number" &&
    Boolean(diagnostic.timingsMs)
  );
}

function createLegacyDiagnostics(question: string): TurnDiagnostics {
  return {
    version: 1,
    harnessVersion: "legacy-uninstrumented",
    route: {
      kind: "deterministic",
      retrievalMode: getRetrievalMode(question),
      webPolicy: "never",
    },
    retrieval: {
      query: question.normalize("NFKC").trim(),
      previousEvidenceUsed: false,
      candidates: [],
      selectedChunkIds: [],
      selectedCharacters: 0,
      expansions: [],
    },
    web: { attempted: false, resultCount: 0 },
    timingsMs: {},
  };
}
