import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

// ─── Variants ──────────────────────────────────────────────────────────────────

const buttonVariants = cva(
  // Base styles
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md',
    'text-sm font-medium transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
    'disabled:pointer-events-none disabled:opacity-50',
    '[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  ],
  {
    variants: {
      variant: {
        /** Filled scarlet button — primary action */
        default:
          'bg-primary text-primary-foreground shadow hover:bg-primary/90 active:bg-primary/80',
        /** Destructive action */
        destructive:
          'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
        /** Outlined button */
        outline:
          'border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground',
        /** Muted background */
        secondary:
          'bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80',
        /** Ghost — no background until hover */
        ghost:
          'hover:bg-accent hover:text-accent-foreground',
        /** Looks like a link */
        link:
          'text-primary underline-offset-4 hover:underline',
        /** CSU Chico Gold accent */
        gold:
          'bg-gold text-gold-950 shadow hover:bg-gold/90 active:bg-gold/80',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-10 rounded-md px-8',
        xl: 'h-12 rounded-md px-10 text-base',
        icon: 'h-9 w-9',
        'icon-sm': 'h-8 w-8',
        'icon-lg': 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /**
   * When true, renders the button's children directly inside a Slot component
   * (allows composing with other elements like Next.js Link).
   */
  asChild?: boolean
}

// ─── Component ────────────────────────────────────────────────────────────────

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  },
)
Button.displayName = 'Button'

export { Button, buttonVariants }
