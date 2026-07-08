import JSZip from "jszip";
import { prisma } from "@/server/db";

/**
 * Builds a downloadable zip archive of a job requisition — the requisition
 * fields plus a summary of its submissions and vendor requirements. This is the
 * "back it up before you erase" safety net for the job trash/erase flow (mirrors
 * buildCandidateArchive). Jobs have no uploaded files, so it's pure JSON.
 * Returns null if the job doesn't exist.
 */
export async function buildJobArchive(
  jobId: string,
): Promise<{ zip: Buffer; jobTitle: string; displayId: string } | null> {
  const j = await prisma.job.findUnique({
    where: { id: jobId },
    include: {
      client: { select: { name: true } },
      vendor: { select: { name: true } },
      submissions: {
        orderBy: { submittedAt: "desc" },
        select: {
          seq: true,
          status: true,
          submittedAt: true,
          candidate: { select: { fullName: true } },
        },
      },
      vendorRequirements: {
        select: { seq: true, status: true, payRate: true, billRate: true },
      },
    },
  });
  if (!j) return null;

  const displayId = `JOB-${String(j.seq).padStart(5, "0")}`;
  const zip = new JSZip();

  const job = {
    displayId,
    title: j.title,
    status: j.status,
    client: j.client?.name ?? null,
    vendor: j.vendor?.name ?? null,
    location: j.location,
    clientRate: j.clientRate != null ? Number(j.clientRate) : null,
    positions: j.positions,
    description: j.description,
    notes: j.notes,
    createdAt: j.createdAt,
    exportedAt: new Date().toISOString(),
  };
  zip.file("job.json", JSON.stringify(job, null, 2));

  zip.file(
    "submissions.json",
    JSON.stringify(
      j.submissions.map((s) => ({
        id: `SUB-${s.seq}`,
        status: s.status,
        submittedAt: s.submittedAt,
        candidate: s.candidate.fullName,
      })),
      null,
      2,
    ),
  );

  zip.file(
    "vendor-requirements.json",
    JSON.stringify(
      j.vendorRequirements.map((v) => ({
        id: `VPR-${v.seq}`,
        status: v.status,
        payRate: v.payRate != null ? Number(v.payRate) : null,
        billRate: v.billRate != null ? Number(v.billRate) : null,
      })),
      null,
      2,
    ),
  );

  const zipBuf = await zip.generateAsync({ type: "nodebuffer" });
  return { zip: zipBuf, jobTitle: j.title, displayId };
}
