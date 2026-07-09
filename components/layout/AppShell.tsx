"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { ChatPanel } from "@/components/chat/ChatPanel";
import { SourcePreview } from "@/components/sources/SourcePreview";
import { SourceSidebar } from "@/components/sources/SourceSidebar";
import type { BrowserSirDeck, SelectedSource } from "@/components/sources/types";
import { chunkSlides } from "@/lib/search/chunkSlides";
import { lexicalSearch } from "@/lib/search/lexicalSearch";
import { readSirImageObjectUrls } from "@/lib/sir/readSirImages";
import { parseSirFile } from "@/lib/sir/importSir";
import type { SirValidationError } from "@/lib/sir/types";
import { validateSirFile } from "@/lib/sir/validateSir";

export function AppShell() {
  const objectUrlsRef = useRef<string[]>([]);
  const [decks, setDecks] = useState<BrowserSirDeck[]>([]);
  const [selectedSource, setSelectedSource] = useState<SelectedSource>();
  const [searchQuery, setSearchQuery] = useState("");
  const [errors, setErrors] = useState<SirValidationError[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const sourceChunks = useMemo(
    () =>
      decks.flatMap((deck) =>
        chunkSlides(deck, {
          deckId: deck.id,
          sourceLabel: decks.length > 1 ? deck.sourceLabel : undefined,
        }),
      ),
    [decks],
  );
  const searchResults = useMemo(
    () => lexicalSearch(sourceChunks, searchQuery, sourceChunks.length),
    [sourceChunks, searchQuery],
  );
  const topSearchResults = searchResults.slice(0, 12);

  useEffect(() => {
    const objectUrls = objectUrlsRef.current;

    return () => {
      revokeObjectUrls(objectUrls);
    };
  }, []);

  async function handleUploadFiles(files: FileList | null) {
    const selectedFiles = Array.from(files ?? []);

    if (selectedFiles.length === 0) {
      return;
    }

    setIsLoading(true);
    setErrors([]);

    const nextDecks: Omit<BrowserSirDeck, "sourceLabel">[] = [];
    const nextErrors: SirValidationError[] = [];
    const nextObjectUrls: string[] = [];

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

        const parsed = await parseSirFile(input);
        const imageUrlsBySlideNumber = await readSirImageObjectUrls(
          input,
          parsed.imagePaths,
        );
        const imageUrls = Object.values(imageUrlsBySlideNumber);
        nextObjectUrls.push(...imageUrls);
        nextDecks.push({
          ...parsed,
          id: crypto.randomUUID(),
          fileName: file.name,
          imageUrlsBySlideNumber,
        });
      }

      if (nextDecks.length > 0) {
        objectUrlsRef.current.push(...nextObjectUrls);
        setDecks((currentDecks) => {
          const offset = currentDecks.length;
          return [
            ...currentDecks,
            ...nextDecks.map((deck, index) => ({
              ...deck,
              sourceLabel: `Source ${offset + index + 1}`,
            })),
          ];
        });
        setSelectedSource((currentSelection) => {
          if (currentSelection) {
            return currentSelection;
          }

          const firstDeck = nextDecks[0];
          const firstSlideNumber = firstDeck?.slides[0]?.slideNumber;

          if (!firstDeck || firstSlideNumber === undefined) {
            return currentSelection;
          }

          return {
            deckId: firstDeck.id,
            slideNumber: firstSlideNumber,
          };
        });
      }

      setErrors(nextErrors);
    } catch (error) {
      revokeObjectUrls(nextObjectUrls);
      setErrors([
        {
          code: "sir_read_failed",
          message:
            error instanceof Error
              ? error.message
              : "Could not read and parse the selected SIR file.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="dark grid h-dvh min-h-0 grid-cols-[minmax(280px,320px)_minmax(0,1fr)_minmax(300px,360px)] overflow-hidden bg-zinc-950 text-zinc-50">
      <SourceSidebar
        decks={decks}
        errors={errors}
        isLoading={isLoading}
        searchQuery={searchQuery}
        searchResultCount={searchResults.length}
        searchResults={topSearchResults}
        selectedSource={selectedSource}
        onUploadFiles={handleUploadFiles}
        onSearchQueryChange={setSearchQuery}
        onSelectSource={setSelectedSource}
      />
      <ChatPanel
        sourceChunks={sourceChunks}
        sourceCount={decks.length}
        onSelectSource={setSelectedSource}
      />
      <SourcePreview
        decks={decks}
        sourceChunks={sourceChunks}
        selectedSource={selectedSource}
        onSelectSource={setSelectedSource}
      />
    </main>
  );
}

function revokeObjectUrls(objectUrls: string[]) {
  for (const objectUrl of objectUrls) {
    URL.revokeObjectURL(objectUrl);
  }
}
