import JSZip from "jszip";
import { gunzipSync } from "node:zlib";
import { get } from "@vercel/blob";
import { prisma } from "@/server/db";

/** File extension inferred from the stored content type (blobs don't keep a name). */
function extFor(contentType: string | null | undefined): string {
  if (!contentType) return "";
  if (contentType.includes("pdf")) return ".pdf";
  if (contentType.includes("wordprocessingml")) return ".docx";
  if (contentType.includes("msword")) return ".doc";
  return "";
}

/** Filesystem-safe zip entry name. */
function safeName(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80) || "file";
}

/**
 * Fetch a private blob and return the ORIGINAL bytes. Blobs are stored
 * gzip-compressed (see uploadPrivateFile), so we inflate here — the zip should
 * hold usable PDFs/Docs, not gzipped payloads. Returns null if the blob is gone.
 */
async function fetchOriginal(blobPathname: string): Promise<Buffer | null> {
  const result = await get(blobPathname, { access: "private" });
  if (!result || result.statusCode !== 200) return null;
  const raw = Buffer.from(await new Response(result.stream).arrayBuffer());
  try {
    return gunzipSync(raw);
  } catch {
    // Defensive: if a blob somehow isn't gzipped, hand back what we got.
    return raw;
  }
}

/**
 * Builds a downloadable zip archive of everything personal about a candidate —
 * their profile, a summary of their submissions, and the actual résumé +
 * document files. Used as the "download before you erase" safety net for the
 * right-to-be-forgotten flow. Returns null if the candidate doesn't exist.
 */
export async function buildCandidateArchive(
  candidateId: string,
): Promise<{ zip: Buffer; candidateName: string; displayId: string } | null> {
  const c = await prisma.candidate.findUnique({
    where: { id: candidateId },
    include: {
      resumes: true,
      documents: true,
      createdBy: { select: { fullName: true } },
      submissions: {
        orderBy: { submittedAt: "desc" },
        select: {
          seq: true,
          status: true,
          submittedAt: true,
          job: {
            select: {
              title: true,
              client: { select: { name: true } },
              vendor: { select: { name: true } },
            },
          },
        },
      },
    },
  });
  if (!c) return null;

  const displayId = `CAND-${String(c.seq).padStart(3, "0")}`;
  const zip = new JSZip();

  const profile = {
    displayId,
    fullName: c.fullName,
    email: c.email,
    phone: c.phone,
    currentLocation: c.currentLocation,
    workAuthorization: c.workAuthorization,
    totalExperienceYears:
      c.totalExperienceYears != null ? Number(c.totalExperienceYears) : null,
    realTimeExperienceYears:
      c.realTimeExperienceYears != null
        ? Number(c.realTimeExperienceYears)
        : null,
    technology: c.technology,
    currentCompany: c.currentCompany,
    skills: c.skills,
    featuredSkills: c.featuredSkills,
    linkedinUrl: c.linkedinUrl,
    notes: c.notes,
    tags: c.tags,
    source: c.source,
    status: c.status,
    lastContactedAt: c.lastContactedAt,
    addedBy: c.createdBy.fullName,
    createdAt: c.createdAt,
    exportedAt: new Date().toISOString(),
  };
  zip.file("profile.json", JSON.stringify(profile, null, 2));

  const submissions = c.submissions.map((s) => ({
    id: `SUB-${s.seq}`,
    status: s.status,
    submittedAt: s.submittedAt,
    job: s.job.title,
    client: s.job.client?.name ?? null,
    vendor: s.job.vendor?.name ?? null,
  }));
  zip.file("submissions.json", JSON.stringify(submissions, null, 2));

  // Fetch every file's bytes in parallel — a candidate can have several
  // résumés + documents and each is an independent Blob round-trip.
  const docFolder = zip.folder("documents");
  await Promise.all(
    c.documents
      .filter((d) => d.blobPathname)
      .map(async (d) => {
        const buf = await fetchOriginal(d.blobPathname!);
        if (buf)
          docFolder?.file(
            `${safeName(`${d.category}-${d.label}`)}${extFor(d.contentType)}`,
            buf,
          );
      }),
  );

  const resFolder = zip.folder("resumes");
  await Promise.all(
    c.resumes
      .filter((r) => r.blobPathname)
      .map(async (r) => {
        const buf = await fetchOriginal(r.blobPathname!);
        if (buf) resFolder?.file(`${safeName(r.label)}${extFor(r.contentType)}`, buf);
      }),
  );

  const zipBuf = await zip.generateAsync({ type: "nodebuffer" });
  return { zip: zipBuf, candidateName: c.fullName, displayId };
}
