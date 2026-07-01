import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em]",
  {
    variants: {
      variant: {
        default: "border-emerald-400/20 bg-emerald-500/10 text-emerald-200",
        secondary: "border-white/15 bg-slate-800/90 text-slate-100",
        outline: "border-amber-300/20 bg-amber-400/10 text-amber-200",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
