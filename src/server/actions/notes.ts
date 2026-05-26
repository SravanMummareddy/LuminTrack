"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db";
import { requireUser } from "@/lib/session";
import { logActivity } from "@/server/activity";
import { noteSchema } from "@/lib/validation/note";
import { toFieldErrors } from "@/lib/validation/common";
import type { FormState } from "@/lib/form-state";

export async function createNote(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = noteSchema.safeParse({
    entityType: formData.get("entityType") ?? "",
    entityId: formData.get("entityId") ?? "",
    body: formData.get("body") ?? "",
  });
  if (!parsed.success)
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  const d = parsed.data;

  // Set the one polymorphic FK that matches the entity type.
  const fk = {
    jobId: d.entityType === "JOB" ? d.entityId : undefined,
    candidateId: d.entityType === "CANDIDATE" ? d.entityId : undefined,
    submissionId: d.entityType === "SUBMISSION" ? d.entityId : undefined,
    interviewRoundId:
      d.entityType === "INTERVIEW_ROUND" ? d.entityId : undefined,
  };

  const snippet = d.body.length > 80 ? `${d.body.slice(0, 80)}…` : d.body;

  try {
    await prisma.$transaction(async (tx) => {
      // Verify the polymorphic target actually exists inside the same
      // transaction — without this, a forged entityId would create an orphan
      // note (the FK columns are independent nullable scalars, not enforced
      // pairs with entityType).
      const exists =
        d.entityType === "JOB"
          ? await tx.job.findUnique({
              where: { id: d.entityId },
              select: { id: true },
            })
          : d.entityType === "CANDIDATE"
            ? await tx.candidate.findUnique({
                where: { id: d.entityId },
                select: { id: true },
              })
            : d.entityType === "SUBMISSION"
              ? await tx.submission.findUnique({
                  where: { id: d.entityId },
                  select: { id: true },
                })
              : await tx.interviewRound.findUnique({
                  where: { id: d.entityId },
                  select: { id: true },
                });
      if (!exists) throw new Error("ENTITY_NOT_FOUND");

      await tx.note.create({
        data: {
          entityType: d.entityType,
          body: d.body,
          createdById: user.id,
          ...fk,
        },
      });
      await logActivity(tx, {
        entityType: d.entityType,
        action: "NOTE_ADDED",
        description: `Note added: "${snippet}"`,
        performedById: user.id,
        ...fk,
      });
    });
  } catch (err) {
    if (err instanceof Error && err.message === "ENTITY_NOT_FOUND") {
      return { error: "The item this note was attached to no longer exists." };
    }
    throw err;
  }

  if (d.entityType === "JOB") revalidatePath(`/jobs/${d.entityId}`);
  else if (d.entityType === "CANDIDATE")
    revalidatePath(`/candidates/${d.entityId}`);
  else if (d.entityType === "SUBMISSION")
    revalidatePath(`/submissions/${d.entityId}`);

  return { ok: true };
}
