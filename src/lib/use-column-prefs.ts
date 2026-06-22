"use client";

import { useEffect, useState } from "react";

/**
 * Per-table column preferences persisted in localStorage.
 *
 * Shape on disk: `{ v: <schemaVersion>, visible: string[], order: string[] }`.
 * Bumping `version` resets prefs — use it when columns are added/removed in a
 * way that would orphan saved keys.
 *
 * SSR-safe: the first render (server AND the client's hydration pass) returns
 * `defaults`, so the rendered DOM matches and hydration is clean. Stored prefs
 * are applied in a post-mount `useEffect` — a brief flash to the saved column
 * set is preferred to a hydration mismatch (which is exactly what reading
 * localStorage during the hydration render caused: e.g. a reordered column set
 * made the mobile-sort `<option>`s differ from the server's order).
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

  // Apply stored prefs AFTER mount (post-hydration), so the hydration render
  // matches the server's `defaults` output and never mismatches. Reading
  // localStorage during render would diverge from the server whenever the saved
  // prefs differ from defaults (reordered/hidden columns) and throw a hydration
  // error. The defaults serialize identically to the JSON we'd write, so a
  // string compare avoids a needless extra render when nothing was customised.
  useEffect(() => {
    const stored = loadFromStorage(storageKey, version, defaults);
    // One post-mount sync from an external store (localStorage). The cascading-
    // render warning doesn't apply: this runs once per table and replaces a
    // during-render read that caused hydration mismatches.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored) setPrefs(stored);
    setHydrated(true);
    // `defaults` is a stable per-table literal; key the effect off the storage
    // identity so it runs once per table.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, version]);

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
