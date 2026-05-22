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

  await prisma.$transaction(async (tx) => {
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

  if (d.entityType === "JOB") revalidatePath(`/jobs/${d.entityId}`);
  else if (d.entityType === "CANDIDATE")
    revalidatePath(`/candidates/${d.entityId}`);
  else if (d.entityType === "SUBMISSION")
    revalidatePath(`/submissions/${d.entityId}`);

  return { ok: true };
}
