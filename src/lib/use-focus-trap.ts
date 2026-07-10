"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Stack of currently-open traps (one token per mounted trap). Only the token on
 * top owns the keyboard, so when surfaces are stacked (e.g. a `ConfirmDialog`
 * over another `Dialog`) a single Escape closes just the top one and Tab is
 * contained to it — instead of every trap's document listener acting at once.
 */
const trapStack: object[] = [];

/** Selector matching elements that participate in the tab order. */
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * While `open`, traps Tab/Shift+Tab inside the element referenced by
 * `panelRef`, calls `onClose()` on Escape, and locks body scroll. On open,
 * captures the previously-focused element and sends focus into the panel;
 * on close, restores focus to where it came from.
 *
 * Shared by `Dialog` and `MobileNav` (and anything else that pops a
 * modal-style surface).
 */
export function useFocusTrap(
  open: boolean,
  panelRef: RefObject<HTMLElement | null>,
  onClose: () => void,
) {
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    returnFocusRef.current =
      (document.activeElement as HTMLElement | null) ?? null;
    return () => {
      returnFocusRef.current?.focus?.();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    const first = panel.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    (first ?? panel).focus();
  }, [open, panelRef]);

  useEffect(() => {
    if (!open) return;
    // Claim the top of the stack for as long as this trap is open.
    const token = {};
    trapStack.push(token);
    const isTop = () => trapStack[trapStack.length - 1] === token;
    const onKey = (e: KeyboardEvent) => {
      // A trap nested above this one owns the keyboard; stay out of its way.
      if (!isTop()) return;
      if (e.key === "Escape") {
        // Stop a stacked trap below from also seeing this Escape.
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((el) => !el.hasAttribute("aria-hidden"));
      if (focusables.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !panel.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last || !panel.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      const i = trapStack.indexOf(token);
      if (i !== -1) trapStack.splice(i, 1);
      document.removeEventListener("keydown", onKey);
      // Only release the scroll lock once the last stacked trap has closed.
      if (trapStack.length === 0) document.body.style.overflow = "";
    };
  }, [open, onClose, panelRef]);
}
