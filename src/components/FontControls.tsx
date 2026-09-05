"use client";

import { FONT_SIZE_ORDER, useFontPreferences, type FontFamily } from "@/lib/fontPrefs";

export function FontControls() {
  const { family, setFamily, size, setSize } = useFontPreferences();
  const idx = FONT_SIZE_ORDER.indexOf(size);

  return (
    <div className="flex items-center gap-2">
      <div className="inline-flex overflow-hidden rounded-full border border-slate-300 text-xs">
        <button
          onClick={() => setSize(FONT_SIZE_ORDER[Math.max(0, idx - 1)])}
          disabled={idx === 0}
          aria-label="Decrease font size"
          title="Decrease font size"
          className="px-2 py-1 font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-30"
        >
          A-
        </button>
        <button
          onClick={() => setSize("md")}
          aria-label="Reset font size"
          title="Reset font size"
          className="border-x border-slate-300 px-2 py-1 text-slate-600 hover:bg-slate-50"
        >
          A
        </button>
        <button
          onClick={() => setSize(FONT_SIZE_ORDER[Math.min(FONT_SIZE_ORDER.length - 1, idx + 1)])}
          disabled={idx === FONT_SIZE_ORDER.length - 1}
          aria-label="Increase font size"
          title="Increase font size"
          className="px-2 py-1 font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-30"
        >
          A+
        </button>
      </div>
      <select
        value={family}
        onChange={(e) => setFamily(e.target.value as FontFamily)}
        aria-label="Font style"
        title="Font style"
        className="rounded-full border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600"
      >
        <option value="sans">Sans</option>
        <option value="serif">Serif</option>
        <option value="mono">Mono</option>
      </select>
    </div>
  );
}
