"use client";

import Image from "next/image";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { COOPERATIVE_LOGO_PATH, COOPERATIVE_NAME } from "@/lib/brand";

type BrandMarkProps = {
  className?: string;
  size?: "sm" | "md" | "lg";
  priority?: boolean;
  variant?: "full" | "symbol";
};

const sizeClasses = {
  full: {
    sm: "h-24 w-24 rounded-[28px] text-sm",
    md: "h-32 w-32 rounded-[32px] text-base",
    lg: "h-40 w-40 rounded-[36px] text-lg sm:h-44 sm:w-44",
  },
  symbol: {
    sm: "h-11 w-11 rounded-2xl text-[10px]",
    md: "h-16 w-16 rounded-3xl text-base",
    lg: "h-20 w-20 rounded-[28px] text-lg",
  },
};

export function BrandMark({
  className,
  priority = false,
  size = "md",
  variant = "symbol",
}: BrandMarkProps) {
  const [logoFailed, setLogoFailed] = useState(false);
  const containerClassName =
    variant === "full"
      ? "border border-white/10 bg-black shadow-[0_24px_60px_rgba(15,23,42,0.28)] dark:shadow-[0_24px_60px_rgba(2,6,23,0.6)]"
      : "border border-amber-400/20 bg-black shadow-lg shadow-black/20 dark:shadow-black/40";
  const imageClassName =
    variant === "full"
      ? "object-contain"
      : "object-cover object-[center_18%] scale-[1.38]";

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden font-['Outfit'] font-bold text-white",
        containerClassName,
        sizeClasses[variant][size],
        className,
      )}
    >
      {logoFailed ? (
        <span aria-hidden="true">IMPCS</span>
      ) : (
        <Image
          alt={`${COOPERATIVE_NAME} logo`}
          className={imageClassName}
          fill
          onError={() => setLogoFailed(true)}
          priority={priority}
          sizes={
            variant === "full"
              ? "(max-width: 640px) 160px, 176px"
              : "(max-width: 640px) 44px, 64px"
          }
          src={COOPERATIVE_LOGO_PATH}
        />
      )}
    </span>
  );
}
