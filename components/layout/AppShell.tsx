"use client";

import { BookOpen, MessageSquareText, PanelLeft } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ChatPanel } from "@/components/chat/ChatPanel";
import { SourcePreview } from "@/components/sources/SourcePreview";
import { SourceSidebar } from "@/components/sources/SourceSidebar";
import type { BrowserSirDeck, SelectedSource } from "@/components/sources/types";
import { Button } from "@/components/ui/button";
import { chunkSlides } from "@/lib/search/chunkSlides";
import { lexicalSearch } from "@/lib/search/lexicalSearch";
import type { SearchResult } from "@/lib/search/types";
import { parseSirFile } from "@/lib/sir/importSir";
import { readSirImageObjectUrl } from "@/lib/sir/readSirImages";
import type { SirValidationError } from "@/lib/sir/types";
import { validateSirFile } from "@/lib/sir/validateSir";
import {
  deleteStoredSirDeck,
  hashSirArchive,
  listStoredSirDecks,
  storeSirDeck,
  type StoredSirDeck,
} from "@/lib/storage/sirDeckStore";
import { cn } from "@/lib/utils";

type MobilePane = "sources" | "chat" | "preview";
const slidePositionStorageKey = "agn.library.slide-positions";

export function AppShell() {
  const objectUrlsRef = useRef<string[]>([]);
  const imageLoadPromisesRef = useRef(new Map<string, Promise<string>>());
  const [decks, setDecks] = useState<BrowserSirDeck[]>([]);
  const [selectedSource, setSelectedSource] = useState<SelectedSource>();
  const [lastViewedSlideByDeckId, setLastViewedSlideByDeckId] = useState<
    Record<string, number>
  >({});
  const [searchQuery, setSearchQuery] = useState("");
  const [errors, setErrors] = useState<SirValidationError[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [mobilePane, setMobilePane] = useState<MobilePane>("chat");

  const sourceChunks = useMemo(
    () =>
      decks.flatMap((deck) =>
        chunkSlides(deck, {
          deckId: deck.id,
          sourceLabel: deck.sourceLabel,
        }),
      ),
    [decks],
  );
  const searchResults = useMemo(
    () =>
      deduplicateSlideResults(
        lexicalSearch(sourceChunks, searchQuery, sourceChunks.length),
      ),
    [sourceChunks, searchQuery],
  );
  const topSearchResults = searchResults.slice(0, 12);

  useEffect(() => {
    let cancelled = false;

    async function restoreLibrary() {
      const restoredDecks: BrowserSirDeck[] = [];
      const restoreErrors: SirValidationError[] = [];

      try {
        const storedDecks = await listStoredSirDecks();

        for (const storedDeck of storedDecks) {
          try {
            const deck = await createBrowserDeck(storedDeck.data, storedDeck);
            restoredDecks.push(deck);
            if (!storedDeck.parsed) {
              await storeSirDeck({
                ...storedDeck,
                parsed: toParsedSirFile(deck),
              });
            }
          } catch {
            restoreErrors.push({
              code: "stored_sir_read_failed",
              message: "A saved SIR file could not be restored and was skipped.",
              path: storedDeck.fileName,
            });
          }
        }

        if (cancelled) {
          return;
        }

        setDecks(restoredDecks);
        setErrors(restoreErrors);
        const storedPositions = readSlidePositions();
        const restoredPositions = Object.fromEntries(
          restoredDecks.map((deck) => {
            const storedSlide = storedPositions[deck.id];
            const slideNumber = deck.slides.some(
              (slide) => slide.slideNumber === storedSlide,
            )
              ? storedSlide
              : (deck.slides[0]?.slideNumber ?? 1);
            return [deck.id, slideNumber];
          }),
        );
        setLastViewedSlideByDeckId(restoredPositions);
        writeSlidePositions(restoredPositions);

        const firstDeck = restoredDecks[0];
        if (firstDeck) {
          setSelectedSource({
            deckId: firstDeck.id,
            slideNumber:
              restoredPositions[firstDeck.id] ??
              firstDeck.slides[0]?.slideNumber ??
              1,
          });
        }
      } catch {
        if (!cancelled) {
          setErrors([
            {
              code: "local_library_unavailable",
              message: "The local SIR library could not be opened.",
            },
          ]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void restoreLibrary();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => revokeObjectUrls(objectUrlsRef.current);
  }, []);

  async function handleUploadFiles(files: FileList | null) {
    const selectedFiles = Array.from(files ?? []);

    if (selectedFiles.length === 0) {
      return;
    }

    setIsLoading(true);
    setErrors([]);

    const nextDecks: BrowserSirDeck[] = [];
    const nextErrors: SirValidationError[] = [];
    const knownHashes = new Set(decks.map((deck) => deck.contentHash));
    let nextSourceNumber = getNextSourceNumber(decks);

    try {
      for (const file of selectedFiles) {
        if (!file.name.toLowerCase().endsWith(".sir")) {
          nextErrors.push({
            code: "invalid_file_extension",
            message: "Choose a .sir file.",
            path: file.name,
          });
          continue;
        }

        const input = await file.arrayBuffer();
        const contentHash = await hashSirArchive(input);

        if (knownHashes.has(contentHash)) {
          nextErrors.push({
            code: "duplicate_sir_file",
            message: "This exact SIR file is already in your library.",
            path: file.name,
          });
          continue;
        }

        const validation = await validateSirFile(input);

        if (!validation.valid) {
          nextErrors.push(
            ...validation.errors.map((error) => ({
              ...error,
              path: error.path ? `${file.name}/${error.path}` : file.name,
            })),
          );
          continue;
        }

        const storedDeck: StoredSirDeck = {
          id: crypto.randomUUID(),
          sourceLabel: `Source ${nextSourceNumber}`,
          fileName: file.name,
          contentHash,
          uploadedAt: Date.now() + nextDecks.length,
          data: input,
        };
        const deck = await createBrowserDeck(input, storedDeck, validation);

        await storeSirDeck({ ...storedDeck, parsed: toParsedSirFile(deck) });
        nextDecks.push(deck);
        knownHashes.add(contentHash);
        nextSourceNumber += deck.sources.length;
      }

      if (nextDecks.length > 0) {
        setDecks((currentDecks) => [...currentDecks, ...nextDecks]);
        const nextPositions = {
          ...lastViewedSlideByDeckId,
          ...Object.fromEntries(
            nextDecks.map((deck) => [deck.id, deck.slides[0]?.slideNumber ?? 1]),
          ),
        };
        setLastViewedSlideByDeckId(nextPositions);
        writeSlidePositions(nextPositions);
        setSelectedSource((currentSelection) =>
          currentSelection ?? {
            deckId: nextDecks[0]!.id,
            slideNumber: nextDecks[0]!.slides[0]?.slideNumber ?? 1,
          },
        );
      }

      setErrors(nextErrors);
    } catch (error) {
      setErrors([
        {
          code: "sir_read_failed",
          message:
            error instanceof Error
              ? error.message
              : "Could not save the selected SIR file.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRemoveDeck(deckId: string) {
    const deck = decks.find((candidate) => candidate.id === deckId);

    if (!deck) {
      return;
    }

    try {
      await deleteStoredSirDeck(deckId);
      const deckUrls = Object.values(deck.imageUrlsBySlideNumber);
      revokeObjectUrls(deckUrls);
      objectUrlsRef.current = objectUrlsRef.current.filter(
        (objectUrl) => !deckUrls.includes(objectUrl),
      );

      const remainingDecks = decks.filter((candidate) => candidate.id !== deckId);
      setDecks(remainingDecks);
      const nextPositions = { ...lastViewedSlideByDeckId };
      delete nextPositions[deckId];
      setLastViewedSlideByDeckId(nextPositions);
      writeSlidePositions(nextPositions);

      if (selectedSource?.deckId === deckId) {
        const nextDeck = remainingDecks[0];
        setSelectedSource(
          nextDeck
            ? {
                deckId: nextDeck.id,
                slideNumber:
                  lastViewedSlideByDeckId[nextDeck.id] ??
                  nextDeck.slides[0]?.slideNumber ??
                  1,
              }
            : undefined,
        );
      }
    } catch {
      setErrors([
        {
          code: "source_remove_failed",
          message: "The source could not be removed from local storage.",
          path: deck.fileName,
        },
      ]);
    }
  }

  function selectSource(source: SelectedSource) {
    setSelectedSource(source);
    const nextPositions = {
      ...lastViewedSlideByDeckId,
      [source.deckId]: source.slideNumber,
    };
    setLastViewedSlideByDeckId(nextPositions);
    writeSlidePositions(nextPositions);
    setMobilePane("preview");
  }

  const loadSlideImage = useCallback(
    async (deckId: string, slideNumber: number) => {
      const deck = decks.find((candidate) => candidate.id === deckId);

      if (!deck || deck.imageUrlsBySlideNumber[slideNumber]) {
        return;
      }

      const cacheKey = `${deckId}:${slideNumber}`;
      let pending = imageLoadPromisesRef.current.get(cacheKey);

      if (!pending) {
        const imagePath = deck.imagePaths[slideNumber - 1];
        if (!imagePath) {
          return;
        }
        pending = readSirImageObjectUrl(deck.archiveData, imagePath);
        imageLoadPromisesRef.current.set(cacheKey, pending);
      }

      try {
        const objectUrl = await pending;
        objectUrlsRef.current.push(objectUrl);
        setDecks((currentDecks) =>
          currentDecks.map((candidate) =>
            candidate.id === deckId
              ? {
                  ...candidate,
                  imageUrlsBySlideNumber: {
                    ...candidate.imageUrlsBySlideNumber,
                    [slideNumber]: objectUrl,
                  },
                }
              : candidate,
          ),
        );
      } catch {
        setErrors([
          {
            code: "slide_image_read_failed",
            message: `Slide ${slideNumber} could not be loaded.`,
            path: deck.fileName,
          },
        ]);
      } finally {
        imageLoadPromisesRef.current.delete(cacheKey);
      }
    },
    [decks],
  );

  return (
    <main className="relative grid h-dvh min-h-0 grid-cols-1 grid-rows-[minmax(0,1fr)] overflow-hidden bg-background pb-14 text-foreground lg:grid-cols-[minmax(260px,300px)_minmax(0,1fr)_minmax(300px,360px)] lg:pb-0 xl:grid-cols-[minmax(280px,320px)_minmax(0,1fr)_minmax(320px,380px)]">
      <div className={cn("h-full min-h-0 overflow-hidden", mobilePane !== "sources" && "hidden", "lg:block")}>
        <SourceSidebar
          decks={decks}
          errors={errors}
          isLoading={isLoading}
          searchQuery={searchQuery}
          searchResultCount={searchResults.length}
          searchResults={topSearchResults}
          selectedSource={selectedSource}
          lastViewedSlideByDeckId={lastViewedSlideByDeckId}
          onUploadFiles={handleUploadFiles}
          onRemoveDeck={handleRemoveDeck}
          onSearchQueryChange={setSearchQuery}
          onSelectSource={selectSource}
        />
      </div>
      <div className={cn("h-full min-h-0 overflow-hidden", mobilePane !== "chat" && "hidden", "lg:block")}>
        <ChatPanel
          sourceChunks={sourceChunks}
          sourceCount={decks.reduce(
            (count, deck) => count + deck.sources.length,
            0,
          )}
          onSelectSource={selectSource}
        />
      </div>
      <div className={cn("h-full min-h-0 overflow-hidden", mobilePane !== "preview" && "hidden", "lg:block")}>
        <SourcePreview
          decks={decks}
          sourceChunks={sourceChunks}
          selectedSource={selectedSource}
          onLoadSlideImage={loadSlideImage}
          onSelectSource={selectSource}
        />
      </div>
      <MobileNavigation activePane={mobilePane} onChange={setMobilePane} />
    </main>
  );
}

async function createBrowserDeck(
  input: ArrayBuffer,
  storedDeck: Pick<
    StoredSirDeck,
    "id" | "sourceLabel" | "fileName" | "contentHash" | "parsed"
  >,
  knownValidation?: Extract<
    Awaited<ReturnType<typeof validateSirFile>>,
    { valid: true }
  >,
): Promise<BrowserSirDeck> {
  const parsed = storedDeck.parsed
    ? storedDeck.parsed
    : await parseSirFile(input, knownValidation);
  return {
    ...parsed,
    id: storedDeck.id,
    sourceLabel: storedDeck.sourceLabel,
    fileName: storedDeck.fileName,
    contentHash: storedDeck.contentHash,
    archiveData: input,
    imageUrlsBySlideNumber: {},
  };
}

function toParsedSirFile(deck: BrowserSirDeck) {
  return {
    manifest: deck.manifest,
    sources: deck.sources,
    slides: deck.slides,
    imagePaths: deck.imagePaths,
  };
}

function deduplicateSlideResults(results: SearchResult[]): SearchResult[] {
  const seenSlides = new Set<string>();

  return results.filter((result) => {
    const slideId = `${result.chunk.deckId}:${result.chunk.slideNumber}`;

    if (seenSlides.has(slideId)) {
      return false;
    }

    seenSlides.add(slideId);
    return true;
  });
}

function getNextSourceNumber(decks: BrowserSirDeck[]): number {
  return (
    Math.max(
      0,
      ...decks.map(
        (deck) =>
          Number(deck.sourceLabel.match(/\d+/)?.[0] ?? 0) +
          deck.sources.length -
          1,
      ),
    ) + 1
  );
}

function MobileNavigation({
  activePane,
  onChange,
}: {
  activePane: MobilePane;
  onChange: (pane: MobilePane) => void;
}) {
  const items = [
    { pane: "sources" as const, label: "Sources", icon: PanelLeft },
    { pane: "chat" as const, label: "Chat", icon: MessageSquareText },
    { pane: "preview" as const, label: "Preview", icon: BookOpen },
  ];

  return (
    <nav className="absolute inset-x-0 bottom-0 z-30 grid h-14 grid-cols-3 border-t border-border bg-background/90 px-2 shadow-[0_-8px_30px_rgb(0_0_0/0.06)] backdrop-blur-xl lg:hidden">
      {items.map(({ pane, label, icon: Icon }) => (
        <Button
          key={pane}
          type="button"
          variant="ghost"
          className={cn(
            "h-full rounded-none text-xs text-muted-foreground",
            activePane === pane && "text-primary",
          )}
          onClick={() => onChange(pane)}
        >
          <Icon aria-hidden="true" />
          {label}
        </Button>
      ))}
    </nav>
  );
}

function revokeObjectUrls(objectUrls: string[]) {
  for (const objectUrl of objectUrls) {
    URL.revokeObjectURL(objectUrl);
  }
}

function readSlidePositions(): Record<string, number> {
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(slidePositionStorageKey) ?? "{}",
    ) as unknown;

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, number] =>
          typeof entry[1] === "number" && Number.isInteger(entry[1]),
      ),
    );
  } catch {
    return {};
  }
}

function writeSlidePositions(positions: Record<string, number>) {
  try {
    window.localStorage.setItem(
      slidePositionStorageKey,
      JSON.stringify(positions),
    );
  } catch {
    // The deck library still works when browser storage is unavailable.
  }
}
