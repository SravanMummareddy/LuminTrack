import { z } from "zod";

/** candidateId + label for an uploaded résumé (the file is validated separately). */
export const resumeUploadMetaSchema = z.object({
  candidateId: z.string().min(1, "Missing candidate reference."),
  label: z.string().trim().min(1, "Give this resume a label.").max(120),
});

/** Edit only touches the label — an uploaded file can't be swapped in place;
 *  upload a new résumé instead. */
export const resumeLabelSchema = z.object({
  label: z.string().trim().min(1, "Give this resume a label.").max(120),
});

// The file-upload validators are shared with candidate documents; re-exported
// here under résumé-flavoured names so existing importers don't churn.
export {
  UPLOAD_ACCEPT as RESUME_ACCEPT,
  UPLOAD_MAX_BYTES as RESUME_MAX_BYTES,
  uploadFileError as resumeFileError,
} from "./upload-file";
