import { requireUser, getScopedPrisma } from "@/lib/session";
import { formatDate } from "@/lib/format";
import { GLOSSARY, type GlossaryTerm } from "@/lib/glossary";

export type GlossaryRow = GlossaryTerm & {
  note: string;
  /** Custom (admin-added) terms carry a "Custom" badge + provenance + admin
   *  edit/delete; built-ins are read-only. */
  isCustom: boolean;
  customId?: string;
  customSeq?: number;
  addedBy?: string;
  addedAt?: string;
};

/**
 * The full glossary — the curated code list unioned with org-wide custom terms
 * (admin-added, soft-deleted excluded) — each with the current user's private
 * note merged on by the stable term slug.
 */
export async function getGlossaryWithNotes(): Promise<GlossaryRow[]> {
  const db = await getScopedPrisma();
  const user = await requireUser();
  const [notes, custom] = await Promise.all([
    db.glossaryNote.findMany({
      where: { userId: user.id },
      select: { term: true, note: true },
    }),
    db.customGlossaryTerm.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        seq: true,
        term: true,
        label: true,
        category: true,
        definition: true,
        createdAt: true,
        createdBy: { select: { fullName: true } },
      },
    }),
  ]);
  const noteByTerm = new Map(notes.map((n) => [n.term, n.note]));

  const builtIn: GlossaryRow[] = GLOSSARY.map((t) => ({
    ...t,
    note: noteByTerm.get(t.term) ?? "",
    isCustom: false,
  }));
  const customRows: GlossaryRow[] = custom.map((c) => ({
    term: c.term,
    label: c.label,
    category: c.category,
    definition: c.definition,
    note: noteByTerm.get(c.term) ?? "",
    isCustom: true,
    customId: c.id,
    customSeq: c.seq,
    addedBy: c.createdBy.fullName,
    addedAt: formatDate(c.createdAt),
  }));
  return [...builtIn, ...customRows];
}
