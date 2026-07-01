"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type ThemeMode } from "@/components/theme/theme-provider";

const themeOrder: ThemeMode[] = ["auto", "light", "dark"];

const themeLabels: Record<ThemeMode, string> = {
  auto: "Auto theme",
  dark: "Dark theme",
  light: "Light theme",
};

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { mode, resolvedTheme, setMode } = useTheme();
  const nextMode = themeOrder[(themeOrder.indexOf(mode) + 1) % themeOrder.length];
  const Icon = mode === "auto" ? Monitor : resolvedTheme === "dark" ? Moon : Sun;

  return (
    <button
      aria-label={`${themeLabels[mode]}. Switch to ${themeLabels[nextMode].toLowerCase()}.`}
      className={`flex h-11 w-11 items-center justify-center rounded-2xl border border-border bg-card/80 text-foreground shadow-sm transition hover:bg-secondary ${className}`}
      onClick={() => setMode(nextMode)}
      title={themeLabels[mode]}
      type="button"
    >
      <Icon className="h-5 w-5" />
      <span className="sr-only">{themeLabels[mode]}</span>
    </button>
  );
}
