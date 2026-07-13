"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getScopedPrisma, requireUser } from "@/lib/session";
import { canViewBenchCredentials } from "@/lib/permissions";
import { logActivity } from "@/server/activity";
import { rememberLookup } from "@/server/lookups";
import { ensureBenchForCandidate } from "@/server/bench-lifecycle";
import { findCandidateDuplicates } from "@/server/queries/candidates";
import { splitFullName } from "@/lib/format";
import {
  benchConsultantSchema,
  type BenchConsultantInput,
} from "@/lib/validation/bench";
import { toFieldErrors } from "@/lib/validation/common";
import type { FormState } from "@/lib/form-state";
import { Prisma } from "@/generated/prisma/client";

/** Matches the bench form's "➕ Create new candidate" sentinel. */
const NEW_CANDIDATE = "__new__";

function parseSkills(raw: FormDataEntryValue | null): string[] {
  if (typeof raw !== "string") return [];
  return [...new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))];
}

function readBenchConsultant(formData: FormData) {
  return benchConsultantSchema.safeParse({
    fullName: formData.get("fullName") ?? "",
    email: formData.get("email") ?? "",
    phone: formData.get("phone") ?? "",
    currentLocation: formData.get("currentLocation") ?? "",
    workAuthorization: formData.get("workAuthorization") ?? "",
    mVisa: formData.get("mVisa") ?? "",
    aVisa: formData.get("aVisa") ?? "",
    marketingExpYears: formData.get("marketingExpYears") ?? "",
    realTimeExpYears: formData.get("realTimeExpYears") ?? "",
    technology: formData.get("technology") ?? "",
    skills: parseSkills(formData.get("skills")),
    reference: formData.get("reference") ?? "",
    company: formData.get("company") ?? "",
    projectType: formData.get("projectType") ?? "",
    leastRateC2C: formData.get("leastRateC2C") ?? "",
    leastRateC2CNa: formData.get("leastRateC2C__na") ?? "",
    aVisaNa: formData.get("aVisa__na") ?? "",
    callType: formData.get("callType") ?? "",
    payrollType: formData.get("payrollType") ?? "",
    relocationMode: formData.get("relocationMode") ?? "",
    relocationCities: formData.get("relocationCities") ?? "",
    marketingStartDate: formData.get("marketingStartDate") ?? "",
    marketingEmail: formData.get("marketingEmail") ?? "",
    marketingPassword: formData.get("marketingPassword") ?? "",
    marketingNumber: formData.get("marketingNumber") ?? "",
    credentialsNa: formData.get("credentials__na") ?? "",
    personalNumber: formData.get("personalNumber") ?? "",
    priority: formData.get("priority") ?? "SECOND",
    marketingStatus: formData.get("marketingStatus") ?? "ACTIVE",
    notes: formData.get("notes") ?? "",
    // `isActive` is a retired axis — the bench lifecycle is `marketingStatus`
    // alone now. Kept true so the deprecated column never contradicts the pill.
    isActive: true,
    recruiterId: formData.get("recruiterId") ?? "",
    candidateId: formData.get("candidateId") ?? "",
  });
}

/** Maps validated input to a Prisma data object (optionals → explicit nulls). */
function benchData(d: BenchConsultantInput) {
  return {
    fullName: d.fullName,
    email: d.email ?? null,
    phone: d.phone ?? null,
    currentLocation: d.currentLocation ?? null,
    workAuthorization: d.workAuthorization ?? null,
    mVisa: d.mVisa ?? null,
    aVisa: d.aVisa ?? null,
    marketingExpYears: d.marketingExpYears ?? null,
    realTimeExpYears: d.realTimeExpYears ?? null,
    // `technology` is candidate-owned now (see writes below) — not a bench column.
    skills: d.skills,
    reference: d.reference ?? null,
    company: d.company ?? null,
    projectType: d.projectType ?? null,
    leastRateC2C: d.leastRateC2C ?? null,
    callType: d.callType ?? null,
    payrollType: d.payrollType ?? null,
    // 3-way relocation (Anywhere / Specific / No) mapped onto the boolean + cities:
    // open unless "No"; cities kept only for "Specific".
    relocation: d.relocationMode !== "NO",
    relocationCities:
      d.relocationMode === "SPECIFIC" ? d.relocationCities ?? null : null,
    marketingStartDate: d.marketingStartDate ?? null,
    marketingEmail: d.marketingEmail ?? null,
    marketingPassword: d.marketingPassword ?? null,
    marketingNumber: d.marketingNumber ?? null,
    // Redundant with the contact phone — default to it when left blank so the
    // marketing card always has a reachable personal number.
    personalNumber: d.personalNumber ?? d.phone ?? null,
    priority: d.priority,
    marketingStatus: d.marketingStatus,
    notes: d.notes ?? null,
    isActive: d.isActive,
    recruiterId: d.recruiterId ?? null,
    candidateId: d.candidateId ?? null,
  };
}

/** The admin-gated marketing-credential fields. */
const CREDENTIAL_FIELDS = [
  "marketingEmail",
  "marketingPassword",
  "marketingNumber",
  "personalNumber",
] as const;

/** Remove credential fields from an update/create payload so a user who can't
 *  view them can neither set nor blank them. Deleting the keys (vs. setting
 *  null) means Prisma leaves any existing values untouched on update. */
function stripCredentials(data: ReturnType<typeof benchData>): void {
  const rec = data as Record<string, unknown>;
  for (const k of CREDENTIAL_FIELDS) delete rec[k];
}

/** Credentials are required-or-N/A, but only for users who can edit them (the
 *  form hides the card for everyone else). Returns field errors, or null. */
function credentialErrors(
  d: BenchConsultantInput,
  canCreds: boolean,
): Record<string, string> | null {
  if (!canCreds || d.credentialsNa) return null;
  const e: Record<string, string> = {};
  if (!d.marketingEmail) e.marketingEmail = "Add the login email, or mark not set up.";
  if (!d.marketingPassword) e.marketingPassword = "Add the password, or mark not set up.";
  if (!d.marketingNumber) e.marketingNumber = "Add the number, or mark not set up.";
  return Object.keys(e).length ? e : null;
}

export async function createBenchConsultant(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const db = await getScopedPrisma();
  const user = await requireUser();
  const parsed = readBenchConsultant(formData);
  if (!parsed.success)
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  const d = parsed.data;

  const canCreds = canViewBenchCredentials(user);
  const credErr = credentialErrors(d, canCreds);
  if (credErr)
    return { error: "Please fix the highlighted fields.", fieldErrors: credErr };

  const data = benchData(d);
  // Only credential-cleared users (admins) may set the gated marketing
  // credentials. For everyone else the form never renders those inputs, so we
  // strip them rather than persist blanks.
  if (!canCreds) stripCredentials(data);

  // Every bench consultant IS a candidate. Either an existing candidate was
  // picked (link it), or the "➕ Create new candidate" sentinel means we create
  // one from the shared fields. A candidate can be on the bench only once.
  const linkExisting = Boolean(d.candidateId) && d.candidateId !== NEW_CANDIDATE;
  // A brand-new candidate must be contactable (same rule the Candidate form
  // enforces) — otherwise it can't be edited later without adding a contact.
  if (!linkExisting && !d.email && !d.phone) {
    return {
      error: "A new candidate needs an email or a phone number.",
      fieldErrors: {
        email: "Add an email or phone — it becomes the candidate's contact.",
      },
    };
  }
  // Don't silently mint a duplicate candidate from the bench — the Candidate form
  // runs this same check. The bench form has no "save anyway" flow, so require
  // linking the existing person (pick them in the candidate box) instead.
  if (!linkExisting) {
    const dups = await findCandidateDuplicates({ email: d.email, phone: d.phone });
    if (dups.length) {
      const names = dups.map((c) => c.fullName).join(", ");
      return {
        error: `A candidate with this email or phone already exists (${names}). Pick them in the candidate box instead of creating a new one.`,
        fieldErrors: { candidateId: "This person already exists — link them." },
      };
    }
  }
  if (linkExisting) {
    const already = await db.benchConsultant.findUnique({
      where: { candidateId: d.candidateId as string },
      select: { id: true, marketingStatus: true },
    });
    if (already) {
      // Re-adding a candidate who was taken off the bench: reactivate the
      // existing row (all its stored details are kept — no retype) instead of
      // erroring. A row that's still on the bench / placed is a real duplicate.
      if (already.marketingStatus === "INACTIVE") {
        await db.$transaction(async (tx) => {
          await tx.benchConsultant.update({
            where: { id: already.id },
            data: { marketingStatus: "ACTIVE" },
          });
          // Reactivation reuses the row's stored bench details (no retype), but
          // still honour anything the user typed on this re-add: a new candidate
          // technology (candidate-owned) and any freshly-typed lookup values.
          if (d.technology)
            await tx.candidate.update({
              where: { id: d.candidateId as string },
              data: { technology: d.technology },
            });
          await rememberLookup(tx, user.organizationId, "CALL_TYPE", d.callType);
          await rememberLookup(tx, user.organizationId, "PAYROLL_TYPE", d.payrollType);
          await logActivity(tx, {
            entityType: "CONSULTANT",
            action: "BENCH_CONSULTANT_UPDATED",
            description: "Re-added to bench (marketing status INACTIVE → ACTIVE)",
            oldValue: "INACTIVE",
            newValue: "ACTIVE",
            performedById: user.id,
            benchConsultantId: already.id,
          });
        });
        revalidatePath("/bench");
        revalidatePath("/candidates");
        redirect(`/bench/${already.id}`);
      }
      return {
        error: "That candidate is already on the bench.",
        fieldErrors: { candidateId: "Already on the bench." },
      };
    }
  }

  let consultant;
  try {
    consultant = await db.$transaction(async (tx) => {
      let candidateId = linkExisting ? (d.candidateId as string) : null;
      if (!linkExisting) {
        const { firstName, lastName } = splitFullName(d.fullName);
        const cand = await tx.candidate.create({
          data: {
            // firstName/lastName are required by the Candidate model (fullName is
            // derived from them); the bench form only supplies fullName, so split
            // it — otherwise the candidate is un-editable (the edit form requires
            // both name parts) and renders blank on name-part surfaces.
            firstName,
            lastName,
            fullName: d.fullName,
            email: d.email ?? null,
            phone: d.phone ?? null,
            currentLocation: d.currentLocation ?? null,
            workAuthorization: d.workAuthorization ?? null,
            technology: d.technology ?? null,
            skills: d.skills,
            status: "AVAILABLE",
            isActive: true,
            createdById: user.id,
          },
          select: { id: true, fullName: true },
        });
        candidateId = cand.id;
        await logActivity(tx, {
          entityType: "CANDIDATE",
          action: "CANDIDATE_CREATED",
          description: `Candidate "${cand.fullName}" created (from bench)`,
          performedById: user.id,
          candidateId: cand.id,
        });
      } else if (d.technology && candidateId) {
        // Linking an existing candidate: push a provided technology onto the
        // candidate (source of truth). Blank leaves their current value intact.
        await tx.candidate.update({
          where: { id: candidateId },
          data: { technology: d.technology },
        });
      }
      const created = await tx.benchConsultant.create({
        // The resolved candidateId overrides whatever the sentinel was.
        data: { ...data, candidateId, createdById: user.id },
      });
      await logActivity(tx, {
        entityType: "CONSULTANT",
        action: "BENCH_CONSULTANT_CREATED",
        description: `Bench consultant "${created.fullName}" added`,
        performedById: user.id,
        benchConsultantId: created.id,
      });
      await rememberLookup(tx, user.organizationId, "CALL_TYPE", d.callType);
      await rememberLookup(tx, user.organizationId, "PAYROLL_TYPE", d.payrollType);
      return created;
    });
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    )
      return {
        error: "That candidate is already on the bench.",
        fieldErrors: { candidateId: "Already on the bench." },
      };
    throw e;
  }

  revalidatePath("/bench");
  revalidatePath("/candidates");
  redirect(`/bench/${consultant.id}`);
}

export async function updateBenchConsultant(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const db = await getScopedPrisma();
  const user = await requireUser();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { error: "Missing consultant reference." };

  const parsed = readBenchConsultant(formData);
  if (!parsed.success)
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  const d = parsed.data;

  const canCreds = canViewBenchCredentials(user);
  const credErr = credentialErrors(d, canCreds);
  if (credErr)
    return { error: "Please fix the highlighted fields.", fieldErrors: credErr };

  const existing = await db.benchConsultant.findUnique({
    where: { id },
    include: {
      candidate: {
        select: {
          id: true,
          technology: true,
          workAuthorization: true,
          currentLocation: true,
        },
      },
    },
  });
  if (!existing) return { error: "This consultant no longer exists." };

  // Record which fields changed for a meaningful audit entry (credentials are
  // referenced by name only, never logging the secret values).
  const changed: string[] = [];
  const compare = (label: string, before: unknown, after: unknown) => {
    if (String(before ?? "") !== String(after ?? "")) changed.push(label);
  };
  compare("name", existing.fullName, d.fullName);
  compare("email", existing.email, d.email);
  compare("phone", existing.phone, d.phone);
  compare("location", existing.currentLocation, d.currentLocation);
  compare("skills", existing.skills.join(", "), d.skills.join(", "));
  compare("priority", existing.priority, d.priority);
  compare("marketing status", existing.marketingStatus, d.marketingStatus);
  compare("recruiter", existing.recruiterId, d.recruiterId);
  compare("linked candidate", existing.candidateId, d.candidateId);
  compare("notes", existing.notes, d.notes);

  const data = benchData(d);
  // Non-admins can't see or edit credentials — their form omits those inputs, so
  // strip the (blank) credential fields here. Omitting them from the Prisma
  // update leaves the admin-set values untouched instead of wiping them.
  if (!canCreds) stripCredentials(data);
  else if (existing.marketingPassword !== (d.marketingPassword ?? null))
    changed.push("marketing credentials");

  await db.$transaction(async (tx) => {
    await tx.benchConsultant.update({ where: { id }, data });
    // Technology / work authorization / current location are candidate-owned (the
    // bench form labels them "from the candidate"). Push NON-BLANK changes back to
    // the candidate — the source of truth the roster "Needs details" flag reads —
    // so editing them on the bench actually clears the flag. Never blank-wipe (a
    // blank leaves the candidate's value intact; clearing is done on the Candidate
    // form), which also protects against a stale bench tab nulling a fresher value.
    const candChanges: string[] = [];
    const candPatch: Prisma.CandidateUpdateInput = {};
    if (d.technology && d.technology !== (existing.candidate?.technology ?? "")) {
      candPatch.technology = d.technology;
      candChanges.push(`technology "${d.technology}"`);
    }
    if (
      d.workAuthorization &&
      d.workAuthorization !== (existing.candidate?.workAuthorization ?? "")
    ) {
      candPatch.workAuthorization = d.workAuthorization;
      candChanges.push(`work authorization "${d.workAuthorization}"`);
    }
    if (
      d.currentLocation &&
      d.currentLocation !== (existing.candidate?.currentLocation ?? "")
    ) {
      candPatch.currentLocation = d.currentLocation;
      candChanges.push(`location "${d.currentLocation}"`);
    }
    if (existing.candidateId && candChanges.length) {
      await tx.candidate.update({
        where: { id: existing.candidateId },
        data: candPatch,
      });
      await logActivity(tx, {
        entityType: "CANDIDATE",
        action: "CANDIDATE_UPDATED",
        description: `Updated from bench: ${candChanges.join(", ")}`,
        newValue: candChanges.join(", "),
        performedById: user.id,
        candidateId: existing.candidateId,
      });
    }
    await rememberLookup(tx, user.organizationId, "CALL_TYPE", d.callType);
    await rememberLookup(tx, user.organizationId, "PAYROLL_TYPE", d.payrollType);
    if (changed.length)
      await logActivity(tx, {
        entityType: "CONSULTANT",
        action: "BENCH_CONSULTANT_UPDATED",
        description: `Bench consultant updated (${changed.join(", ")})`,
        newValue: changed.join(", "),
        performedById: user.id,
        benchConsultantId: id,
      });
  });

  revalidatePath("/bench");
  revalidatePath(`/bench/${id}`);
  redirect(`/bench/${id}`);
}

/**
 * One-click "remove from bench" (e.g. the consultant moved to another company).
 * Flips the marketing status to INACTIVE so they drop off the active roster
 * without deleting the record — the marketing history stays intact.
 */
export async function removeFromBench(formData: FormData): Promise<void> {
  const db = await getScopedPrisma();
  const user = await requireUser();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
  const existing = await db.benchConsultant.findUnique({
    where: { id },
    select: { marketingStatus: true },
  });
  if (!existing || existing.marketingStatus === "INACTIVE") return;
  await db.$transaction(async (tx) => {
    await tx.benchConsultant.update({
      where: { id },
      data: { marketingStatus: "INACTIVE" },
    });
    await logActivity(tx, {
      entityType: "CONSULTANT",
      action: "BENCH_CONSULTANT_UPDATED",
      description: `Removed from bench (marketing status ${existing.marketingStatus} → INACTIVE)`,
      oldValue: existing.marketingStatus,
      newValue: "INACTIVE",
      performedById: user.id,
      benchConsultantId: id,
    });
  });
  revalidatePath("/bench");
  revalidatePath(`/bench/${id}`);
}

/**
 * "Add to bench" straight from a candidate page. Reactivates an existing linked
 * bench row (any off-bench status → ACTIVE), or creates one seeded from the
 * candidate if none exists. Idempotent for a candidate already on the bench.
 */
export async function addCandidateToBench(formData: FormData): Promise<void> {
  const db = await getScopedPrisma();
  const user = await requireUser();
  const candidateId = String(formData.get("candidateId") ?? "").trim();
  if (!candidateId) return;
  const existing = await db.benchConsultant.findUnique({
    where: { candidateId },
    select: { id: true, marketingStatus: true },
  });
  try {
    await db.$transaction(async (tx) => {
      if (existing) {
        if (existing.marketingStatus !== "ACTIVE") {
          await tx.benchConsultant.update({
            where: { id: existing.id },
            data: { marketingStatus: "ACTIVE" },
          });
          await logActivity(tx, {
            entityType: "CONSULTANT",
            action: "BENCH_CONSULTANT_UPDATED",
            description: `Added to bench from candidate (${existing.marketingStatus} → ACTIVE)`,
            oldValue: existing.marketingStatus,
            newValue: "ACTIVE",
            performedById: user.id,
            benchConsultantId: existing.id,
          });
        }
        return;
      }
      const cand = await tx.candidate.findUnique({
        where: { id: candidateId },
        select: {
          fullName: true,
          email: true,
          phone: true,
          currentLocation: true,
          workAuthorization: true,
          skills: true,
        },
      });
      if (!cand) return;
      await ensureBenchForCandidate(tx, {
        candidateId,
        fullName: cand.fullName,
        email: cand.email,
        phone: cand.phone,
        currentLocation: cand.currentLocation,
        workAuthorization: cand.workAuthorization,
        skills: cand.skills,
        recruiterId: user.role === "RECRUITER" ? user.id : null,
        performedById: user.id,
      });
    });
  } catch (e) {
    // Two near-simultaneous "Add to bench" clicks race on the candidateId
    // unique — the loser's create hits P2002. The intent is idempotent, so a
    // no-op is the right outcome.
    if (
      !(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
    )
      throw e;
  }
  revalidatePath("/bench");
  revalidatePath(`/candidates/${candidateId}`);
}

/**
 * Put a consultant (back) onto the active bench. Serves two owner scenarios:
 *  - "Market — project ending": a PLACED consultant whose engagement is winding
 *    down is marketed again (stays placed AND on the bench — the two are
 *    independent). Placement-lifecycle sync only fires on placement transitions,
 *    so it won't clobber this manual ACTIVE.
 *  - Re-adding an INACTIVE (Off bench) row from the detail page.
 * No-op if already ACTIVE.
 */
export async function remarketConsultant(formData: FormData): Promise<void> {
  const db = await getScopedPrisma();
  const user = await requireUser();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
  const existing = await db.benchConsultant.findUnique({
    where: { id },
    select: { marketingStatus: true },
  });
  if (!existing || existing.marketingStatus === "ACTIVE") return;
  await db.$transaction(async (tx) => {
    await tx.benchConsultant.update({
      where: { id },
      data: { marketingStatus: "ACTIVE" },
    });
    await logActivity(tx, {
      entityType: "CONSULTANT",
      action: "BENCH_CONSULTANT_UPDATED",
      description: `Marketing resumed (status ${existing.marketingStatus} → ACTIVE)`,
      oldValue: existing.marketingStatus,
      newValue: "ACTIVE",
      performedById: user.id,
      benchConsultantId: id,
    });
  });
  revalidatePath("/bench");
  revalidatePath(`/bench/${id}`);
}
