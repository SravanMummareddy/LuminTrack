import JSZip from "jszip";
import { get } from "@vercel/blob";
import { CANDIDATE_ARCHIVE_PREFIX } from "@/server/candidate-erase";
import { JOB_ARCHIVE_PREFIX } from "@/server/job-erase";

/** How many submission lines the in-app preview shows before "+N more". */
const PREVIEW_SUBMISSION_LIMIT = 4;

export type CandidateArchiveSummary = {
  kind: "candidate";
  displayId: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  currentLocation: string | null;
  workAuthorization: string | null;
  status: string | null;
  technology: string | null;
  currentCompany: string | null;
  totalExperienceYears: number | null;
  realTimeExperienceYears: number | null;
  featuredSkills: string[];
  submissionsCount: number;
  submissions: {
    id: string;
    job: string | null;
    client: string | null;
    status: string;
  }[];
  resumesCount: number;
  documentsCount: number;
};

export type JobArchiveSummary = {
  kind: "job";
  displayId: string;
  title: string;
  status: string | null;
  client: string | null;
  vendor: string | null;
  location: string | null;
  positions: number | null;
  clientRate: number | null;
  submissionsCount: number;
  submissions: { id: string; candidate: string; status: string }[];
  requirementsCount: number;
};

export type ArchiveSummary = CandidateArchiveSummary | JobArchiveSummary;

/** Fetch the stored backup zip and load it. Returns null if the blob is gone or
 *  the payload isn't a readable zip (e.g. a truncated write). */
async function loadZip(pathname: string): Promise<JSZip | null> {
  const result = await get(pathname, { access: "private" });
  if (result === null || result.statusCode !== 200) return null;
  const buf = Buffer.from(await new Response(result.stream).arrayBuffer());
  try {
    // Archive zips are NOT gzipped (a zip is already compressed) — unlike the
    // résumé/document blobs — so load the bytes directly.
    return await JSZip.loadAsync(buf);
  } catch {
    return null;
  }
}

/** JSON.parse a zip entry, tolerating a missing file (returns fallback). */
async function readJson<T>(zip: JSZip, name: string, fallback: T): Promise<T> {
  const file = zip.file(name);
  if (!file) return fallback;
  try {
    return JSON.parse(await file.async("string")) as T;
  } catch {
    return fallback;
  }
}

/** Count the real files under a zip folder (ignoring the folder entry itself). */
function countFolder(zip: JSZip, folder: string): number {
  return Object.values(zip.files).filter(
    (f) => !f.dir && f.name.startsWith(folder),
  ).length;
}

/**
 * Read a permanent-delete backup zip and return a compact, admin-facing summary
 * so the recycle bin can show *what* a backup contains before it's removed for
 * good — without forcing a download. The zip is the privacy-correct source of
 * truth (the DB row was scrubbed on erase). Kind is inferred from the blob
 * prefix. Returns null if the blob is missing/unreadable.
 */
export async function readArchiveSummary(
  pathname: string,
): Promise<ArchiveSummary | null> {
  const zip = await loadZip(pathname);
  if (!zip) return null;

  if (pathname.startsWith(JOB_ARCHIVE_PREFIX)) {
    const job = await readJson<Record<string, unknown>>(zip, "job.json", {});
    const submissions = await readJson<
      { id: string; candidate: string; status: string }[]
    >(zip, "submissions.json", []);
    const requirements = await readJson<unknown[]>(
      zip,
      "vendor-requirements.json",
      [],
    );
    return {
      kind: "job",
      displayId: String(job.displayId ?? "JOB"),
      title: String(job.title ?? "(unknown job)"),
      status: (job.status as string) ?? null,
      client: (job.client as string) ?? null,
      vendor: (job.vendor as string) ?? null,
      location: (job.location as string) ?? null,
      positions: typeof job.positions === "number" ? job.positions : null,
      clientRate: typeof job.clientRate === "number" ? job.clientRate : null,
      submissionsCount: submissions.length,
      submissions: submissions.slice(0, PREVIEW_SUBMISSION_LIMIT),
      requirementsCount: requirements.length,
    };
  }

  if (pathname.startsWith(CANDIDATE_ARCHIVE_PREFIX)) {
    const profile = await readJson<Record<string, unknown>>(
      zip,
      "profile.json",
      {},
    );
    const submissions = await readJson<
      { id: string; job: string | null; client: string | null; status: string }[]
    >(zip, "submissions.json", []);
    const featuredSkills = Array.isArray(profile.featuredSkills)
      ? (profile.featuredSkills as string[])
      : [];
    return {
      kind: "candidate",
      displayId: String(profile.displayId ?? "CAND"),
      fullName: String(profile.fullName ?? "(unknown candidate)"),
      email: (profile.email as string) ?? null,
      phone: (profile.phone as string) ?? null,
      currentLocation: (profile.currentLocation as string) ?? null,
      workAuthorization: (profile.workAuthorization as string) ?? null,
      status: (profile.status as string) ?? null,
      technology: (profile.technology as string) ?? null,
      currentCompany: (profile.currentCompany as string) ?? null,
      totalExperienceYears:
        typeof profile.totalExperienceYears === "number"
          ? profile.totalExperienceYears
          : null,
      realTimeExperienceYears:
        typeof profile.realTimeExperienceYears === "number"
          ? profile.realTimeExperienceYears
          : null,
      featuredSkills,
      submissionsCount: submissions.length,
      submissions: submissions.slice(0, PREVIEW_SUBMISSION_LIMIT),
      resumesCount: countFolder(zip, "resumes/"),
      documentsCount: countFolder(zip, "documents/"),
    };
  }

  return null;
}
