import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

// ─── Variants ──────────────────────────────────────────────────────────────────

const badgeVariants = cva(
  [
    'inline-flex items-center rounded-full border px-2.5 py-0.5',
    'text-xs font-semibold transition-colors',
    'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  ],
  {
    variants: {
      variant: {
        /** Default filled badge */
        default:
          'border-transparent bg-primary text-primary-foreground hover:bg-primary/80',
        /** Secondary muted badge */
        secondary:
          'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
        /** Destructive / error badge */
        destructive:
          'border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80',
        /** Outlined badge */
        outline:
          'text-foreground',
        /** CSU Chico Gold badge */
        gold:
          'border-transparent bg-gold text-gold-950 hover:bg-gold/80',
        /** Success / green badge */
        success:
          'border-transparent bg-green-500 text-white hover:bg-green-500/80',
        /** Info / blue badge */
        info:
          'border-transparent bg-blue-500 text-white hover:bg-blue-500/80',
        /** Warning / amber badge */
        warning:
          'border-transparent bg-amber-400 text-amber-950 hover:bg-amber-400/80',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

// ─── Component ────────────────────────────────────────────────────────────────

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
