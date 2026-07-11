import { getScopedPrisma } from "@/lib/session";
import type { Prisma } from "@/generated/prisma/client";
import type { EntityType } from "@/generated/prisma/enums";

/** Notes attached to one entity (polymorphic — spec §7.9), newest first. */
export async function getNotesFor(entityType: EntityType, id: string) {
  const db = await getScopedPrisma();
  const where: Prisma.NoteWhereInput =
    entityType === "JOB"
      ? { jobId: id }
      : entityType === "CANDIDATE"
        ? { candidateId: id }
        : entityType === "SUBMISSION"
          ? { submissionId: id }
          : { interviewRoundId: id };

  return db.note.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { createdBy: { select: { fullName: true } } },
  });
}

export type NoteEntry = Awaited<ReturnType<typeof getNotesFor>>[number];
