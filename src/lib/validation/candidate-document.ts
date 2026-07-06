import { z } from "zod";
import { optionalDateTime, optionalText } from "@/lib/validation/common";

const documentCategoryValues = [
  "IDENTITY",
  "WORK_AUTH",
  "EDUCATION",
  "EMPLOYMENT",
  "OTHER",
] as const;

/** Metadata for a document — the uploaded file is validated separately (see
 *  uploadFileError). Used for both create (file required) and edit (metadata
 *  only; the file can't be swapped in place — upload a new document instead). */
export const candidateDocumentSchema = z
  .object({
    candidateId: z.string().min(1, "Missing candidate reference."),
    category: z.enum(documentCategoryValues),
    label: z.string().trim().min(1, "Give this document a label.").max(160),
    issuedAt: optionalDateTime,
    expiresAt: optionalDateTime,
    notes: optionalText,
  })
  .superRefine((value, ctx) => {
    if (value.issuedAt && value.expiresAt && value.expiresAt < value.issuedAt) {
      ctx.addIssue({
        code: "custom",
        path: ["expiresAt"],
        message: "Expiry must be on or after the issue date.",
      });
    }
  });

export type CandidateDocumentInput = z.infer<typeof candidateDocumentSchema>;
