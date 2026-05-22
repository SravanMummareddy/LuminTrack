import { prisma } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import type { EntityType } from "@/generated/prisma/enums";

/** Notes attached to one entity (polymorphic — spec §7.9), newest first. */
export function getNotesFor(entityType: EntityType, id: string) {
  const where: Prisma.NoteWhereInput =
    entityType === "JOB"
      ? { jobId: id }
      : entityType === "CANDIDATE"
        ? { candidateId: id }
        : entityType === "SUBMISSION"
          ? { submissionId: id }
          : { interviewRoundId: id };

  return prisma.note.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { createdBy: { select: { fullName: true } } },
  });
}

export type NoteEntry = Awaited<ReturnType<typeof getNotesFor>>[number];
