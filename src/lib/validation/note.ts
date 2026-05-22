import { z } from "zod";

export const ENTITY_TYPE_VALUES = [
  "JOB",
  "CANDIDATE",
  "SUBMISSION",
  "INTERVIEW_ROUND",
] as const;

export const noteSchema = z.object({
  entityType: z.enum(ENTITY_TYPE_VALUES),
  entityId: z.string().min(1, "Missing record reference."),
  body: z.string().trim().min(1, "Write a note before saving.").max(5000),
});

export type NoteInput = z.infer<typeof noteSchema>;
