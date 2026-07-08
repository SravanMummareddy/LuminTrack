"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";

/**
 * Global keyboard shortcuts, mounted once in the dashboard layout.
 *
 *   /  or ⌘K / Ctrl+K   focus the global search
 *   g then <key>        go to a section (d/j/c/s/b/i/p/r)
 *   n                   new record on this list (deterministic per section)
 *   ?                   toggle this help overlay
 *   Esc                 close the overlay / cancel a pending g-prefix
 *
 * Shortcuts are suppressed while typing in an input/textarea/select or a
 * contentEditable element, so they never eat real keystrokes.
 */

const GOTO: Record<string, string> = {
  d: "/",
  j: "/jobs",
  c: "/candidates",
  s: "/submissions",
  b: "/bench",
  i: "/interviews",
  p: "/placements",
  r: "/reports",
};

// Deterministic "new record" target per top-level section. Sections without a
// create page (dashboard, interviews, placements, reports) are intentionally
// absent — `n` is a no-op there rather than guessing.
const NEW_TARGET: { prefix: string; href: string }[] = [
  { prefix: "/candidates", href: "/candidates/new" },
  { prefix: "/jobs", href: "/jobs/new" },
  { prefix: "/bench", href: "/bench/new" },
  { prefix: "/vendor-portal", href: "/vendor-portal/new" },
  // Submissions start from a vendor requirement (no /submissions/new route).
  { prefix: "/submissions", href: "/vendor-portal" },
];

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable
  );
}

const SHORTCUTS: { keys: string; label: string }[] = [
  { keys: "/  or  ⌘K", label: "Focus search" },
  { keys: "n", label: "New record (on this list)" },
  { keys: "?", label: "Show this help" },
  { keys: "Esc", label: "Close menus / overlays" },
];

const GOTO_HELP: { keys: string; label: string }[] = [
  { keys: "g d", label: "Dashboard" },
  { keys: "g j", label: "Jobs" },
  { keys: "g c", label: "Candidates" },
  { keys: "g s", label: "Submissions" },
  { keys: "g i", label: "Interviews" },
  { keys: "g p", label: "Placements" },
  { keys: "g b", label: "Bench" },
  { keys: "g r", label: "Reports" },
];

export function KeyboardShortcuts() {
  const router = useRouter();
  const pathname = usePathname();
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    // "g" is a prefix key: pressing it arms a short window during which the next
    // key picks a destination. Kept in a closure (not state) so it never causes
    // a re-render and is always current inside the handler.
    let gotoArmed = false;
    let gotoTimer: ReturnType<typeof setTimeout> | null = null;

    function disarm() {
      gotoArmed = false;
      if (gotoTimer) {
        clearTimeout(gotoTimer);
        gotoTimer = null;
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      // ⌘K / Ctrl+K works even from a field (a common "command" convention);
      // everything else is suppressed while typing.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        document.getElementById("global-search")?.focus();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;

      // Resolve a pending "g" prefix.
      if (gotoArmed) {
        const dest = GOTO[e.key.toLowerCase()];
        disarm();
        if (dest) {
          e.preventDefault();
          router.push(dest);
        }
        return;
      }

      if (e.key === "g") {
        gotoArmed = true;
        gotoTimer = setTimeout(disarm, 1500);
        return;
      }
      if (e.key === "/") {
        e.preventDefault();
        document.getElementById("global-search")?.focus();
        return;
      }
      if (e.key === "?") {
        e.preventDefault();
        setHelpOpen((o) => !o);
        return;
      }
      if (e.key === "Escape") {
        setHelpOpen(false);
        return;
      }
      if (e.key === "n") {
        const match = NEW_TARGET.find(
          (t) => pathname === t.prefix || pathname.startsWith(`${t.prefix}/`),
        );
        if (match) {
          e.preventDefault();
          router.push(match.href);
        }
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      disarm();
    };
  }, [router, pathname]);

  return (
    <Dialog
      open={helpOpen}
      onClose={() => setHelpOpen(false)}
      title="Keyboard shortcuts"
      description="Press ? anytime to toggle this."
    >
      <div className="grid gap-6 px-5 py-4 sm:grid-cols-2">
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            General
          </h3>
          <ul className="space-y-1.5">
            {SHORTCUTS.map((s) => (
              <ShortcutRow key={s.label} keys={s.keys} label={s.label} />
            ))}
          </ul>
        </div>
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Go to… (press g, then)
          </h3>
          <ul className="space-y-1.5">
            {GOTO_HELP.map((s) => (
              <ShortcutRow key={s.label} keys={s.keys} label={s.label} />
            ))}
          </ul>
        </div>
      </div>
    </Dialog>
  );
}

function ShortcutRow({ keys, label }: { keys: string; label: string }) {
  return (
    <li className="flex items-center justify-between gap-4 text-sm">
      <span className="text-slate-600">{label}</span>
      <kbd className="shrink-0 rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono text-xs text-slate-500">
        {keys}
      </kbd>
    </li>
  );
}
