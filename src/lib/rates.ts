/**
 * Rate-chain checks. In staffing the money flows downhill, each rung keeping a
 * margin:
 *
 *   Client rate (end client releases)
 *     ≥ Bill rate (vendor releases to us — what we actually receive)
 *       ≥ Pay rate (we pay the consultant)
 *
 * The constraint that actually protects our margin is Pay ≤ Bill: we only ever
 * receive the bill rate, so paying above it loses money even if pay is still
 * below the (often-undisclosed) client rate.
 *
 * `rateChainWarnings` returns one human-readable warning per *violated* rung that
 * has both ends filled in. An empty array means "nothing to flag" — including the
 * common case where the client rate is blank (not disclosed) so we can't compare.
 */

export type RateChainInput = {
  payRate?: string | number | null;
  billRate?: string | number | null;
  clientRate?: string | number | null;
};

/** Parse a form value to a positive number, or null when absent/blank/invalid. */
function toPositive(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

function money(n: number): string {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

export function rateChainWarnings(input: RateChainInput): string[] {
  const pay = toPositive(input.payRate);
  const bill = toPositive(input.billRate);
  const client = toPositive(input.clientRate);
  const warnings: string[] = [];

  // We receive the bill rate and pay out the pay rate — pay above bill is a loss.
  if (pay !== null && bill !== null && pay > bill)
    warnings.push(
      `Pay rate (${money(pay)}) is above the Bill rate (${money(bill)}) — the margin would be negative.`,
    );

  // The vendor takes a cut, so the bill rate can't exceed what the client releases.
  if (bill !== null && client !== null && bill > client)
    warnings.push(
      `Bill rate (${money(bill)}) is above the Client rate (${money(client)}).`,
    );

  // No bill rung entered, but pay already exceeds the client rate.
  if (pay !== null && bill === null && client !== null && pay > client)
    warnings.push(
      `Pay rate (${money(pay)}) is above the Client rate (${money(client)}).`,
    );

  return warnings;
}
