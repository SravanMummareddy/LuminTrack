"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db";
import { requireUser } from "@/lib/session";
import { canManageOrgEntities } from "@/lib/permissions";
import { GLOSSARY, GLOSSARY_CATEGORIES } from "@/lib/glossary";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/form-state";

const BUILT_IN_TERMS = new Set(GLOSSARY.map((t) => t.term));
const BUILT_IN_LABELS = new Set(GLOSSARY.map((t) => t.label.toLowerCase()));
const ALLOWED_CATEGORIES = new Set<string>([...GLOSSARY_CATEGORIES, "Custom"]);
const LABEL_MAX = 60;
const DEFINITION_MAX = 500;

/**
 * Upsert (or clear) the current user's private note against a term. Blank note
 * deletes the row. The term must be a known slug — a built-in OR a live custom
 * term — which guards against a forged form.
 */
export async function saveGlossaryNote(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const term = String(formData.get("term") ?? "");
  const note = String(formData.get("note") ?? "").trim();

  const known =
    BUILT_IN_TERMS.has(term) ||
    (await prisma.customGlossaryTerm.count({
      where: { term, deletedAt: null },
    })) > 0;
  if (!known) return { error: "Unknown glossary term." };

  if (note === "") {
    await prisma.glossaryNote.deleteMany({ where: { userId: user.id, term } });
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

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "term"
  );
}

/** A stable, unique `custom_…` slug (the note anchor). Never collides with a
 *  built-in slug (different prefix) or an existing custom term. */
async function uniqueTerm(label: string): Promise<string> {
  const base = `custom_${slugify(label)}`;
  let term = base;
  let n = 2;
  while ((await prisma.customGlossaryTerm.count({ where: { term } })) > 0) {
    term = `${base}_${n++}`;
  }
  return term;
}

/**
 * Add or edit an org-wide custom glossary term. Managers + team leads only.
 * Category must come from the fixed list (no invented taxonomy); the label is
 * deduped case-insensitively against built-ins and other custom terms.
 *
 * NOTE: this and `deleteCustomGlossaryTerm` write no `Activity` audit row (no
 * glossary relation on the model; a trail would need a schema migration).
 * Manager-gated + soft-deleted, so a documented trade-off — see review IN-03.
 */
export async function saveCustomGlossaryTerm(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!canManageOrgEntities(user))
    return { error: "Only managers and team leads can manage glossary terms." };

  const customId = String(formData.get("customId") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const definition = String(formData.get("definition") ?? "").trim();

  const fieldErrors: Record<string, string> = {};
  if (!label) fieldErrors.label = "Enter a term.";
  else if (label.length > LABEL_MAX)
    fieldErrors.label = `Keep the term under ${LABEL_MAX} characters.`;
  if (!ALLOWED_CATEGORIES.has(category)) fieldErrors.category = "Pick a category.";
  if (!definition) fieldErrors.definition = "Enter a definition.";
  else if (definition.length > DEFINITION_MAX)
    fieldErrors.definition = `Keep the definition under ${DEFINITION_MAX} characters.`;

  // Dedupe the label (case-insensitive) vs built-ins + other live custom terms.
  if (!fieldErrors.label) {
    const low = label.toLowerCase();
    const clash =
      BUILT_IN_LABELS.has(low) ||
      (await prisma.customGlossaryTerm.count({
        where: {
          deletedAt: null,
          label: { equals: label, mode: "insensitive" },
          ...(customId ? { id: { not: customId } } : {}),
        },
      })) > 0;
    if (clash) fieldErrors.label = "A term with that name already exists.";
  }

  if (Object.keys(fieldErrors).length) return { fieldErrors };

  if (customId) {
    // Edit — keep the slug (it's the note anchor); update the rest.
    await prisma.customGlossaryTerm.update({
      where: { id: customId },
      data: { label, category, definition },
    });
  } else {
    await prisma.customGlossaryTerm.create({
      data: {
        term: await uniqueTerm(label),
        label,
        category,
        definition,
        createdById: user.id,
      },
    });
  }

  revalidatePath("/settings");
  return {
    ...EMPTY_FORM_STATE,
    ok: true,
    toast: { title: customId ? "Term updated" : "Term added" },
  };
}

/** Soft-delete a custom glossary term (recoverable; private notes keep their
 *  anchor). Managers + team leads only. */
export async function deleteCustomGlossaryTerm(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!canManageOrgEntities(user))
    return { error: "Only managers and team leads can manage glossary terms." };

  const customId = String(formData.get("customId") ?? "").trim();
  if (!customId) return { error: "Missing term." };

  await prisma.customGlossaryTerm.update({
    where: { id: customId },
    data: { deletedAt: new Date() },
  });

  revalidatePath("/settings");
  return { ...EMPTY_FORM_STATE, ok: true, toast: { title: "Term removed" } };
}
