import type { Prisma } from "@/generated/prisma/client";
import type { ActivityAction, EntityType } from "@/generated/prisma/enums";

export type LogActivityInput = {
  entityType: EntityType;
  action: ActivityAction;
  description: string;
  performedById: string;
  oldValue?: string | null;
  newValue?: string | null;
  // Optional context for a status change — see the Activity model.
  eventAt?: Date | null;
  note?: string | null;
  reason?: string | null;
  // Exactly one of these should be set, matching `entityType`.
  jobId?: string;
  candidateId?: string;
  submissionId?: string;
  interviewRoundId?: string;
  benchConsultantId?: string;
  requirementId?: string;
};

/**
 * Writes one audit-timeline entry. Always call this with a transaction client
 * (`prisma.$transaction(async (tx) => ...)`) alongside the data change it
 * describes, so the activity row and the change commit atomically.
 */
export function logActivity(db: Prisma.TransactionClient, input: LogActivityInput) {
  return db.activity.create({
    data: {
      entityType: input.entityType,
      action: input.action,
      description: input.description,
      oldValue: input.oldValue ?? null,
      newValue: input.newValue ?? null,
      eventAt: input.eventAt ?? null,
      note: input.note ?? null,
      reason: input.reason ?? null,
      performedById: input.performedById,
      jobId: input.jobId ?? null,
      candidateId: input.candidateId ?? null,
      submissionId: input.submissionId ?? null,
      interviewRoundId: input.interviewRoundId ?? null,
      benchConsultantId: input.benchConsultantId ?? null,
      requirementId: input.requirementId ?? null,
    },
  });
}
