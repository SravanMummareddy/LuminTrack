"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { requireUser } from "@/lib/session";
import { hasFullAccess } from "@/lib/permissions";
import { logActivity } from "@/server/activity";
import {
  hardEraseCandidate,
  CANDIDATE_TRASH_RETENTION_DAYS,
} from "@/server/candidate-erase";
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
 * Flips Candidate.isActive; keeps all data. Distinct from trashing/erasing.
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
 * Move a candidate to trash: hidden everywhere and scheduled for permanent
 * erasure after CANDIDATE_TRASH_RETENTION_DAYS. Fully reversible via
 * restoreCandidateFromTrash until the retention window lapses. Admin/manager
 * only. Nothing is redacted or shredded yet — that's the scheduled job's job.
 */
export async function trashCandidate(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!hasFullAccess(user))
    return { error: "Only managers and team leads can delete a candidate." };

  const candidateId = String(formData.get("id") ?? "").trim();
  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    select: { deletedAt: true, erasedAt: true },
  });
  if (!candidate) return { error: "Candidate not found." };
  if (candidate.erasedAt)
    return { error: "This candidate has already been erased." };
  if (candidate.deletedAt)
    return { error: "This candidate is already in trash." };

  const purgeOn = new Date(
    Date.now() + CANDIDATE_TRASH_RETENTION_DAYS * 86_400_000,
  );
  await prisma.$transaction(async (tx) => {
    await tx.candidate.update({
      where: { id: candidateId },
      data: { deletedAt: new Date(), isActive: false },
    });
    await logActivity(tx, {
      entityType: "CANDIDATE",
      action: "CANDIDATE_UPDATED",
      description: `Moved to trash — auto-erases ${purgeOn.toISOString().slice(0, 10)}`,
      performedById: user.id,
      candidateId,
    });
  });

  revalidatePath("/candidates");
  redirect(`/candidates/${candidateId}`);
}

/** Restore a trashed candidate before the retention window lapses. */
export async function restoreCandidateFromTrash(
  formData: FormData,
): Promise<void> {
  const user = await requireUser();
  if (!hasFullAccess(user)) return;
  const candidateId = String(formData.get("id") ?? "").trim();
  if (!candidateId) return;
  await prisma.$transaction(async (tx) => {
    await tx.candidate.update({
      where: { id: candidateId },
      data: { deletedAt: null, isActive: true },
    });
    await logActivity(tx, {
      entityType: "CANDIDATE",
      action: "CANDIDATE_UPDATED",
      description: "Restored from trash",
      performedById: user.id,
      candidateId,
    });
  });
  revalidatePath("/candidates");
  revalidatePath(`/candidates/${candidateId}`);
}

/**
 * Skip the retention window and permanently erase a trashed candidate now.
 * Admin/manager only, gated behind typing the candidate's exact name.
 * Irreversible — delegates to the shared hardEraseCandidate helper.
 */
export async function eraseCandidateNow(
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
    select: { fullName: true, erasedAt: true },
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

  await hardEraseCandidate(candidateId, user.id);
  revalidatePath("/candidates");
  redirect(`/candidates/${candidateId}`);
}

/** Selected candidate ids from a bulk-action form (deduped, capped so a runaway
 *  request can't touch the whole table). */
function bulkIds(formData: FormData): string[] {
  return [...new Set(formData.getAll("ids").map(String).filter(Boolean))].slice(
    0,
    200,
  );
}

/** Bulk archive (soft-hide) the selected candidates. Skips trashed ones. */
export async function bulkArchiveCandidates(formData: FormData): Promise<void> {
  const user = await requireUser();
  const ids = bulkIds(formData);
  if (!ids.length) return;
  await prisma.$transaction(async (tx) => {
    await tx.candidate.updateMany({
      where: { id: { in: ids }, deletedAt: null },
      data: { isActive: false },
    });
    for (const id of ids) {
      await logActivity(tx, {
        entityType: "CANDIDATE",
        action: "CANDIDATE_UPDATED",
        description: "Archived candidate (bulk)",
        performedById: user.id,
        candidateId: id,
      });
    }
  });
  revalidatePath("/candidates");
}

/** Bulk add a tag to the selected candidates (deduped per candidate). */
export async function bulkTagCandidates(formData: FormData): Promise<void> {
  const user = await requireUser();
  const ids = bulkIds(formData);
  const tag = String(formData.get("tag") ?? "").trim().toLowerCase();
  if (!ids.length || !tag) return;
  const candidates = await prisma.candidate.findMany({
    where: { id: { in: ids }, deletedAt: null },
    select: { id: true, tags: true },
  });
  await prisma.$transaction(async (tx) => {
    for (const c of candidates) {
      if (c.tags.includes(tag)) continue;
      await tx.candidate.update({
        where: { id: c.id },
        data: { tags: { set: [...c.tags, tag] } },
      });
      await logActivity(tx, {
        entityType: "CANDIDATE",
        action: "CANDIDATE_UPDATED",
        description: `Added tag "${tag}" (bulk)`,
        performedById: user.id,
        candidateId: c.id,
      });
    }
  });
  revalidatePath("/candidates");
}

/** Bulk move the selected candidates to trash (reversible). Admin/manager only. */
export async function bulkTrashCandidates(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!hasFullAccess(user)) return;
  const ids = bulkIds(formData);
  if (!ids.length) return;
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.candidate.updateMany({
      where: { id: { in: ids }, deletedAt: null, erasedAt: null },
      data: { deletedAt: now, isActive: false },
    });
    for (const id of ids) {
      await logActivity(tx, {
        entityType: "CANDIDATE",
        action: "CANDIDATE_UPDATED",
        description: "Moved to trash (bulk)",
        performedById: user.id,
        candidateId: id,
      });
    }
  });
  revalidatePath("/candidates");
}
