import type { Prisma } from "@/generated/prisma/client";
import { LOOKUP_DEFAULTS, type LookupCategory } from "@/lib/lookups";

/**
 * Remember a free-text value for a category so it reappears in the dropdown
 * next time (the "store for future reference" behaviour). No-op for blanks or
 * values already in the curated defaults (case-insensitive). Idempotent upsert
 * on the (category, value) unique key. Call inside the action's transaction.
 */
export async function rememberLookup(
  tx: Prisma.TransactionClient,
  category: LookupCategory,
  value: string | null | undefined,
): Promise<void> {
  const v = value?.trim();
  if (!v) return;
  if (LOOKUP_DEFAULTS[category].some((d) => d.toLowerCase() === v.toLowerCase()))
    return;
  await tx.lookupOption.upsert({
    where: { category_value: { category, value: v } },
    create: { category, value: v },
    update: {},
  });
}
