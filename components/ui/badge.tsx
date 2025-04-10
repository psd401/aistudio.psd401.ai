"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground shadow hover:bg-primary/80",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground shadow hover:bg-destructive/80",
        outline: "text-foreground border border-input hover:bg-accent hover:text-accent-foreground",
        success: "border-transparent bg-emerald-500/10 text-emerald-700 shadow-none hover:bg-emerald-500/20",
        warning: "border-transparent bg-yellow-500/10 text-yellow-700 shadow-none hover:bg-yellow-500/20",
        info: "border-transparent bg-blue-500/10 text-blue-700 shadow-none hover:bg-blue-500/20",
        error: "border-transparent bg-red-500/10 text-red-700 shadow-none hover:bg-red-500/20",
        ghost: "border-transparent bg-background/50 text-muted-foreground shadow-none hover:bg-accent/50",
      },
      size: {
        default: "text-xs",
        sm: "text-[0.6875rem]",
        lg: "text-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, size, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant, size }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
