import { prisma } from "@/server/db";
import {
  LOOKUP_DEFAULTS,
  mergeLookupValues,
  type LookupCategory,
} from "@/lib/lookups";

/** The dropdown values for a category: curated defaults ∪ learned values. */
export async function listLookupValues(
  category: LookupCategory,
): Promise<string[]> {
  const rows = await prisma.lookupOption.findMany({
    where: { category },
    select: { value: true },
    orderBy: { value: "asc" },
  });
  return mergeLookupValues(
    LOOKUP_DEFAULTS[category],
    rows.map((r) => r.value),
  );
}
