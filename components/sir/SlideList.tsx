import type { ParsedSirSlide } from "@/lib/sir/types";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface SlideListProps {
  slides: ParsedSirSlide[];
  selectedSlideNumber: number;
  onSelectSlide: (slideNumber: number) => void;
}

export function SlideList({
  slides,
  selectedSlideNumber,
  onSelectSlide,
}: SlideListProps) {
  return (
    <Card className="min-h-0 rounded-lg bg-white">
      <CardHeader>
        <CardTitle>Slides</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[420px] pr-3">
          <div className="flex flex-col gap-2">
            {slides.map((slide) => {
              const isSelected = slide.slideNumber === selectedSlideNumber;

              return (
                <Button
                  key={slide.slideNumber}
                  type="button"
                  variant={isSelected ? "default" : "ghost"}
                  className={cn(
                    "h-auto w-full justify-start whitespace-normal px-3 py-2 text-left",
                    !isSelected && "text-zinc-700",
                  )}
                  onClick={() => onSelectSlide(slide.slideNumber)}
                >
                  <span className="flex min-w-0 flex-col items-start gap-0.5">
                    <span className="text-xs font-medium opacity-70">
                      Slide {slide.slideNumber}
                    </span>
                    <span className="line-clamp-2 text-sm">
                      {slide.title ?? "Untitled slide"}
                    </span>
                  </span>
                </Button>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
