"use client";

import { useEffect, useState } from "react";

const COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ec4899", "#3b82f6", "#a855f7"];

type Piece = {
  id: number;
  left: number;
  dx: number;
  dy: number;
  rot: number;
  color: string;
  delay: number;
};

/**
 * A brief, dependency-free confetti burst. Bump `fireKey` (e.g. a counter) to
 * fire it once; it clears itself after the animation. Purely decorative
 * (aria-hidden, pointer-events-none), so it never blocks the UI underneath.
 */
export function Confetti({ fireKey }: { fireKey: number }) {
  const [pieces, setPieces] = useState<Piece[]>([]);

  useEffect(() => {
    if (fireKey <= 0) return;
    const next: Piece[] = Array.from({ length: 40 }, (_, i) => ({
      id: fireKey * 1000 + i,
      left: 50 + (Math.random() * 30 - 15),
      dx: Math.random() * 260 - 130,
      dy: 320 + Math.random() * 220,
      rot: Math.random() * 720 - 360,
      color: COLORS[i % COLORS.length],
      delay: Math.random() * 140,
    }));
    // Deriving the burst from the fire trigger is the whole point of the effect.
    /* eslint-disable react-hooks/set-state-in-effect */
    setPieces(next);
    const t = setTimeout(() => setPieces([]), 1700);
    /* eslint-enable react-hooks/set-state-in-effect */
    return () => clearTimeout(t);
  }, [fireKey]);

  if (pieces.length === 0) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[100] overflow-hidden"
    >
      {pieces.map((p) => (
        <span
          key={p.id}
          style={{
            position: "absolute",
            top: "22%",
            left: `${p.left}%`,
            width: 9,
            height: 9,
            background: p.color,
            borderRadius: 2,
            // custom props consumed by the keyframes below
            ["--dx" as string]: `${p.dx}px`,
            ["--dy" as string]: `${p.dy}px`,
            ["--rot" as string]: `${p.rot}deg`,
            animation: `confetti-fall 1.45s ${p.delay}ms cubic-bezier(0.2,0.6,0.3,1) forwards`,
          }}
        />
      ))}
      <style>{`
        @keyframes confetti-fall {
          0%   { transform: translate(0, 0) rotate(0deg); opacity: 1; }
          100% { transform: translate(var(--dx), var(--dy)) rotate(var(--rot)); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
