import type { Tx } from "@/server/db";
import { LOOKUP_DEFAULTS, type LookupCategory } from "@/lib/lookups";

/**
 * Remember a free-text value for a category so it reappears in the dropdown
 * next time (the "store for future reference" behaviour). No-op for blanks or
 * values already in the curated defaults (case-insensitive). Idempotent upsert
 * on the per-org (organizationId, category, value) unique key. Call inside the
 * action's transaction; pass the acting user's `orgId` (a learned value must not
 * leak into another tenant's dropdowns).
 */
export async function rememberLookup(
  tx: Tx,
  orgId: string,
  category: LookupCategory,
  value: string | null | undefined,
): Promise<void> {
  const v = value?.trim();
  if (!v) return;
  if (LOOKUP_DEFAULTS[category].some((d) => d.toLowerCase() === v.toLowerCase()))
    return;
  await tx.lookupOption.upsert({
    where: {
      organizationId_category_value: { organizationId: orgId, category, value: v },
    },
    create: { organizationId: orgId, category, value: v },
    update: {},
  });
}
