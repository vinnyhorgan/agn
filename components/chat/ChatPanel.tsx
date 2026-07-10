"use client";

import { AlertCircle, LibraryBig, Loader2, Send, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { ChatMessage } from "@/components/chat/ChatMessage";
import { ProviderSettings } from "@/components/chat/ProviderSettings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buildGroundedMessages } from "@/lib/llm/groundedPrompt";
import { repairModelCitations } from "@/lib/llm/citations";
import { createDeepInfraChatCompletionViaRoute } from "@/lib/llm/openAiCompatible";
import type { DeepInfraSettings } from "@/lib/llm/types";
import { lexicalSearch } from "@/lib/search/lexicalSearch";
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
  onSelectSlide?: (slideNumber: number) => void;
}

interface ChatTurn {
  id: string;
  question: string;
  answer?: string;
  sources: SourceChunk[];
}

const retrievalLimit = 6;
const historyLimit = 6;
const deepInfraApiKeyStorageKey = "agn.deepInfra.apiKey";
const deepInfraApiKeyChangedEvent = "agn:deepinfra-api-key-changed";
const defaultDeepInfraSettings: DeepInfraSettings = {
  apiKey: "",
};

const missingApiKeyMessage = "Add a valid DeepInfra API key before chatting.";

function readStoredDeepInfraApiKey(): string | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  try {
    return window.localStorage.getItem(deepInfraApiKeyStorageKey) ?? undefined;
  } catch {
    return undefined;
  }
}

function subscribeToStoredDeepInfraApiKey(onStoreChange: () => void) {
  function handleStorage(event: StorageEvent) {
    if (event.key === deepInfraApiKeyStorageKey) {
      onStoreChange();
    }
  }

  window.addEventListener("storage", handleStorage);
  window.addEventListener(deepInfraApiKeyChangedEvent, onStoreChange);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(deepInfraApiKeyChangedEvent, onStoreChange);
  };
}

function writeStoredDeepInfraApiKey(apiKey: string) {
  try {
    if (apiKey) {
      window.localStorage.setItem(deepInfraApiKeyStorageKey, apiKey);
    } else {
      window.localStorage.removeItem(deepInfraApiKeyStorageKey);
    }

    window.dispatchEvent(new Event(deepInfraApiKeyChangedEvent));
  } catch {
    // Keep chat usable even if the browser blocks localStorage writes.
  }
}

export function ChatPanel({
  sourceChunks,
  sourceCount,
  onSelectSource,
  onSelectSlide,
}: ChatPanelProps) {
  const storedApiKey = useSyncExternalStore(
    subscribeToStoredDeepInfraApiKey,
    () => readStoredDeepInfraApiKey() ?? defaultDeepInfraSettings.apiKey,
    () => defaultDeepInfraSettings.apiKey,
  );
  const settings = useMemo<DeepInfraSettings>(
    () => ({ apiKey: storedApiKey }),
    [storedApiKey],
  );
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const conversationEndRef = useRef<HTMLDivElement>(null);

  const hasSources = sourceChunks.length > 0;

  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({ behavior: "smooth" });
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

    const directSources = hasSources
      ? lexicalSearch(sourceChunks, trimmedQuestion, retrievalLimit).map(
          (result) => result.chunk,
        )
      : [];
    const previousSources =
      directSources.length < 3 ? (turns.at(-1)?.sources ?? []) : [];
    const sources = Array.from(
      new Map(
        [...directSources, ...previousSources].map((source) => [source.id, source]),
      ).values(),
    ).slice(0, retrievalLimit);

    setIsLoading(true);
    setError(undefined);

    try {
      const messages = buildGroundedMessages({
        question: trimmedQuestion,
        sourceChunks: sources,
        history: turns
          .filter((turn) => turn.answer)
          .slice(-historyLimit)
          .map((turn) => ({ question: turn.question, answer: turn.answer! })),
      });
      const response = await createDeepInfraChatCompletionViaRoute({
        settings,
        messages,
      });

      setTurns((currentTurns) => [
        ...currentTurns,
        {
          id: crypto.randomUUID(),
          question: trimmedQuestion,
          answer: repairModelCitations(response.content, sources),
          sources,
        },
      ]);
      setQuestion("");
    } catch (chatError) {
      setError(
        chatError instanceof Error
          ? chatError.message
          : "Could not complete the DeepInfra request.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  function selectSource(source: SourceChunk) {
    onSelectSource?.({
      deckId: source.deckId,
      slideNumber: source.slideNumber,
      chunkId: source.id,
    });
    onSelectSlide?.(source.slideNumber);
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
          <h1 className="truncate text-sm font-semibold text-zinc-50">
            Source-prioritized chat
          </h1>
          <p className="truncate text-xs text-zinc-400">
            Uploaded SIR sources get first priority.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant="outline" className="hidden border-zinc-800 text-zinc-300 sm:inline-flex">
            {sourceCount ?? 0} source{(sourceCount ?? 0) === 1 ? "" : "s"}
          </Badge>
          <ProviderSettings
            settings={settings}
            onChange={(nextSettings) =>
              writeStoredDeepInfraApiKey(nextSettings.apiKey)
            }
          />
          {turns.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              title="Clear conversation"
              aria-label="Clear conversation"
              onClick={() => setTurns([])}
            >
              <Trash2 aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
        {turns.length === 0 ? (
          <div className="flex h-full min-h-[320px] items-center justify-center text-center">
            <div className="max-w-md">
              <div className="mx-auto mb-4 flex size-10 items-center justify-center rounded-lg border border-emerald-400/20 bg-emerald-400/10 text-emerald-300">
                <LibraryBig className="size-5" aria-hidden="true" />
              </div>
              <h2 className="text-lg font-semibold text-zinc-100">
                Learn from your sources
              </h2>
              <p className="mt-2 text-sm leading-6 text-zinc-300">
                Ask naturally. AGN uses your decks first, cites supporting
                slides, and fills gaps with general knowledge.
              </p>
            </div>
          </div>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-5">
            {turns.map((turn) => (
              <ChatTurnView
                key={turn.id}
                turn={turn}
                onSelectSource={selectSource}
              />
            ))}
          </div>
        )}
        {isLoading ? (
          <div className="mx-auto mt-5 flex max-w-3xl items-center gap-2 text-sm text-zinc-500">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            AGN is thinking
          </div>
        ) : null}
        <div ref={conversationEndRef} />
      </div>

      <footer className="border-t border-zinc-800 bg-zinc-950 px-4 py-3">
        {error ? (
          <div className="mx-auto mb-3 flex max-w-3xl items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm leading-6 text-destructive">
            <AlertCircle className="mt-1 size-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : null}
        {!hasSources ? (
          <p className="mx-auto mb-2 max-w-3xl text-xs text-zinc-400">
            No sources loaded. AGN will answer from general knowledge.
          </p>
        ) : null}
        <form className="mx-auto flex max-w-3xl items-end gap-2" onSubmit={handleSubmit}>
          <label className="sr-only" htmlFor="chat-question">
            Ask a source-prioritized question
          </label>
          <textarea
            id="chat-question"
            value={question}
            rows={2}
            placeholder={
              hasSources
                ? "Ask about your sources or anything else"
                : "Ask anything"
            }
            disabled={isLoading}
            className="max-h-36 min-h-14 flex-1 resize-none rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm leading-6 text-zinc-100 outline-none transition-colors placeholder:text-zinc-500 focus-visible:border-zinc-600 focus-visible:ring-3 focus-visible:ring-zinc-700/50 disabled:pointer-events-none disabled:opacity-50"
            onKeyDown={handleQuestionKeyDown}
            onChange={(event) => setQuestion(event.target.value)}
          />
          <Button
            type="submit"
            size="icon-lg"
            disabled={isLoading || !question.trim()}
            aria-label="Send question"
          >
            {isLoading ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <Send aria-hidden="true" />
            )}
          </Button>
        </form>
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
      ) : null}
      {turn.sources.length > 0 ? (
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
  return (
    <div className="mr-auto flex max-w-[86%] flex-wrap gap-2">
      {sources.map((source) => (
        <button
          key={source.id}
          type="button"
          className={cn(
            "min-w-0 max-w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-left text-xs transition-colors hover:border-zinc-600 hover:bg-zinc-800",
            "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
          )}
          onClick={() => onSelectSource(source)}
        >
          <span className="block truncate font-medium text-zinc-200">
            {source.sourceLabel ? `${source.sourceLabel} · ` : ""}
            {source.deckTitle}
          </span>
          <span className="mt-0.5 block truncate text-zinc-500">
            Slide {source.slideNumber}
            {source.slideTitle ? ` · ${source.slideTitle}` : ""}
          </span>
        </button>
      ))}
    </div>
  );
}
