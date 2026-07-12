"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { del } from "@vercel/blob";
import { getScopedPrisma, requireUser } from "@/lib/session";
import { hasFullAccess } from "@/lib/permissions";
import { logActivity } from "@/server/activity";
import {
  hardEraseCandidate,
  CANDIDATE_TRASH_RETENTION_DAYS,
  CANDIDATE_ARCHIVE_PREFIX,
} from "@/server/candidate-erase";
import { ensureBenchForCandidate } from "@/server/bench-lifecycle";
import { rememberLookup } from "@/server/lookups";
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
    firstName: formData.get("firstName") ?? "",
    lastName: formData.get("lastName") ?? "",
    email: formData.get("email") ?? "",
    phone: formData.get("phone") ?? "",
    currentLocation: formData.get("currentLocation") ?? "",
    workAuthorization: formData.get("workAuthorization") ?? "",
    totalExperienceYears: formData.get("totalExperienceYears") ?? "",
    realTimeExperienceYears: formData.get("realTimeExperienceYears") ?? "",
    technology: formData.get("technology") ?? "",
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
    referrerId: formData.get("referrerId") ?? "",
    source: formData.get("source") ?? "",
    isWorking: formData.get("isWorking") != null,
    workingType: formData.get("workingType") ?? "",
    discipline: formData.get("discipline") ?? "",
  });
}

/** Maps validated input to a Prisma data object (undefined optionals become explicit nulls). */
function candidateData(d: CandidateInput) {
  return {
    firstName: d.firstName,
    lastName: d.lastName,
    // fullName is the derived display value — composed from first + last so every
    // existing list/search/submission/placement keeps working unchanged.
    fullName: `${d.firstName} ${d.lastName}`.trim(),
    email: d.email ?? null,
    phone: d.phone ?? null,
    currentLocation: d.currentLocation ?? null,
    workAuthorization: d.workAuthorization ?? null,
    totalExperienceYears: d.totalExperienceYears ?? null,
    realTimeExperienceYears: d.realTimeExperienceYears ?? null,
    technology: d.technology ?? null,
    currentCompany: d.currentCompany ?? null,
    skills: d.skills,
    featuredSkills: d.featuredSkills,
    linkedinUrl: d.linkedinUrl ?? null,
    notes: d.notes ?? null,
    isActive: d.isActive,
    status: d.status,
    tags: d.tags,
    lastContactedAt: d.lastContactedAt ?? null,
    // Reference is now a managed Referrer entity. Legacy free-text `source` is
    // intentionally NOT written here — it's preserved read-only for old rows.
    referrerId: d.referrerId,
    isWorking: d.isWorking,
    // Working type only meaningful when working; blank it otherwise.
    workingType: d.isWorking ? d.workingType ?? null : null,
    discipline: d.discipline ?? null,
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
  const db = await getScopedPrisma();
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

  const candidate = await db.$transaction(async (tx) => {
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
    // Remember any new free-text work-auth / working-type for future dropdowns.
    await rememberLookup(tx, user.organizationId, "WORKING_TYPE", created.workingType);
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
  const db = await getScopedPrisma();
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

  const existing = await db.candidate.findUnique({ where: { id: candidateId } });
  if (!existing) return { error: "This candidate no longer exists." };

  // Guard: don't let a manual status edit clobber PLACED while the candidate
  // still has an ACTIVE/EXTENDED placement. The lifecycle helper owns PLACED ↔
  // AVAILABLE transitions; recruiters must end the placement first.
  if (existing.status === "PLACED" && d.status !== "PLACED") {
    const activePlacements = await db.placement.count({
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
  compare("name", existing.fullName, `${d.firstName} ${d.lastName}`.trim());
  compare("email", existing.email, d.email);
  compare("phone", existing.phone, d.phone);
  compare("location", existing.currentLocation, d.currentLocation);
  compare("work authorization", existing.workAuthorization, d.workAuthorization);
  compare("experience", existing.totalExperienceYears?.toString(), d.totalExperienceYears);
  compare("real-time experience", existing.realTimeExperienceYears?.toString(), d.realTimeExperienceYears);
  compare("technology", existing.technology, d.technology);
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
  compare("reference", existing.referrerId, d.referrerId);
  compare("working now", existing.isWorking, d.isWorking);
  compare("working type", existing.workingType, d.isWorking ? d.workingType : null);

  await db.$transaction(async (tx) => {
    await tx.candidate.update({
      where: { id: candidateId },
      data: candidateData(d),
    });
    if (d.isWorking) await rememberLookup(tx, user.organizationId, "WORKING_TYPE", d.workingType);
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
  const db = await getScopedPrisma();
  const user = await requireUser();
  const candidateId = String(formData.get("id") ?? "").trim();
  if (!candidateId) return;
  await db.$transaction(async (tx) => {
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
  const db = await getScopedPrisma();
  const user = await requireUser();
  const candidateId = String(formData.get("id") ?? "").trim();
  const archived = formData.get("archived") === "1";
  if (!candidateId) return;
  await db.$transaction(async (tx) => {
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
  const db = await getScopedPrisma();
  const user = await requireUser();
  if (!hasFullAccess(user))
    return { error: "Only managers and team leads can trash a candidate." };

  const candidateId = String(formData.get("id") ?? "").trim();
  const candidate = await db.candidate.findUnique({
    where: { id: candidateId },
    select: { deletedAt: true, erasedAt: true, isActive: true },
  });
  if (!candidate) return { error: "Candidate not found." };
  if (candidate.erasedAt)
    return { error: "This candidate has already been erased." };
  if (candidate.deletedAt)
    return { error: "This candidate is already in trash." };

  // Never trash someone who's actively placed — that would leave an active
  // placement pointing at a hidden candidate. End the placement first.
  const activePlacements = await db.placement.count({
    where: { candidateId, status: { in: ["ACTIVE", "EXTENDED"] } },
  });
  if (activePlacements > 0)
    return {
      error: "This candidate has an active placement — end the placement first.",
    };

  // The ladder is Active → Inactive → Trash. If the candidate is still Active,
  // trashing deactivates it in the same step (the UI confirms this) — so the
  // move is never a dead end, it just passes through Inactive on its way down.
  const wasActive = candidate.isActive;
  const purgeOn = new Date(
    Date.now() + CANDIDATE_TRASH_RETENTION_DAYS * 86_400_000,
  );
  await db.$transaction(async (tx) => {
    await tx.candidate.update({
      where: { id: candidateId },
      data: { deletedAt: new Date(), isActive: false },
    });
    // Take the candidate off the marketing bench when trashed (a trashed
    // candidate must never still show as actively marketed).
    await tx.benchConsultant.updateMany({
      where: { candidateId, marketingStatus: { in: ["ACTIVE", "PAUSED"] } },
      data: { marketingStatus: "INACTIVE" },
    });
    await logActivity(tx, {
      entityType: "CANDIDATE",
      action: "CANDIDATE_UPDATED",
      description: `${wasActive ? "Deactivated + moved" : "Moved"} to trash — auto-erases ${purgeOn.toISOString().slice(0, 10)}`,
      performedById: user.id,
      candidateId,
    });
  });

  revalidatePath("/candidates");
  redirect(`/candidates/${candidateId}`);
}

/** Restore a trashed candidate before the retention window lapses. Comes back
 *  as **Inactive** (not straight to Active) so the lifecycle ladder holds — the
 *  user explicitly Reactivates when ready. */
export async function restoreCandidateFromTrash(
  formData: FormData,
): Promise<void> {
  const db = await getScopedPrisma();
  const user = await requireUser();
  if (!hasFullAccess(user)) return;
  const candidateId = String(formData.get("id") ?? "").trim();
  if (!candidateId) return;
  await db.$transaction(async (tx) => {
    await tx.candidate.update({
      where: { id: candidateId },
      data: { deletedAt: null, isActive: false },
    });
    await logActivity(tx, {
      entityType: "CANDIDATE",
      action: "CANDIDATE_UPDATED",
      description: "Restored from trash (Inactive)",
      performedById: user.id,
      candidateId,
    });
  });
  revalidatePath("/candidates");
  revalidatePath(`/candidates/${candidateId}`);
}

/**
 * Permanently erase a candidate now — works on a live or trashed candidate
 * (skips any retention window). Admin/manager only, gated behind typing the
 * candidate's exact name. `hardEraseCandidate` writes a recoverable archive to
 * private Blob BEFORE scrubbing, so this is "delete, but backed up" rather than
 * an unrecoverable hard-delete. Admins can restore or purge the backup from
 * Settings → Deleted candidates.
 */
export async function eraseCandidateNow(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const db = await getScopedPrisma();
  const user = await requireUser();
  if (!hasFullAccess(user))
    return { error: "Only managers and team leads can erase a candidate." };

  const candidateId = String(formData.get("id") ?? "").trim();
  const confirmName = String(formData.get("confirmName") ?? "").trim();
  const candidate = await db.candidate.findUnique({
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

  await hardEraseCandidate(db, candidateId, user.id);
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
  const db = await getScopedPrisma();
  const user = await requireUser();
  const ids = bulkIds(formData);
  if (!ids.length) return;
  await db.$transaction(async (tx) => {
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
  const db = await getScopedPrisma();
  const user = await requireUser();
  const ids = bulkIds(formData);
  const tag = String(formData.get("tag") ?? "").trim().toLowerCase();
  if (!ids.length || !tag) return;
  const candidates = await db.candidate.findMany({
    where: { id: { in: ids }, deletedAt: null },
    select: { id: true, tags: true },
  });
  await db.$transaction(async (tx) => {
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

/**
 * Bulk move the selected candidates to trash (reversible). Admin/manager only.
 * Still-active rows are deactivated in the same step (the Active→Inactive→Trash
 * ladder). Mirrors the single-trash guard: anyone with an ACTIVE/EXTENDED
 * placement is skipped (never hide a candidate who's actively placed).
 * Returns { moved, skipped } so the caller can report the outcome.
 */
export async function bulkTrashCandidates(
  formData: FormData,
): Promise<{ moved: number; skipped: number }> {
  const db = await getScopedPrisma();
  const user = await requireUser();
  if (!hasFullAccess(user)) return { moved: 0, skipped: 0 };
  const ids = bulkIds(formData);
  if (!ids.length) return { moved: 0, skipped: 0 };

  // Eligible = not already trashed/erased AND no active placement.
  const placedIds = new Set(
    (
      await db.placement.findMany({
        where: { candidateId: { in: ids }, status: { in: ["ACTIVE", "EXTENDED"] } },
        select: { candidateId: true },
      })
    ).map((p) => p.candidateId),
  );
  const eligible = await db.candidate.findMany({
    where: { id: { in: ids }, deletedAt: null, erasedAt: null },
    select: { id: true },
  });
  const eligibleIds = eligible
    .map((c) => c.id)
    .filter((id) => !placedIds.has(id));
  const skipped = ids.length - eligibleIds.length;
  if (!eligibleIds.length) return { moved: 0, skipped };

  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.candidate.updateMany({
      where: { id: { in: eligibleIds } },
      data: { deletedAt: now, isActive: false },
    });
    // Take trashed candidates off the marketing bench (mirror single trash).
    await tx.benchConsultant.updateMany({
      where: {
        candidateId: { in: eligibleIds },
        marketingStatus: { in: ["ACTIVE", "PAUSED"] },
      },
      data: { marketingStatus: "INACTIVE" },
    });
    for (const id of eligibleIds) {
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
  return { moved: eligibleIds.length, skipped };
}

/**
 * "Remove for good" — permanently delete a stored personal-delete backup from
 * Blob. After this the candidate's archived data is unrecoverable. Admin/manager
 * only; confined to the archive prefix so it can't be pointed at other blobs.
 */
export async function removeCandidateArchive(formData: FormData): Promise<void> {
  const db = await getScopedPrisma();
  const user = await requireUser();
  if (!hasFullAccess(user)) return;

  const pathname = String(formData.get("pathname") ?? "").trim();
  if (!pathname.startsWith(CANDIDATE_ARCHIVE_PREFIX)) return;

  // Delete by the prefix-validated pathname only — never a caller-supplied,
  // unvalidated `url`, which could point `del()` at an arbitrary blob.
  await del(pathname);
  // Deliberate exception to the project's "write + audit in one $transaction"
  // rule: a Blob delete can't join a DB transaction, so the audit row is logged
  // separately after it. Worst case on a crash between the two is an orphaned
  // audit gap, not a data-integrity problem. (review IN-02)
  await logActivity(db, {
    entityType: "CANDIDATE",
    action: "CANDIDATE_ERASED",
    description: `Removed personal-data backup ${pathname
      .split("/")
      .pop()} — no longer recoverable`,
    performedById: user.id,
  });
  revalidatePath("/settings");
}
