"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { del } from "@vercel/blob";
import { prisma } from "@/server/db";
import { requireUser } from "@/lib/session";
import { hasFullAccess } from "@/lib/permissions";
import { logActivity } from "@/server/activity";
import { ensureBenchForCandidate } from "@/server/bench-lifecycle";
import { candidateSchema, type CandidateInput } from "@/lib/validation/candidate";
import { toFieldErrors } from "@/lib/validation/common";
import {
  findCandidateDuplicates,
  type CandidateDuplicate,
} from "@/server/queries/candidates";
import type { FormState } from "@/lib/form-state";

function parseSkills(raw: FormDataEntryValue | null): string[] {
  if (typeof raw !== "string") return [];
  return [...new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))];
}

// §E2 — tags are stored as a normalized lowercase set so filters can match
// case-insensitively without per-query LOWER() work.
function parseTags(raw: FormDataEntryValue | null): string[] {
  if (typeof raw !== "string") return [];
  return [
    ...new Set(
      raw
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

function readCandidate(formData: FormData) {
  return candidateSchema.safeParse({
    fullName: formData.get("fullName") ?? "",
    email: formData.get("email") ?? "",
    phone: formData.get("phone") ?? "",
    currentLocation: formData.get("currentLocation") ?? "",
    workAuthorization: formData.get("workAuthorization") ?? "",
    totalExperienceYears: formData.get("totalExperienceYears") ?? "",
    currentCompany: formData.get("currentCompany") ?? "",
    skills: parseSkills(formData.get("skills")),
    // Featured (≤3) — form sends them as repeated `featuredSkills` entries.
    featuredSkills: formData.getAll("featuredSkills").map(String).filter(Boolean),
    linkedinUrl: formData.get("linkedinUrl") ?? "",
    notes: formData.get("notes") ?? "",
    isActive: formData.get("isActive") != null,
    status: formData.get("status") ?? "AVAILABLE",
    tags: parseTags(formData.get("tags")),
    lastContactedAt: formData.get("lastContactedAt") ?? "",
    source: formData.get("source") ?? "",
  });
}

/** Maps validated input to a Prisma data object (undefined optionals become explicit nulls). */
function candidateData(d: CandidateInput) {
  return {
    fullName: d.fullName,
    email: d.email ?? null,
    phone: d.phone ?? null,
    currentLocation: d.currentLocation ?? null,
    workAuthorization: d.workAuthorization ?? null,
    totalExperienceYears: d.totalExperienceYears ?? null,
    currentCompany: d.currentCompany ?? null,
    skills: d.skills,
    featuredSkills: d.featuredSkills,
    linkedinUrl: d.linkedinUrl ?? null,
    notes: d.notes ?? null,
    isActive: d.isActive,
    status: d.status,
    tags: d.tags,
    lastContactedAt: d.lastContactedAt ?? null,
    source: d.source ?? null,
  };
}

function duplicateMessage(dups: CandidateDuplicate[]): string {
  const names = dups.map((d) => d.fullName).join(", ");
  return `A candidate with this email or phone already exists (${names}). Save anyway, or change the contact details.`;
}

export async function createCandidate(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = readCandidate(formData);
  if (!parsed.success)
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  const d = parsed.data;

  if (formData.get("confirmed") !== "true") {
    const dups = await findCandidateDuplicates({ email: d.email, phone: d.phone });
    if (dups.length) return { needsConfirm: true, error: duplicateMessage(dups) };
  }

  const candidate = await prisma.$transaction(async (tx) => {
    const created = await tx.candidate.create({
      data: { ...candidateData(d), createdById: user.id },
    });
    await logActivity(tx, {
      entityType: "CANDIDATE",
      action: "CANDIDATE_CREATED",
      description: `Candidate "${created.fullName}" created`,
      performedById: user.id,
      candidateId: created.id,
    });
    // Lifecycle bench: every available candidate is on the bench (being
    // marketed) from creation. Skip retired/non-available ones.
    if (created.status === "AVAILABLE" && created.isActive) {
      await ensureBenchForCandidate(tx, {
        candidateId: created.id,
        fullName: created.fullName,
        email: created.email,
        phone: created.phone,
        currentLocation: created.currentLocation,
        workAuthorization: created.workAuthorization,
        skills: created.skills,
        recruiterId: user.role === "RECRUITER" ? user.id : null,
        performedById: user.id,
      });
    }
    return created;
  });

  revalidatePath("/candidates");
  redirect(`/candidates/${candidate.id}`);
}

export async function updateCandidate(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const candidateId = String(formData.get("id") ?? "").trim();
  if (!candidateId) return { error: "Missing candidate reference." };

  const parsed = readCandidate(formData);
  if (!parsed.success)
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  const d = parsed.data;

  const existing = await prisma.candidate.findUnique({ where: { id: candidateId } });
  if (!existing) return { error: "This candidate no longer exists." };

  // Guard: don't let a manual status edit clobber PLACED while the candidate
  // still has an ACTIVE/EXTENDED placement. The lifecycle helper owns PLACED ↔
  // AVAILABLE transitions; recruiters must end the placement first.
  if (existing.status === "PLACED" && d.status !== "PLACED") {
    const activePlacements = await prisma.placement.count({
      where: {
        candidateId,
        status: { in: ["ACTIVE", "EXTENDED"] },
      },
    });
    if (activePlacements > 0) {
      return {
        error:
          "This candidate has an active placement. End the placement first, then change their status.",
        fieldErrors: { status: "End the active placement first." },
      };
    }
  }

  if (formData.get("confirmed") !== "true") {
    const dups = await findCandidateDuplicates({
      email: d.email,
      phone: d.phone,
      excludeId: candidateId,
    });
    if (dups.length) return { needsConfirm: true, error: duplicateMessage(dups) };
  }

  // Record which fields changed, for a meaningful audit entry.
  const changed: string[] = [];
  const compare = (label: string, before: unknown, after: unknown) => {
    if (String(before ?? "") !== String(after ?? "")) changed.push(label);
  };
  compare("name", existing.fullName, d.fullName);
  compare("email", existing.email, d.email);
  compare("phone", existing.phone, d.phone);
  compare("location", existing.currentLocation, d.currentLocation);
  compare("work authorization", existing.workAuthorization, d.workAuthorization);
  compare("experience", existing.totalExperienceYears?.toString(), d.totalExperienceYears);
  compare("current company", existing.currentCompany, d.currentCompany);
  compare("skills", existing.skills.join(", "), d.skills.join(", "));
  compare("featured skills", existing.featuredSkills.join(", "), d.featuredSkills.join(", "));
  compare("LinkedIn", existing.linkedinUrl, d.linkedinUrl);
  compare("notes", existing.notes, d.notes);
  compare("active", existing.isActive, d.isActive);
  compare("engagement status", existing.status, d.status);
  compare("tags", existing.tags.join(", "), d.tags.join(", "));
  compare(
    "last contacted",
    existing.lastContactedAt?.toISOString() ?? "",
    d.lastContactedAt?.toISOString() ?? "",
  );
  compare("source", existing.source, d.source);

  await prisma.$transaction(async (tx) => {
    await tx.candidate.update({
      where: { id: candidateId },
      data: candidateData(d),
    });
    if (changed.length)
      await logActivity(tx, {
        entityType: "CANDIDATE",
        action: "CANDIDATE_UPDATED",
        description: `Candidate details updated (${changed.join(", ")})`,
        newValue: changed.join(", "),
        performedById: user.id,
        candidateId,
      });
  });

  revalidatePath("/candidates");
  revalidatePath(`/candidates/${candidateId}`);
  redirect(`/candidates/${candidateId}`);
}

/**
 * §E3 — bumps `lastContactedAt` to now and logs an audit row. Surfaced as a
 * one-click "Mark contacted" button on candidate detail; lets recruiters log
 * a touch without having to open the edit form.
 */
export async function markCandidateContacted(formData: FormData): Promise<void> {
  const user = await requireUser();
  const candidateId = String(formData.get("id") ?? "").trim();
  if (!candidateId) return;
  await prisma.$transaction(async (tx) => {
    await tx.candidate.update({
      where: { id: candidateId },
      data: { lastContactedAt: new Date() },
    });
    await logActivity(tx, {
      entityType: "CANDIDATE",
      action: "CANDIDATE_CONTACTED",
      description: "Marked contacted",
      performedById: user.id,
      candidateId,
    });
  });
  revalidatePath(`/candidates/${candidateId}`);
}

/**
 * One-click archive / restore — the everyday, reversible "remove from view".
 * Flips Candidate.isActive; keeps all data. Distinct from eraseCandidate.
 */
export async function setCandidateArchived(formData: FormData): Promise<void> {
  const user = await requireUser();
  const candidateId = String(formData.get("id") ?? "").trim();
  const archived = formData.get("archived") === "1";
  if (!candidateId) return;
  await prisma.$transaction(async (tx) => {
    await tx.candidate.update({
      where: { id: candidateId },
      data: { isActive: !archived },
    });
    await logActivity(tx, {
      entityType: "CANDIDATE",
      action: "CANDIDATE_UPDATED",
      description: archived ? "Archived candidate" : "Restored candidate",
      performedById: user.id,
      candidateId,
    });
  });
  revalidatePath(`/candidates/${candidateId}`);
  revalidatePath("/candidates");
}

/**
 * Right-to-be-forgotten. Blanks the candidate's personal fields and DELETES
 * their résumé + document rows and the Blob files. Submissions / placements /
 * interviews are left untouched — they keep pointing at the now-anonymized
 * record, so history and recruiter metrics are unaffected. Admin/manager only,
 * gated behind typing the candidate's exact name. Irreversible.
 */
export async function eraseCandidate(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!hasFullAccess(user))
    return { error: "Only managers and team leads can erase a candidate." };

  const candidateId = String(formData.get("id") ?? "").trim();
  const confirmName = String(formData.get("confirmName") ?? "").trim();

  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    select: {
      seq: true,
      fullName: true,
      erasedAt: true,
      resumes: { select: { blobUrl: true } },
      documents: { select: { blobUrl: true } },
    },
  });
  if (!candidate) return { error: "Candidate not found." };
  if (candidate.erasedAt)
    return { error: "This candidate has already been erased." };
  if (confirmName !== candidate.fullName)
    return {
      fieldErrors: {
        confirmName: "Type the candidate's name exactly to confirm.",
      },
    };

  const displayId = `CAND-${String(candidate.seq).padStart(3, "0")}`;
  const blobUrls = [
    ...candidate.resumes.map((r) => r.blobUrl),
    ...candidate.documents.map((d) => d.blobUrl),
  ].filter((u): u is string => Boolean(u));

  // Redact the record + drop the file rows + audit, atomically. The candidate
  // row is kept (anonymized) so linked submissions/placements stay intact.
  await prisma.$transaction(async (tx) => {
    await tx.candidateResume.deleteMany({ where: { candidateId } });
    await tx.candidateDocument.deleteMany({ where: { candidateId } });
    await tx.candidate.update({
      where: { id: candidateId },
      data: {
        fullName: `Erased candidate #${candidate.seq}`,
        email: null,
        phone: null,
        currentLocation: null,
        workAuthorization: null,
        totalExperienceYears: null,
        currentCompany: null,
        skills: [],
        featuredSkills: [],
        linkedinUrl: null,
        resumeBlobUrl: null,
        notes: null,
        tags: [],
        lastContactedAt: null,
        source: null,
        status: "DO_NOT_CONTACT",
        isActive: false,
        erasedAt: new Date(),
      },
    });
    await logActivity(tx, {
      entityType: "CANDIDATE",
      action: "CANDIDATE_ERASED",
      description: `Erased personal data + ${blobUrls.length} file(s) for ${displayId}`,
      performedById: user.id,
      candidateId,
    });
  });

  // Shred the actual files. Best-effort, AFTER the DB commit — a failed blob
  // delete leaves a harmless orphan rather than blocking the erasure.
  await Promise.allSettled(blobUrls.map((u) => del(u)));

  revalidatePath("/candidates");
  redirect(`/candidates/${candidateId}`);
}
