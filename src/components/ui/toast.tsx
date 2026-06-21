"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import { Check, AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * App-wide toast/confirmation primitive. The app previously had NO success
 * feedback — actions that didn't redirect (status changes, notes) saved
 * silently, training users to distrust their own clicks. Wrap the authenticated
 * tree in <ToastProvider> (see the dashboard layout) and call `useToast().toast(…)`
 * from any client component after a successful Server Action.
 */
type ToastTone = "success" | "error";

type Toast = {
  id: number;
  title: string;
  description?: string;
  tone: ToastTone;
};

type ToastInput = {
  title: string;
  description?: string;
  tone?: ToastTone;
};

type ToastContextValue = { toast: (t: ToastInput) => void };

const ToastContext = createContext<ToastContextValue | null>(null);

const SUCCESS_MS = 4000;
const ERROR_MS = 6000; // errors linger a little longer

const toneConfig: Record<
  ToastTone,
  { icon: typeof Check; accent: string; iconColor: string }
> = {
  success: {
    icon: Check,
    accent: "border-l-green-500",
    iconColor: "text-green-600",
  },
  error: {
    icon: AlertTriangle,
    accent: "border-l-red-500",
    iconColor: "text-red-600",
  },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    ({ title, description, tone = "success" }: ToastInput) => {
      const id = nextId.current++;
      setToasts((prev) => [...prev, { id, title, description, tone }]);
      setTimeout(() => dismiss(id), tone === "error" ? ERROR_MS : SUCCESS_MS);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-full max-w-sm flex-col gap-2"
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map((t) => {
          const { icon: Icon, accent, iconColor } = toneConfig[t.tone];
          return (
            <div
              key={t.id}
              role="status"
              className={cn(
                "pointer-events-auto flex items-start gap-3 rounded-lg border border-l-4 border-slate-200 bg-white px-4 py-3 shadow-lg",
                accent,
              )}
            >
              <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", iconColor)} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900">{t.title}</p>
                {t.description && (
                  <p className="mt-0.5 text-xs text-slate-500">{t.description}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="shrink-0 rounded p-0.5 text-slate-400 transition hover:text-slate-600"
                aria-label="Dismiss notification"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}
