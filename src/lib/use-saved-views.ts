"use client";

import { useEffect, useState } from "react";

/**
 * Per-list saved filter "views", persisted in localStorage (per browser, per
 * user — matches the column-prefs model; no server round-trip). A view is just
 * a named snapshot of the list's URL query string (filters + sort, minus the
 * page cursor), so applying one is a plain navigation.
 *
 * Views are keyed by name: saving under an existing name overwrites it, so
 * there's no id to generate. SSR-safe: renders empty until a post-mount effect
 * loads storage, so the hydration DOM matches the server's.
 */
export type SavedView = { name: string; query: string };

function load(storageKey: string): SavedView[] {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (v): v is SavedView =>
        v && typeof v.name === "string" && typeof v.query === "string",
    );
  } catch {
    return [];
  }
}

export function useSavedViews(storageKey: string): {
  views: SavedView[];
  hydrated: boolean;
  saveView: (name: string, query: string) => void;
  deleteView: (name: string) => void;
} {
  const [views, setViews] = useState<SavedView[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // One post-mount sync from localStorage — keeps the hydration render equal
    // to the server's (empty) output, then fills in saved views.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setViews(load(storageKey));
    setHydrated(true);
  }, [storageKey]);

  function persist(next: SavedView[]) {
    setViews(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // Storage full / private mode — the view still lives in memory this session.
    }
  }

  function saveView(name: string, query: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    // Upsert by name (case-insensitive), keeping insertion order stable.
    const idx = views.findIndex(
      (v) => v.name.toLowerCase() === trimmed.toLowerCase(),
    );
    const next = [...views];
    if (idx >= 0) next[idx] = { name: trimmed, query };
    else next.push({ name: trimmed, query });
    persist(next);
  }

  function deleteView(name: string) {
    persist(views.filter((v) => v.name !== name));
  }

  return { views, hydrated, saveView, deleteView };
}
