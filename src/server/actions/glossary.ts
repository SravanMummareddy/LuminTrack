"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db";
import { requireUser } from "@/lib/session";
import { GLOSSARY } from "@/lib/glossary";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/form-state";

const KNOWN_TERMS = new Set(GLOSSARY.map((t) => t.term));

/**
 * Upsert (or clear) the current user's private note against one glossary term.
 * Personal preference data — no audit log. Blank note deletes the row so an
 * un-annotated term stays clean. The term must be a known slug (guards against
 * arbitrary writes from a forged form).
 */
export async function saveGlossaryNote(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const term = String(formData.get("term") ?? "");
  const note = String(formData.get("note") ?? "").trim();

  if (!KNOWN_TERMS.has(term)) return { error: "Unknown glossary term." };

  if (note === "") {
    await prisma.glossaryNote.deleteMany({
      where: { userId: user.id, term },
    });
  } else {
    await prisma.glossaryNote.upsert({
      where: { userId_term: { userId: user.id, term } },
      create: { userId: user.id, term, note },
      update: { note },
    });
  }

  revalidatePath("/settings");
  return {
    ...EMPTY_FORM_STATE,
    ok: true,
    toast: { title: note === "" ? "Note cleared" : "Note saved" },
  };
}
