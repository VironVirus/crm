"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type ThemeMode = "auto" | "dark" | "light";
export type ResolvedTheme = "dark" | "light";

const THEME_STORAGE_KEY = "ifemelunma-theme-mode";
const NIGHT_START_HOUR = 19;
const DAY_START_HOUR = 6;

type ThemeContextValue = {
  mode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getTimeTheme(date = new Date()): ResolvedTheme {
  const hour = date.getHours();

  return hour >= NIGHT_START_HOUR || hour < DAY_START_HOUR ? "dark" : "light";
}

function getSystemPrefersDark() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode !== "auto") {
    return mode;
  }

  return getSystemPrefersDark() || getTimeTheme() === "dark" ? "dark" : "light";
}

function applyTheme(resolvedTheme: ResolvedTheme) {
  const root = document.documentElement;

  root.dataset.theme = resolvedTheme;
  root.classList.toggle("dark", resolvedTheme === "dark");
  root.style.colorScheme = resolvedTheme;
}

function readStoredMode(): ThemeMode {
  if (typeof window === "undefined") {
    return "auto";
  }

  const storedMode = window.localStorage.getItem(THEME_STORAGE_KEY);

  return storedMode === "dark" || storedMode === "light" || storedMode === "auto"
    ? storedMode
    : "auto";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("auto");
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("dark");

  useEffect(() => {
    setModeState(readStoredMode());
  }, []);

  useEffect(() => {
    function refreshTheme() {
      const nextTheme = resolveTheme(mode);

      applyTheme(nextTheme);
      setResolvedTheme(nextTheme);
    }

    refreshTheme();

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    mediaQuery.addEventListener("change", refreshTheme);
    const timer = window.setInterval(refreshTheme, 60 * 1000);

    return () => {
      mediaQuery.removeEventListener("change", refreshTheme);
      window.clearInterval(timer);
    };
  }, [mode]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      resolvedTheme,
      setMode(nextMode) {
        window.localStorage.setItem(THEME_STORAGE_KEY, nextMode);
        setModeState(nextMode);
      },
    }),
    [mode, resolvedTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme must be used inside ThemeProvider.");
  }

  return context;
}

export const themeBootScript = `
(() => {
  try {
    const storageKey = "${THEME_STORAGE_KEY}";
    const nightStart = ${NIGHT_START_HOUR};
    const dayStart = ${DAY_START_HOUR};
    const storedMode = window.localStorage.getItem(storageKey);
    const mode = storedMode === "dark" || storedMode === "light" || storedMode === "auto" ? storedMode : "auto";
    const hour = new Date().getHours();
    const timeTheme = hour >= nightStart || hour < dayStart ? "dark" : "light";
    const systemDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    const resolvedTheme = mode === "auto" ? (systemDark || timeTheme === "dark" ? "dark" : "light") : mode;
    const root = document.documentElement;
    root.dataset.theme = resolvedTheme;
    root.classList.toggle("dark", resolvedTheme === "dark");
    root.style.colorScheme = resolvedTheme;
  } catch {
    document.documentElement.dataset.theme = "dark";
    document.documentElement.classList.add("dark");
  }
})();
`;
