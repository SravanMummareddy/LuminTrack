import { prisma } from "@/server/db";
import { requireUser } from "@/lib/session";
import { GLOSSARY, type GlossaryTerm } from "@/lib/glossary";

export type GlossaryRow = GlossaryTerm & { note: string };

/**
 * The curated glossary with the current user's private note merged onto each
 * term. Notes are per-user (keyed by the stable term slug); a term the user
 * hasn't annotated gets an empty note.
 */
export async function getGlossaryWithNotes(): Promise<GlossaryRow[]> {
  const user = await requireUser();
  const notes = await prisma.glossaryNote.findMany({
    where: { userId: user.id },
    select: { term: true, note: true },
  });
  const noteByTerm = new Map(notes.map((n) => [n.term, n.note]));
  return GLOSSARY.map((t) => ({ ...t, note: noteByTerm.get(t.term) ?? "" }));
}
