"use client";

import { useEffect, useState } from "react";

/**
 * Per-table column preferences persisted in localStorage.
 *
 * Shape on disk: `{ v: <schemaVersion>, visible: string[], order: string[] }`.
 * Bumping `version` resets prefs — use it when columns are added/removed in a
 * way that would orphan saved keys.
 *
 * SSR-safe: on first render returns `defaults` so server and client output
 * match; after mount we hydrate from localStorage. A brief flash is preferred
 * to a hydration mismatch error.
 */
export type ColumnPrefs = { visible: string[]; order: string[] };

export function useColumnPrefs(
  storageKey: string,
  version: number,
  defaults: ColumnPrefs,
): [ColumnPrefs, (next: ColumnPrefs) => void, boolean] {
  const [prefs, setPrefs] = useState<ColumnPrefs>(defaults);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as { v?: number } & Partial<ColumnPrefs>;
        if (
          parsed.v === version &&
          Array.isArray(parsed.visible) &&
          Array.isArray(parsed.order)
        ) {
          // Reconcile against current defaults so newly-added columns appear
          // (appended to the end, hidden), and removed columns drop out.
          const known = new Set(defaults.order);
          const order = parsed.order.filter((k) => known.has(k));
          for (const k of defaults.order) if (!order.includes(k)) order.push(k);
          const visible = parsed.visible.filter((k) => known.has(k));
          setPrefs({ visible, order });
        }
      }
    } catch {
      // Corrupt JSON or no localStorage — fall back to defaults silently.
    }
    setHydrated(true);
  }, [storageKey, version, defaults]);

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
