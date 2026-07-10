"use client";

import { AlertCircle, Send, Square, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { ChatMessage } from "@/components/chat/ChatMessage";
import { ProviderSettings } from "@/components/chat/ProviderSettings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { repairModelCitations } from "@/lib/llm/citations";
import { buildGroundedMessages } from "@/lib/llm/groundedPrompt";
import { streamDeepInfraChatCompletionViaRoute } from "@/lib/llm/openAiCompatible";
import type { DeepInfraSettings } from "@/lib/llm/types";
import { retrieveSourceChunks } from "@/lib/search/retrieveSources";
import type { SourceChunk } from "@/lib/search/types";
import { cn } from "@/lib/utils";

interface ChatPanelProps {
  sourceChunks: SourceChunk[];
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
  status: ChatTurnStatus;
}

interface StoredChatTurn {
  id: string;
  question: string;
  answer: string;
  sourceIds: string[];
  status: Exclude<ChatTurnStatus, "streaming">;
}

const historyLimit = 6;
const storedTurnLimit = 40;
const deepInfraApiKeyStorageKey = "agn.deepInfra.apiKey";
const deepInfraApiKeyChangedEvent = "agn:deepinfra-api-key-changed";
const chatHistoryStorageKey = "agn.chat.history";
const chatHistoryChangedEvent = "agn:chat-history-changed";
const missingApiKeyMessage = "Add a valid DeepInfra API key before chatting.";

export function ChatPanel({
  sourceChunks,
  sourceCount,
  onSelectSource,
}: ChatPanelProps) {
  const storedApiKey = useSyncExternalStore(
    subscribeToStoredDeepInfraApiKey,
    () => readStorage(deepInfraApiKeyStorageKey),
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
  const abortControllerRef = useRef<AbortController | undefined>(undefined);
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

    const currentTurns = turns;
    const sources = retrieveSourceChunks({
      chunks: sourceChunks,
      query: trimmedQuestion,
      previousSources: currentTurns.at(-1)?.sources,
    });
    const pendingTurn: ChatTurn = {
      id: crypto.randomUUID(),
      question: trimmedQuestion,
      answer: "",
      sources,
      status: "streaming",
    };
    const nextTurns = [...currentTurns, pendingTurn];
    const abortController = new AbortController();
    let streamedAnswer = "";

    abortControllerRef.current = abortController;
    setSessionTurns(nextTurns);
    setQuestion("");
    setIsLoading(true);
    setError(undefined);

    try {
      const messages = buildGroundedMessages({
        question: trimmedQuestion,
        sourceChunks: sources,
        history: currentTurns
          .filter((turn) => turn.answer && turn.status !== "error")
          .slice(-historyLimit)
          .map((turn) => ({ question: turn.question, answer: turn.answer })),
      });
      const response = await streamDeepInfraChatCompletionViaRoute({
        settings,
        messages,
        signal: abortController.signal,
        onDelta(delta) {
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
        answer: repairModelCitations(response.content, sources),
        status: "complete",
      };
      const completedTurns = [...currentTurns, completedTurn];
      setSessionTurns(completedTurns);
      writeStoredTurns(completedTurns);
    } catch (chatError) {
      const wasStopped = abortController.signal.aborted;
      const interruptedTurn: ChatTurn = {
        ...pendingTurn,
        answer: repairModelCitations(streamedAnswer, sources),
        status: wasStopped ? "stopped" : "error",
      };
      const interruptedTurns = [...currentTurns, interruptedTurn];
      setSessionTurns(interruptedTurns);
      writeStoredTurns(interruptedTurns);

      if (!wasStopped) {
        setError(
          chatError instanceof Error
            ? chatError.message
            : "Could not complete the DeepInfra request.",
        );
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
    <section className="flex h-full min-h-0 flex-col bg-zinc-950">
      <header className="flex min-h-14 items-center justify-between gap-2 border-b border-zinc-800 px-3 sm:gap-3 sm:px-4">
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold text-zinc-50">Chat</h1>
          <p className="truncate text-xs text-zinc-500">
            Sources are used first when relevant
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge
            variant="outline"
            className="hidden border-zinc-800 text-zinc-400 sm:inline-flex"
          >
            {sourceCount ?? 0} source{(sourceCount ?? 0) === 1 ? "" : "s"}
          </Badge>
          <ProviderSettings
            settings={settings}
            onChange={(nextSettings) =>
              writeStoredApiKey(nextSettings.apiKey)
            }
          />
          {turns.length > 0 ? (
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
          ) : null}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-5 sm:px-4">
        {turns.length === 0 ? (
          <div className="flex h-full min-h-[280px] items-center justify-center text-center">
            <div className="max-w-sm">
              <h2 className="text-base font-semibold text-zinc-100">
                Ask about your library
              </h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
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

      <footer className="border-t border-zinc-800 bg-zinc-950 px-3 py-3 sm:px-4">
        {error ? (
          <div className="mx-auto mb-3 flex max-w-3xl items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm leading-6 text-destructive">
            <AlertCircle className="mt-1 size-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : null}
        <form
          className="mx-auto flex max-w-3xl items-end gap-2 rounded-lg border border-zinc-700 bg-zinc-900 p-1.5 shadow-sm focus-within:border-zinc-500"
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
            className="min-h-9 max-h-32 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm leading-6 text-zinc-100 outline-none [field-sizing:content] placeholder:text-zinc-500 disabled:opacity-60"
            onKeyDown={handleQuestionKeyDown}
            onChange={(event) => setQuestion(event.target.value)}
          />
          <Button
            type={isLoading ? "button" : "submit"}
            size="icon"
            variant={isLoading ? "secondary" : "default"}
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
        <p className="mx-auto mt-1.5 max-w-3xl px-1 text-[11px] text-zinc-600">
          {hasSources
            ? "Uploaded sources stay in this browser."
            : "Upload a SIR source for slide-aware answers."}
        </p>
      </footer>
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
          `${Number((source.sourceLabel ?? "Source 1").replace(/\D/g, "")) || 1}:${source.slideNumber}`,
        ),
      ),
    [turn.sources],
  );

  function selectCitation(sourceNumber: number, slideNumber: number) {
    const matchingSource = turn.sources.find(
      (source) =>
        source.slideNumber === slideNumber &&
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
        <div className="mr-auto flex items-center gap-1.5 px-1 py-2 text-sm text-zinc-500">
          <span className="size-1.5 animate-pulse rounded-full bg-zinc-500" />
          Thinking
        </div>
      ) : (
        <p className="mr-auto px-1 text-xs text-zinc-600">
          {turn.status === "stopped" ? "Generation stopped" : "No response received"}
        </p>
      )}
      {turn.sources.length > 0 && turn.status !== "streaming" ? (
        <RetrievedSources sources={turn.sources} onSelectSource={onSelectSource} />
      ) : null}
    </article>
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
            "min-w-0 max-w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 text-left text-xs text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-200",
            "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
          )}
          onClick={() => onSelectSource(source)}
        >
          {source.sourceLabel} · Slide {source.slideNumber}
        </button>
      ))}
      {remainingCount > 0 ? (
        <span className="px-1.5 py-1 text-xs text-zinc-600">
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
      status: turn.status,
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
        status: turn.status,
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
    Array.isArray(turn.sourceIds) &&
    turn.sourceIds.every((sourceId) => typeof sourceId === "string") &&
    (turn.status === "complete" ||
      turn.status === "stopped" ||
      turn.status === "error")
  );
}
