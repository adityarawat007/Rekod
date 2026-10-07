"use client"

import * as React from "react"
import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox"

import { cn } from "@/lib/utils"
import { CheckIcon, SearchIcon } from "lucide-react"

// shadcn `combobox` (base-nova), restyled to REKOD_DESIGN_SYSTEM.md: radius 0,
// no shadow, 38px search field, no zoom/slide entrances. Written without
// shadcn's InputGroup so `button` and `input` keep their restyled versions.
// The shape is the popup-input pattern: any trigger, a search field inside.

const Combobox = ComboboxPrimitive.Root

function ComboboxTrigger({ ...props }: ComboboxPrimitive.Trigger.Props) {
  return <ComboboxPrimitive.Trigger data-slot="combobox-trigger" {...props} />
}

function ComboboxContent({
  className,
  side = "bottom",
  sideOffset = 6,
  align = "start",
  alignOffset = 0,
  ...props
}: ComboboxPrimitive.Popup.Props &
  Pick<
    ComboboxPrimitive.Positioner.Props,
    "side" | "align" | "sideOffset" | "alignOffset"
  >) {
  return (
    <ComboboxPrimitive.Portal>
      <ComboboxPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        className="isolate z-50 outline-none"
      >
        <ComboboxPrimitive.Popup
          data-slot="combobox-content"
          className={cn(
            "group/combobox-content flex max-h-(--available-height) w-72 max-w-(--available-width) origin-(--transform-origin) flex-col overflow-hidden bg-popover text-popover-foreground ring-1 ring-line duration-100 outline-none data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
            className
          )}
          {...props}
        />
      </ComboboxPrimitive.Positioner>
    </ComboboxPrimitive.Portal>
  )
}

/** The search field at the top of the popup. */
function ComboboxInput({ className, ...props }: ComboboxPrimitive.Input.Props) {
  return (
    <div className="relative border-b border-line">
      <SearchIcon
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <ComboboxPrimitive.Input
        data-slot="combobox-input"
        className={cn(
          "h-[38px] w-full min-w-0 bg-transparent pr-3 pl-9 text-base outline-none placeholder:text-muted-foreground md:text-sm",
          className
        )}
        {...props}
      />
    </div>
  )
}

function ComboboxList({ className, ...props }: ComboboxPrimitive.List.Props) {
  return (
    <ComboboxPrimitive.List
      data-slot="combobox-list"
      className={cn(
        "max-h-72 scroll-py-1 overflow-y-auto overscroll-contain p-1 data-empty:p-0",
        className
      )}
      {...props}
    />
  )
}

function ComboboxItem({
  className,
  children,
  ...props
}: ComboboxPrimitive.Item.Props) {
  return (
    <ComboboxPrimitive.Item
      data-slot="combobox-item"
      className={cn(
        "relative flex w-full cursor-default items-center gap-2.5 px-2 py-2 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      {/* The slot keeps its width so labels line up; the check shows only on the selected row. */}
      <span className="grid size-4 shrink-0 place-items-center">
        <ComboboxPrimitive.ItemIndicator>
          <CheckIcon className="pointer-events-none" />
        </ComboboxPrimitive.ItemIndicator>
      </span>
      {children}
    </ComboboxPrimitive.Item>
  )
}

function ComboboxEmpty({ className, ...props }: ComboboxPrimitive.Empty.Props) {
  return (
    <ComboboxPrimitive.Empty
      data-slot="combobox-empty"
      className={cn(
        "hidden w-full justify-center px-2 py-4 text-center text-sm text-muted-foreground group-data-empty/combobox-content:flex",
        className
      )}
      {...props}
    />
  )
}

export {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
}
