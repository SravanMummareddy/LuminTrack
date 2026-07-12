import { z } from "zod";

/** C-1 — authentic résumé vs a reformatted marketing version. Defaults to
 *  ORIGINAL when the form omits it. */
export const RESUME_KINDS = ["ORIGINAL", "MARKETING"] as const;
const resumeKind = z.enum(RESUME_KINDS).default("ORIGINAL");

/** candidateId + label + kind for an uploaded résumé (the file is validated separately). */
export const resumeUploadMetaSchema = z.object({
  candidateId: z.string().min(1, "Missing candidate reference."),
  label: z.string().trim().min(1, "Give this resume a label.").max(120),
  kind: resumeKind,
});

/** Edit touches the label + kind — an uploaded file can't be swapped in place;
 *  upload a new résumé instead. */
export const resumeLabelSchema = z.object({
  label: z.string().trim().min(1, "Give this resume a label.").max(120),
  kind: resumeKind,
});

// The file-upload validators are shared with candidate documents; re-exported
// here under résumé-flavoured names so existing importers don't churn.
export {
  UPLOAD_ACCEPT as RESUME_ACCEPT,
  UPLOAD_MAX_BYTES as RESUME_MAX_BYTES,
  uploadFileError as resumeFileError,
} from "./upload-file";
