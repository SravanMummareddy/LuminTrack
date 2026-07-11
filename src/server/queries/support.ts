import { getScopedPrisma } from "@/lib/session";

/** All support providers for the Settings "Support" tab. */
export async function listSupportProviders() {
  const db = await getScopedPrisma();
  return db.supportProvider.findMany({ orderBy: { name: "asc" } });
}

export type SupportProviderRow = Awaited<
  ReturnType<typeof listSupportProviders>
>[number];

/** Active providers as options for the interview-round support picker. Skills
 *  ride along so the form can hint who supports what. */
export async function listSupportProviderOptions(): Promise<
  { id: string; name: string; skills: string[] }[]
> {
  const db = await getScopedPrisma();
  const rows = await db.supportProvider.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, skills: true },
  });
  return rows;
}
