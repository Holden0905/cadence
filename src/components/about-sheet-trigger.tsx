"use client";

import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AboutContent } from "@/components/about-content";

export function AboutSheetTrigger() {
  return (
    <Sheet>
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-10"
                aria-label="About Cadence"
              >
                <Info className="size-6" />
              </Button>
            </SheetTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">About Cadence</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl overflow-y-auto"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>About Cadence</SheetTitle>
          <SheetDescription>
            Overview of Cadence and what each page does.
          </SheetDescription>
        </SheetHeader>
        <div className="p-6">
          <AboutContent />
        </div>
      </SheetContent>
    </Sheet>
  );
}
