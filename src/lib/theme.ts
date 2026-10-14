import { useEffect, useState } from "react";

// Three screen themes, switched from the footer (same idea as the sibling
// `story` project): dark (黑), light (白) and teal (青 — black with a cyan
// accent). Applied as <html data-theme>; the tokens live in style.css. An
// inline script in index.html applies the stored choice before first paint so
// there is no flash. With nothing stored, the app keeps following the OS
// light/dark preference (no data-theme attribute), as before.

export const THEMES = ["dark", "light", "teal"] as const;
export type Theme = (typeof THEMES)[number];

const KEY = "rebar_theme";
const EVENT = "rebar-theme-change";

export function readTheme(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return (THEMES as readonly string[]).includes(v || "") ? (v as Theme) : null;
  } catch {
    return null; // storage blocked
  }
}

/** The theme actually showing: the stored choice, else what the OS preference gives. */
export function effectiveTheme(): Theme {
  const stored = readTheme();
  if (stored) return stored;
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function setTheme(t: Theme): void {
  document.documentElement.dataset.theme = t;
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* private mode — the choice just won't persist */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, set] = useState<Theme>(() => effectiveTheme());
  useEffect(() => {
    const on = () => set(effectiveTheme());
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  return [theme, setTheme];
}
