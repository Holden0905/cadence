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
import { AboutContent } from "@/components/about-content";

export function AboutSheetTrigger() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label="About Cadence"
          title="About Cadence"
        >
          <Info className="size-4" />
        </Button>
      </SheetTrigger>
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
