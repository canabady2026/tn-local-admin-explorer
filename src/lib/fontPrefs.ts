"use client";

import { useEffect, useState } from "react";

export type FontFamily = "sans" | "serif" | "mono";
export type FontSize = "sm" | "md" | "lg" | "xl";

export const FONT_SIZE_ORDER: FontSize[] = ["sm", "md", "lg", "xl"];

const FONT_SIZE_PERCENT: Record<FontSize, string> = {
  sm: "87.5%",
  md: "100%",
  lg: "112.5%",
  xl: "125%",
};

const FONT_FAMILY_STACK: Record<FontFamily, string> = {
  sans: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  mono: "var(--font-geist-mono), ui-monospace, 'SFMono-Regular', monospace",
};

const STORAGE_KEY = "tnlocaladmin:font-prefs";

interface Stored {
  family: FontFamily;
  size: FontSize;
}

function readStored(): Stored {
  if (typeof window === "undefined") return { family: "sans", size: "md" };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.family in FONT_FAMILY_STACK && parsed?.size in FONT_SIZE_PERCENT) return parsed;
    }
  } catch {
    // localStorage can throw in private-browsing contexts -- fall through to defaults.
  }
  return { family: "sans", size: "md" };
}

export function useFontPreferences() {
  const [family, setFamily] = useState<FontFamily>(() => readStored().family);
  const [size, setSize] = useState<FontSize>(() => readStored().size);

  // Imperative sync to the document + localStorage -- never calls setState,
  // so this doesn't trip react-hooks/set-state-in-effect.
  useEffect(() => {
    document.documentElement.style.fontFamily = FONT_FAMILY_STACK[family];
    document.documentElement.style.fontSize = FONT_SIZE_PERCENT[size];
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ family, size }));
    } catch {
      // Ignore -- persistence is a nice-to-have, not required for the preference to apply this session.
    }
  }, [family, size]);

  return { family, setFamily, size, setSize };
}
