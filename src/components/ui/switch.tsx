"use client"

import * as React from "react"
import { Switch as SwitchPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Switch({
  className,
  size = "default",
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  size?: "sm" | "default"
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "peer group/switch relative inline-flex shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors outline-none",
        "after:absolute after:-inset-x-3 after:-inset-y-2",
        "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:border-ring",
        "data-[size=default]:h-[18.4px] data-[size=default]:w-[32px]",
        "data-[size=sm]:h-[14px] data-[size=sm]:w-[24px]",
        // Track colors — Radix sets data-state="checked|unchecked".
        // The bare "data-checked" selector this file used previously did
        // not match Radix's actual attribute, so the track was rendering
        // transparent against the white card surface.
        "data-[state=checked]:bg-brand",
        "data-[state=unchecked]:bg-[#6B7280]",
        "dark:data-[state=unchecked]:bg-[#9CA3AF]",
        "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
        "dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block rounded-full bg-white shadow-sm ring-0 transition-transform",
          "group-data-[size=default]/switch:size-4 group-data-[size=sm]/switch:size-3",
          "group-data-[size=default]/switch:data-[state=checked]:translate-x-[calc(100%-2px)]",
          "group-data-[size=sm]/switch:data-[state=checked]:translate-x-[calc(100%-2px)]",
          "data-[state=unchecked]:translate-x-0",
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
