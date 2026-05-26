"use client";

import { useState } from "react";

/**
 * Per-table column preferences persisted in localStorage.
 *
 * Shape on disk: `{ v: <schemaVersion>, visible: string[], order: string[] }`.
 * Bumping `version` resets prefs — use it when columns are added/removed in a
 * way that would orphan saved keys.
 *
 * SSR-safe: on first render returns `defaults` so server and client output
 * match; after mount we hydrate from localStorage during the next render via
 * the React "adjust state during render" pattern. A brief flash is preferred
 * to a hydration mismatch error.
 */
export type ColumnPrefs = { visible: string[]; order: string[] };

function loadFromStorage(
  storageKey: string,
  version: number,
  defaults: ColumnPrefs,
): ColumnPrefs | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { v?: number } & Partial<ColumnPrefs>;
    if (
      parsed.v !== version ||
      !Array.isArray(parsed.visible) ||
      !Array.isArray(parsed.order)
    )
      return null;
    // Reconcile against current defaults so newly-added columns appear
    // (appended to the end, hidden), and removed columns drop out.
    const known = new Set(defaults.order);
    const order = parsed.order.filter((k) => known.has(k));
    for (const k of defaults.order) if (!order.includes(k)) order.push(k);
    const visible = parsed.visible.filter((k) => known.has(k));
    return { visible, order };
  } catch {
    // Corrupt JSON or no localStorage — fall back to defaults silently.
    return null;
  }
}

export function useColumnPrefs(
  storageKey: string,
  version: number,
  defaults: ColumnPrefs,
): [ColumnPrefs, (next: ColumnPrefs) => void, boolean] {
  const [prefs, setPrefs] = useState<ColumnPrefs>(defaults);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage during render on the client — the very first
  // server/client render uses `defaults` (no `window`), the next render picks
  // up the stored prefs. This avoids `setState`-in-effect and matches the SSR
  // contract documented above.
  if (!hydrated && typeof window !== "undefined") {
    setHydrated(true);
    const stored = loadFromStorage(storageKey, version, defaults);
    if (stored) setPrefs(stored);
  }

  function update(next: ColumnPrefs) {
    setPrefs(next);
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ v: version, ...next }),
      );
    } catch {
      // Ignore — storage full, private mode, etc. Prefs still live in memory.
    }
  }

  return [prefs, update, hydrated];
}
