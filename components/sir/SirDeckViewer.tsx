import type { ParsedSirFile } from "@/lib/sir/types";

import { SlideViewer } from "@/components/sir/SlideViewer";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export interface BrowserSirDeck extends ParsedSirFile {
  fileName: string;
  imageUrlsBySlideNumber: Record<number, string>;
}

interface SirDeckViewerProps {
  deck: BrowserSirDeck | null;
  isLoading: boolean;
  selectedSlideNumber: number;
}

export function SirDeckViewer({
  deck,
  isLoading,
  selectedSlideNumber,
}: SirDeckViewerProps) {
  if (isLoading) {
    return (
      <Card className="min-h-[560px] rounded-lg bg-white">
        <CardContent className="flex min-h-[560px] items-center justify-center">
          <p className="text-sm text-zinc-600">Validating and parsing deck...</p>
        </CardContent>
      </Card>
    );
  }

  if (!deck) {
    return (
      <Card className="min-h-[560px] rounded-lg border-dashed bg-white">
        <CardContent className="flex min-h-[560px] items-center justify-center p-8 text-center">
          <div className="max-w-md">
            <h2 className="text-lg font-semibold text-zinc-950">
              No SIR deck loaded
            </h2>
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              Choose a local .sir file to validate the archive, parse sir.md,
              and preview its slide Markdown with matching images.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const selectedSlide =
    deck.slides.find((slide) => slide.slideNumber === selectedSlideNumber) ??
    deck.slides[0];
  const imageUrl = selectedSlide
    ? deck.imageUrlsBySlideNumber[selectedSlide.slideNumber]
    : undefined;

  return (
    <Card className="min-h-[560px] rounded-lg bg-white">
      <CardHeader className="border-b border-zinc-200">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="text-xl">{deck.manifest.title}</CardTitle>
            <CardDescription className="mt-1">
              {deck.fileName}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{deck.manifest.language}</Badge>
            <Badge variant="outline">
              {deck.manifest.slide_count} slide
              {deck.manifest.slide_count === 1 ? "" : "s"}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        {selectedSlide ? (
          <SlideViewer slide={selectedSlide} imageUrl={imageUrl} />
        ) : (
          <p className="p-8 text-center text-sm text-zinc-600">
            This deck has no parsed slides.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
