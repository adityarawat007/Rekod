import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// §6.4. Square, 150ms colour-only transitions, ≥32px hit targets (§9).
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center border border-transparent text-sm font-medium whitespace-nowrap transition-colors duration-150 ease-out outline-none select-none disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        /** Primary: one per view. */
        default: "bg-primary text-primary-foreground hover:bg-primary-hover",
        /** Secondary. */
        outline: "border-line-strong bg-panel text-ink hover:bg-bg aria-expanded:bg-bg",
        secondary: "border-line-strong bg-bg text-ink hover:bg-cell aria-expanded:bg-cell",
        ghost: "text-ink hover:bg-bg aria-expanded:bg-bg",
        /** Outside a confirm dialog a destructive action is never filled. */
        destructive: "border-error bg-transparent text-error hover:bg-error/8",
        /** Filled: inside a confirm dialog only. */
        "destructive-solid": "bg-error text-on-primary hover:bg-error/90",
        link: "h-auto! px-0! text-link underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 gap-1.5 px-3.5",
        xs: "h-8 gap-1 px-2 text-xs [&_svg:not([class*='size-'])]:size-3.5",
        sm: "h-8 gap-1.5 px-3 text-[13px] [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-[38px] gap-2 px-3.5",
        icon: "size-9",
        "icon-xs": "size-8 [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm": "size-8",
        "icon-lg": "size-[38px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
