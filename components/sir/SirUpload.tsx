"use client";

import { Loader2, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { SourceSearch } from "@/components/search/SourceSearch";
import { SirDeckViewer, type BrowserSirDeck } from "@/components/sir/SirDeckViewer";
import { SlideList } from "@/components/sir/SlideList";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { chunkSlides } from "@/lib/search/chunkSlides";
import { lexicalSearch } from "@/lib/search/lexicalSearch";
import { readSirImageObjectUrls } from "@/lib/sir/readSirImages";
import type { SirValidationError } from "@/lib/sir/types";
import { parseSirFile } from "@/lib/sir/importSir";
import { validateSirFile } from "@/lib/sir/validateSir";

export function SirUpload() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const objectUrlsRef = useRef<string[]>([]);
  const [deck, setDeck] = useState<BrowserSirDeck | null>(null);
  const [selectedSlideNumber, setSelectedSlideNumber] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [errors, setErrors] = useState<SirValidationError[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const sourceChunks = useMemo(() => (deck ? chunkSlides(deck) : []), [deck]);
  const searchResults = useMemo(
    () => lexicalSearch(sourceChunks, searchQuery, sourceChunks.length),
    [sourceChunks, searchQuery],
  );
  const topSearchResults = searchResults.slice(0, 10);

  useEffect(() => {
    return () => {
      revokeCurrentObjectUrls(objectUrlsRef.current);
    };
  }, []);

  function replaceDeck(nextDeck: BrowserSirDeck | null) {
    revokeCurrentObjectUrls(objectUrlsRef.current);
    objectUrlsRef.current = nextDeck
      ? Object.values(nextDeck.imageUrlsBySlideNumber)
      : [];
    setDeck(nextDeck);
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setIsLoading(true);
    setErrors([]);
    setSearchQuery("");
    replaceDeck(null);

    try {
      if (!file.name.toLowerCase().endsWith(".sir")) {
        setErrors([
          {
            code: "invalid_file_extension",
            message: "Choose a .sir file.",
            path: file.name,
          },
        ]);
        return;
      }

      const input = await file.arrayBuffer();
      const validation = await validateSirFile(input);

      if (!validation.valid) {
        setErrors(validation.errors);
        return;
      }

      const parsed = await parseSirFile(input);
      const imageUrlsBySlideNumber = await readSirImageObjectUrls(
        input,
        parsed.imagePaths,
      );

      const nextDeck: BrowserSirDeck = {
        ...parsed,
        fileName: file.name,
        imageUrlsBySlideNumber,
      };

      replaceDeck(nextDeck);
      setSelectedSlideNumber(parsed.slides[0]?.slideNumber ?? 1);
    } catch (error) {
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
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  return (
    <div className="grid flex-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="flex min-h-0 flex-col gap-4">
        <Card className="rounded-lg bg-white">
          <CardHeader>
            <CardTitle>Upload SIR</CardTitle>
            <CardDescription>
              Validation and parsing run locally in this browser session.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Input
              ref={fileInputRef}
              type="file"
              accept=".sir"
              disabled={isLoading}
              onChange={handleFileChange}
            />
            <div className="flex items-center justify-between gap-3">
              <Badge variant="outline">.sir only</Badge>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isLoading}
                onClick={() => fileInputRef.current?.click()}
              >
                {isLoading ? (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                ) : (
                  <Upload aria-hidden="true" />
                )}
                Choose file
              </Button>
            </div>
          </CardContent>
        </Card>

        {errors.length > 0 ? <ValidationIssues errors={errors} /> : null}

        {deck ? (
          <>
            <SourceSearch
              query={searchQuery}
              resultCount={searchResults.length}
              results={topSearchResults}
              selectedSlideNumber={selectedSlideNumber}
              onQueryChange={setSearchQuery}
              onSelectSlide={setSelectedSlideNumber}
            />
            <SlideList
              slides={deck.slides}
              selectedSlideNumber={selectedSlideNumber}
              onSelectSlide={setSelectedSlideNumber}
            />
          </>
        ) : null}
      </aside>

      <SirDeckViewer
        deck={deck}
        isLoading={isLoading}
        selectedSlideNumber={selectedSlideNumber}
      />
    </div>
  );
}

function ValidationIssues({ errors }: { errors: SirValidationError[] }) {
  return (
    <Card className="rounded-lg border-destructive/30 bg-white">
      <CardHeader>
        <CardTitle className="text-destructive">Validation issues</CardTitle>
        <CardDescription>
          The selected archive was not loaded because it failed validation.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2 text-sm leading-6">
          {errors.map((error, index) => (
            <li key={`${error.code}-${error.path ?? "archive"}-${index}`}>
              <span className="font-medium text-zinc-950">
                {error.path ? `${error.path}: ` : null}
              </span>
              <span className="text-zinc-700">{error.message}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function revokeCurrentObjectUrls(objectUrls: string[]) {
  for (const objectUrl of objectUrls) {
    URL.revokeObjectURL(objectUrl);
  }
}
