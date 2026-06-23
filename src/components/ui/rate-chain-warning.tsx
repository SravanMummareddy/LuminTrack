import { rateChainWarnings, type RateChainInput } from "@/lib/rates";

/**
 * Live, non-blocking amber note that flags when entered rates break the
 * Client ≥ Bill ≥ Pay chain (and Candidate ≤ Client). Renders nothing when the
 * rates look fine or aren't comparable yet. See `rateChainWarnings`.
 */
export function RateChainWarning({ rates }: { rates: RateChainInput }) {
  const warnings = rateChainWarnings(rates);
  if (warnings.length === 0) return null;
  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 p-3">
      <p className="text-xs font-medium text-amber-800">Double-check these rates:</p>
      <ul className="mt-1 space-y-0.5 text-xs text-amber-700">
        {warnings.map((w) => (
          <li key={w}>⚠ {w}</li>
        ))}
      </ul>
    </div>
  );
}
