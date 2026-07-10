"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type {
  ActivityAction,
  SubmissionStatus,
} from "@/generated/prisma/enums";
import { prisma } from "@/server/db";
import { requireUser } from "@/lib/session";
import { hasFullAccess, canReattributeSubmission } from "@/lib/permissions";
import { logActivity } from "@/server/activity";
import {
  submissionSchema,
  submissionEditSchema,
  statusChangeSchema,
} from "@/lib/validation/submission";
import { toFieldErrors } from "@/lib/validation/common";
import {
  SUBMISSION_STATUS_LABEL,
  CANDIDATE_STATUS_LABEL,
  JOB_STATUS_LABEL,
} from "@/lib/labels";
import { rateChainWarnings } from "@/lib/rates";
import type { FormState } from "@/lib/form-state";
import {
  ensurePlacementOnJoined,
  terminatePlacementOnRevert,
} from "@/server/placement-lifecycle";
import {
  createSubmissionRecord,
  ACTIVE_STATUSES,
} from "@/server/submission-create";
import {
  collectSubmissionGates,
  gatesFromCreateResult,
} from "@/server/submission-gates";
import { branchActions } from "@/lib/submission-flow";

function readSubmission(formData: FormData) {
  return submissionSchema.safeParse({
    candidateId: formData.get("candidateId") ?? "",
    jobId: formData.get("jobId") ?? "",
    submittedById: formData.get("submittedById") ?? "",
    submissionNotes: formData.get("submissionNotes") ?? "",
    resumeChoice: formData.get("resumeChoice") ?? "none",
    candidateResumeId: formData.get("candidateResumeId") ?? "",
    engagement: formData.get("engagement") ?? "",
    vendorRecruiterName: formData.get("vendorRecruiterName") ?? "",
    jobDuties: formData.get("jobDuties") ?? "",
    payRate: formData.get("payRate") ?? "",
    billRate: formData.get("billRate") ?? "",
    clientRate: formData.get("clientRate") ?? "",
    teamLead: formData.get("teamLead") ?? "",
  });
}

export async function createSubmission(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = readSubmission(formData);
  if (!parsed.success)
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  const d = parsed.data;

  const [job, candidate] = await Promise.all([
    prisma.job.findUnique({
      where: { id: d.jobId },
      select: {
        id: true,
        title: true,
        status: true,
        // iLabor signal fields — drive the cap + "closed for subs" warnings.
        submitLimit: true,
        ilaborSubmitOpen: true,
        externalActiveCount: true,
      },
    }),
    prisma.candidate.findUnique({
      where: { id: d.candidateId },
      select: {
        id: true,
        fullName: true,
        status: true,
        isActive: true,
        deletedAt: true,
        benchConsultant: { select: { marketingStatus: true } },
      },
    }),
  ]);
  if (!job) return { error: "This job no longer exists." };
  if (!candidate)
    return {
      error: "That candidate no longer exists.",
      fieldErrors: { candidateId: "Select a candidate." },
    };

  // Hard blocks the convert path already enforced but the direct form lacked
  // (WR-01): a job that's no longer accepting submissions, and an archived or
  // trashed candidate reached via a stale/crafted id.
  if (
    job.status === "CLOSED" ||
    job.status === "FILLED" ||
    job.status === "CANCELLED"
  )
    return {
      error: `"${job.title}" is ${JOB_STATUS_LABEL[job.status]} and no longer accepting submissions.`,
    };
  if (!candidate.isActive || candidate.deletedAt)
    return {
      error: `${candidate.fullName} has been ${candidate.deletedAt ? "deleted" : "archived"} — restore the candidate before submitting.`,
      fieldErrors: { candidateId: "Select an active candidate." },
    };

  // ── Collect EVERY soft gate up front, so the form shows them all at once ──
  // Assignment self-claim (recruiters), rate chain, candidate status, off-bench,
  // duplicate, iLabor closed/cap. Each drops off the stack once its reason is
  // supplied; only when the stack is empty do we create.
  const claim = String(formData.get("claim") ?? "") === "1";
  const isAdmin = hasFullAccess(user);

  // Attribution: only privileged users may credit a submission to someone else
  // (createSubmissionRecord forces non-admins to themselves regardless). When an
  // admin does pick a target, validate it exists so a crafted id returns a clean
  // field error instead of an unhandled Prisma FK violation.
  if (isAdmin && d.submittedById && d.submittedById !== user.id) {
    const target = await prisma.user.findUnique({
      where: { id: d.submittedById },
      select: { id: true },
    });
    if (!target)
      return {
        error: "Please fix the highlighted fields.",
        fieldErrors: { submittedById: "Pick a valid recruiter." },
      };
  }

  let hasAssignment = false;
  if (!isAdmin) {
    const assignment = await prisma.jobAssignment.findFirst({
      where: { jobId: d.jobId, recruiterId: user.id },
      select: { id: true },
    });
    hasAssignment = Boolean(assignment);
  }

  const rateOverrideReason = String(
    formData.get("rateOverrideReason") ?? "",
  ).trim();
  const candidateStatusOverrideReason = String(
    formData.get("candidateStatusOverrideReason") ?? "",
  ).trim();
  const benchOverrideReason = String(
    formData.get("benchOverrideReason") ?? "",
  ).trim();
  const duplicateReason = String(formData.get("duplicateReason") ?? "").trim();
  const ilaborOverrideReason = String(
    formData.get("ilaborOverrideReason") ?? "",
  ).trim();

  const rateWarnings = rateChainWarnings({
    payRate: d.payRate,
    billRate: d.billRate,
    clientRate: d.clientRate,
  });
  const candidateBlocked =
    candidate.status === "NOT_INTERESTED" ||
    candidate.status === "DO_NOT_CONTACT";
  const bench = candidate.benchConsultant;
  const notMarketed = !bench || bench.marketingStatus === "INACTIVE";

  // Pre-check duplicate + iLabor here (createSubmissionRecord re-checks under the
  // advisory lock as the race-safe net) so they join the same stacked prompt.
  const existingDup = await prisma.submission.findFirst({
    where: { candidateId: d.candidateId, jobId: d.jobId },
    select: { id: true },
  });
  const ilaborClosed = job.ilaborSubmitOpen === 0;
  let ilaborCap: { cap: number; active: number } | null = null;
  if (job.submitLimit != null) {
    const localActive = await prisma.submission.count({
      where: { jobId: d.jobId, status: { in: ACTIVE_STATUSES } },
    });
    const eff = Math.max(job.externalActiveCount ?? 0, localActive);
    if (eff >= job.submitLimit) ilaborCap = { cap: job.submitLimit, active: eff };
  }

  // Resolve a previously-saved résumé up front so a bad pick returns cleanly.
  let pickedResume: { id: string; blobUrl: string | null } | null = null;
  if (d.resumeChoice === "existing" && d.candidateResumeId) {
    const resume = await prisma.candidateResume.findUnique({
      where: { id: d.candidateResumeId },
      select: { id: true, blobUrl: true, candidateId: true },
    });
    if (!resume || resume.candidateId !== d.candidateId)
      return {
        error: "Please fix the highlighted fields.",
        fieldErrors: {
          candidateResumeId: "Pick a resume that belongs to this candidate.",
        },
      };
    pickedResume = { id: resume.id, blobUrl: resume.blobUrl };
  }

  const gates = collectSubmissionGates({
    isConvert: false,
    assignmentOk: isAdmin || hasAssignment || claim,
    rateWarnings,
    candidateStatusLabel: candidateBlocked
      ? CANDIDATE_STATUS_LABEL[candidate.status]
      : null,
    notMarketed,
    convertWarnings: [],
    duplicateExistingId: existingDup?.id ?? null,
    ilaborClosed,
    ilaborCap,
    reasons: {
      rate: rateOverrideReason,
      candidateStatus: candidateStatusOverrideReason,
      bench: benchOverrideReason,
      convert: "",
      duplicate: duplicateReason,
      ilabor: ilaborOverrideReason,
    },
  });
  if (gates.length > 0)
    return {
      pendingGates: gates,
      error: `Review ${gates.length} item${gates.length === 1 ? "" : "s"} below, then submit.`,
    };

  // All gates satisfied — create. The helper re-checks dup/iLabor under the
  // advisory lock; a race that slips one in comes back as a stacked gate.
  const result = await prisma.$transaction((tx) =>
    createSubmissionRecord(tx, {
      candidateId: d.candidateId,
      jobId: d.jobId,
      submittedById: d.submittedById,
      submissionNotes: d.submissionNotes ?? null,
      engagement: d.engagement ?? null,
      vendorRecruiterName: d.vendorRecruiterName ?? null,
      jobDuties: d.jobDuties ?? null,
      payRate: d.payRate ?? null,
      billRate: d.billRate ?? null,
      clientRate: d.clientRate ?? null,
      teamLead: d.teamLead ?? null,
      pickedResume,
      duplicateReason,
      ilaborOverrideReason,
      rateOverrideReason,
      candidateStatusOverrideReason,
      benchOverrideReason,
      job,
      candidateFullName: candidate.fullName,
      actor: { id: user.id, fullName: user.fullName, isAdmin },
    }),
  );
  if (result.kind !== "created")
    return {
      pendingGates: gatesFromCreateResult(result),
      error: "Resolve the item below, then submit.",
    };
  const submissionId = result.submissionId;

  revalidatePath("/submissions");
  revalidatePath(`/jobs/${d.jobId}`);
  revalidatePath(`/candidates/${d.candidateId}`);
  redirect(`/submissions/${submissionId}`);
}

function readSubmissionEdit(formData: FormData) {
  return submissionEditSchema.safeParse({
    submissionNotes: formData.get("submissionNotes") ?? "",
    submittedAt: formData.get("submittedAt") ?? "",
    submittedById: formData.get("submittedById") ?? "",
    resumeChoice: formData.get("resumeChoice") ?? "none",
    candidateResumeId: formData.get("candidateResumeId") ?? "",
    engagement: formData.get("engagement") ?? "",
    vendorRecruiterName: formData.get("vendorRecruiterName") ?? "",
    jobDuties: formData.get("jobDuties") ?? "",
    payRate: formData.get("payRate") ?? "",
    billRate: formData.get("billRate") ?? "",
    clientRate: formData.get("clientRate") ?? "",
    teamLead: formData.get("teamLead") ?? "",
  });
}

/**
 * Edits a submission's rate, résumé, and notes (spec §7.7). Candidate, job, and
 * submitting recruiter are fixed at creation and not editable here; status has
 * its own form (`changeSubmissionStatus`).
 */
export async function updateSubmission(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const submissionId = String(formData.get("id") ?? "").trim();
  if (!submissionId) return { error: "Missing submission reference." };

  const parsed = readSubmissionEdit(formData);
  if (!parsed.success)
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  const d = parsed.data;

  // Rate-chain soft block on edit — same as create: a broken chain needs a reason.
  const rateOverrideReason = String(
    formData.get("rateOverrideReason") ?? "",
  ).trim();
  const rateWarnings = rateChainWarnings({
    payRate: d.payRate,
    billRate: d.billRate,
    clientRate: d.clientRate,
  });
  if (rateWarnings.length > 0 && !rateOverrideReason) {
    return {
      needsConfirm: "rate_chain",
      confirmData: { warnings: rateWarnings },
      error: "These rates break the rate chain. Add a reason to save anyway.",
    };
  }

  const existing = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: {
      candidate: { select: { id: true, fullName: true } },
      job: { select: { id: true, title: true } },
      submittedBy: { select: { fullName: true } },
    },
  });
  if (!existing) return { error: "This submission no longer exists." };

  // Re-attribution of "Submitted by" is limited to full-access users
  // (managers / team leads). Recruiter scorecards key off submittedById, so a
  // mis-set submitter previously had no correction path. Recruiters never reach
  // this — the field is locked in their form.
  const canReattribute = canReattributeSubmission(user);
  let newSubmittedById: string | null = null;
  let newSubmitterName = "";
  if (
    canReattribute &&
    d.submittedById &&
    d.submittedById !== existing.submittedById
  ) {
    const target = await prisma.user.findUnique({
      where: { id: d.submittedById },
      select: { id: true, fullName: true },
    });
    if (!target)
      return {
        error: "Please fix the highlighted fields.",
        fieldErrors: { submittedById: "Pick a valid user." },
      };
    newSubmittedById = target.id;
    newSubmitterName = target.fullName;
  }

  // Resolve a previously-saved résumé up front so a bad pick returns cleanly.
  let pickedResume: { id: string; blobUrl: string | null } | null = null;
  if (d.resumeChoice === "existing" && d.candidateResumeId) {
    const resume = await prisma.candidateResume.findUnique({
      where: { id: d.candidateResumeId },
      select: { id: true, blobUrl: true, candidateId: true },
    });
    if (!resume || resume.candidateId !== existing.candidateId)
      return {
        error: "Please fix the highlighted fields.",
        fieldErrors: {
          candidateResumeId: "Pick a resume that belongs to this candidate.",
        },
      };
    pickedResume = { id: resume.id, blobUrl: resume.blobUrl };
  }

  await prisma.$transaction(async (tx) => {
    // Settle the résumé: an existing library entry or none.
    const candidateResumeId = pickedResume?.id ?? null;
    const blobSnapshot = pickedResume?.blobUrl ?? null;

    // Record which fields actually changed, for a meaningful audit entry.
    const changed: string[] = [];
    const compare = (label: string, before: unknown, after: unknown) => {
      if (String(before ?? "") !== String(after ?? "")) changed.push(label);
    };
    compare("notes", existing.submissionNotes, d.submissionNotes);
    // Compare the submitted date at minute precision — the datetime-local input
    // only carries minutes, so a stored seconds component must not count as a change.
    if (
      Math.floor(existing.submittedAt.getTime() / 60000) !==
      Math.floor(d.submittedAt.getTime() / 60000)
    )
      changed.push("submitted date");
    if (
      String(existing.candidateResumeId ?? "") !== String(candidateResumeId ?? "") ||
      String(existing.resumeBlobUrl ?? "") !== String(blobSnapshot ?? "")
    )
      changed.push("resume");
    if (newSubmittedById) changed.push("submitted by");

    await tx.submission.update({
      where: { id: submissionId },
      data: {
        submissionNotes: d.submissionNotes ?? null,
        submittedAt: d.submittedAt,
        candidateResumeId,
        // Snapshot the résumé's blob URL so it survives library edits/deletes.
        resumeBlobUrl: blobSnapshot,
        // Attaching a résumé clears any "not required" waiver (tidy state).
        ...(candidateResumeId ? { resumeWaivedAt: null, resumeWaivedById: null } : {}),
        engagement: d.engagement ?? null,
        vendorRecruiterName: d.vendorRecruiterName ?? null,
        jobDuties: d.jobDuties ?? null,
        payRate: d.payRate ?? null,
        billRate: d.billRate ?? null,
        clientRate: d.clientRate ?? null,
        teamLead: d.teamLead ?? null,
        ...(newSubmittedById ? { submittedById: newSubmittedById } : {}),
      },
    });

    if (changed.length) {
      // Spell out the re-attribution (old → new) so the audit trail is
      // legible without cross-referencing — scorecards depend on it.
      const reattrNote = newSubmittedById
        ? `; submitted-by changed from ${existing.submittedBy.fullName} to ${newSubmitterName}`
        : "";
      await logActivity(tx, {
        entityType: "SUBMISSION",
        action: "SUBMISSION_UPDATED",
        description: `${existing.candidate.fullName} on "${existing.job.title}": submission updated (${changed.join(", ")})${reattrNote}`,
        newValue: changed.join(", "),
        note: rateOverrideReason ? `rate-override:${rateOverrideReason}` : null,
        performedById: user.id,
        submissionId,
      });
    }
  });

  revalidatePath("/submissions");
  revalidatePath(`/submissions/${submissionId}`);
  revalidatePath(`/jobs/${existing.jobId}`);
  revalidatePath(`/candidates/${existing.candidateId}`);
  redirect(`/submissions/${submissionId}`);
}

/**
 * Manual submission status change from the submission detail page (spec §9.8).
 * Optionally records when the event really happened, a note, and (for Rejected
 * / On Hold) a reason category. Returns a `FormState` so the caller can
 * surface validation errors instead of silently dropping the click.
 */
export async function changeSubmissionStatus(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = statusChangeSchema.safeParse({
    id: formData.get("id") ?? "",
    status: formData.get("status") ?? "",
    eventAt: formData.get("eventAt") ?? "",
    note: formData.get("note") ?? "",
    reason: formData.get("reason") ?? "",
    expectedJoinDate: formData.get("expectedJoinDate") ?? "",
    actualJoinDate: formData.get("actualJoinDate") ?? "",
  });
  if (!parsed.success)
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  const d = parsed.data;

  const submission = await prisma.submission.findUnique({
    where: { id: d.id },
    include: {
      candidate: { select: { id: true, fullName: true, status: true } },
      job: { select: { title: true } },
      placement: { select: { id: true, status: true } },
    },
  });
  if (!submission) return { error: "This submission no longer exists." };
  if (submission.status === d.status)
    return { error: "Status is already set to that value." };
  const next = d.status as SubmissionStatus;
  const prev = submission.status;

  // The reason category only applies to the Rejected / On Hold outcomes.
  const reason =
    next === "REJECTED" || next === "ON_HOLD" ? (d.reason ?? null) : null;

  // Emit the most specific audited action for the milestone statuses.
  const action: ActivityAction =
    next === "SELECTED"
      ? "CANDIDATE_SELECTED"
      : next === "REJECTED"
        ? "CANDIDATE_REJECTED"
        : next === "OFFER_RELEASED"
          ? "OFFER_RELEASED"
          : next === "OFFER_ACCEPTED"
            ? "OFFER_ACCEPTED"
            : next === "JOINED"
              ? "CANDIDATE_JOINED"
              : "SUBMISSION_STATUS_CHANGED";

  // §C2: expected join date attaches to OFFER_ACCEPTED, actual to JOINED.
  // We ignore either field when the new status doesn't accept it — keeps a
  // stale value off the row if a recruiter fills it out for the wrong status.
  const joinDates: { expectedJoinDate?: Date; actualJoinDate?: Date } = {};
  if (next === "OFFER_ACCEPTED" && d.expectedJoinDate)
    joinDates.expectedJoinDate = d.expectedJoinDate;
  if (next === "JOINED" && d.actualJoinDate)
    joinDates.actualJoinDate = d.actualJoinDate;

  // Surfaced in the success toast — set when JOINED creates/reactivates a placement.
  let placementSeq: number | null = null;

  await prisma.$transaction(async (tx) => {
    await tx.submission.update({
      where: { id: d.id },
      data: {
        status: next,
        // The note now carries the free-text detail the old rejection-reason
        // textarea did, so the detail page's "Rejection reason" block is unchanged.
        ...(next === "REJECTED" ? { rejectionReason: d.note ?? null } : {}),
        ...joinDates,
      },
    });
    await logActivity(tx, {
      entityType: "SUBMISSION",
      action,
      description: `${submission.candidate.fullName} on "${submission.job.title}": status changed from ${SUBMISSION_STATUS_LABEL[submission.status]} to ${SUBMISSION_STATUS_LABEL[next]}`,
      oldValue: SUBMISSION_STATUS_LABEL[submission.status],
      newValue: SUBMISSION_STATUS_LABEL[next],
      eventAt: d.eventAt ?? null,
      note: d.note ?? null,
      reason,
      performedById: user.id,
      submissionId: d.id,
    });

    // R4.2 — placement lifecycle hooks. Same transaction as the status change
    // so the placement state and the audit row commit together (audit invariant).
    if (next === "JOINED" && prev !== "JOINED") {
      const placement = await ensurePlacementOnJoined(tx, {
        submissionId: d.id,
        candidateId: submission.candidateId,
        jobId: submission.jobId,
        payRate: submission.payRate,
        billRate: submission.billRate,
        clientRate: submission.clientRate,
        candidateFullName: submission.candidate.fullName,
        jobTitle: submission.job.title,
        candidateStatus: submission.candidate.status,
        performedById: user.id,
        eventAt: d.actualJoinDate ?? d.eventAt ?? null,
      });
      placementSeq = placement.placementSeq;
    } else if (
      prev === "JOINED" &&
      next !== "JOINED" &&
      submission.placement &&
      (submission.placement.status === "ACTIVE" ||
        submission.placement.status === "EXTENDED")
    ) {
      await terminatePlacementOnRevert(tx, {
        placementId: submission.placement.id,
        candidateId: submission.candidateId,
        candidateFullName: submission.candidate.fullName,
        candidateStatus: submission.candidate.status,
        newSubmissionStatus: SUBMISSION_STATUS_LABEL[next],
        performedById: user.id,
      });
    }
  });

  revalidatePath("/submissions");
  revalidatePath(`/submissions/${d.id}`);
  revalidatePath(`/jobs/${submission.jobId}`);
  revalidatePath(`/candidates/${submission.candidateId}`);
  return {
    ok: true,
    celebrate: next === "JOINED",
    toast: {
      title: `Status updated to ${SUBMISSION_STATUS_LABEL[next]}`,
      description:
        placementSeq != null
          ? `Placement PLC-${String(placementSeq).padStart(3, "0")} created — set its rates next.`
          : undefined,
    },
  };
}

/** Dedupe + cap the `ids` list a bulk action operates on. */
function bulkIds(formData: FormData): string[] {
  const raw = formData
    .getAll("ids")
    .map((v) => String(v).trim())
    .filter(Boolean);
  return [...new Set(raw)].slice(0, 200);
}

// The only statuses a bulk change may target. These are the "branch" outcomes
// (see branchActions in submission-flow.ts) — none of them is JOINED, so bulk
// can never trigger the placement-creation cascade; and JOINED is terminal, so
// none of the *source* rows can be JOINED either (branchActions returns [] for
// terminals), so bulk can never trigger a placement teardown. That keeps the
// pipeline invariants intact without re-implementing the gates.
const BULK_STATUS_TARGETS = ["ON_HOLD", "REJECTED", "BACKED_OUT"] as const;
type BulkStatusTarget = (typeof BULK_STATUS_TARGETS)[number];

function isBulkStatusTarget(value: string): value is BulkStatusTarget {
  return (BULK_STATUS_TARGETS as readonly string[]).includes(value);
}

export type BulkStatusResult = { changed: number; skipped: number };

/**
 * Bulk status change from the submissions list. Deliberately limited to the safe
 * branch outcomes (On hold / Rejected / Backed out): a submission is only touched
 * when `branchActions(current)` allows the target — so terminal rows, JOINED rows,
 * and rows already at the target are silently skipped, and no placement cascade
 * ever fires. Advance / Mark-joined stay per-submission (they run the iLabor,
 * duplicate, and rate-chain gates + the placement cascade, which shouldn't be
 * bypassed in bulk). Each changed row gets its own audit entry.
 *
 * Returns the real changed/skipped counts so the caller's toast reflects what
 * actually happened rather than how many rows were selected.
 */
export async function bulkChangeSubmissionStatus(
  formData: FormData,
): Promise<BulkStatusResult> {
  const user = await requireUser();
  const ids = bulkIds(formData);
  // Bulk status is restricted to admins / team leads — the blast radius (many
  // rows across the whole team's pipeline in one click) is larger than a
  // recruiter should wield. Single-submission status changes stay open to all.
  if (!hasFullAccess(user)) return { changed: 0, skipped: ids.length };
  const target = String(formData.get("status") ?? "").trim();
  if (ids.length === 0 || !isBulkStatusTarget(target))
    return { changed: 0, skipped: ids.length };
  const next = target as SubmissionStatus;

  const submissions = await prisma.submission.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      status: true,
      jobId: true,
      candidateId: true,
      candidate: { select: { fullName: true } },
      job: { select: { title: true } },
    },
  });

  const action: ActivityAction =
    next === "REJECTED" ? "CANDIDATE_REJECTED" : "SUBMISSION_STATUS_CHANGED";
  // REJECTED / ON_HOLD carry an optional preset reason category, mirroring the
  // single-status form.
  const reason =
    next === "REJECTED" || next === "ON_HOLD"
      ? String(formData.get("reason") ?? "").trim() || null
      : null;

  let changed = 0;
  const touched: { jobId: string; candidateId: string }[] = [];
  for (const s of submissions) {
    // Only apply when the target is a valid branch outcome from this row's
    // current status — this is the invariant guard.
    if (!branchActions(s.status).includes(next)) continue;

    const applied = await prisma.$transaction(async (tx) => {
      // Optimistic-concurrency guard: the update only lands if the row is still
      // at the status we validated against. If it raced (e.g. into JOINED, which
      // owns a placement) since the read above, `count` is 0 and we skip it —
      // so bulk can never flip a row past its lifecycle hooks on a stale snapshot.
      const res = await tx.submission.updateMany({
        where: { id: s.id, status: s.status },
        data: { status: next },
      });
      if (res.count === 0) return false;
      await logActivity(tx, {
        entityType: "SUBMISSION",
        action,
        description: `${s.candidate.fullName} on "${s.job.title}": status changed from ${SUBMISSION_STATUS_LABEL[s.status]} to ${SUBMISSION_STATUS_LABEL[next]} (bulk)`,
        oldValue: SUBMISSION_STATUS_LABEL[s.status],
        newValue: SUBMISSION_STATUS_LABEL[next],
        reason,
        performedById: user.id,
        submissionId: s.id,
      });
      return true;
    });

    if (applied) {
      changed++;
      touched.push({ jobId: s.jobId, candidateId: s.candidateId });
    }
  }

  revalidatePath("/submissions");
  for (const t of new Set(touched.map((x) => x.jobId)))
    revalidatePath(`/jobs/${t}`);
  for (const c of new Set(touched.map((x) => x.candidateId)))
    revalidatePath(`/candidates/${c}`);

  return { changed, skipped: ids.length - changed };
}

// ─── Résumé waiver ("no résumé needed") ──────────────────────────────────────

/** Load a submission for a résumé-waiver change + gate the actor. Waiving is
 *  allowed for the submission's recruiter-of-record OR any full-access user
 *  (manager / team lead). Returns the loaded row, or a FormState error. */
async function loadForResumeWaiver(submissionId: string) {
  const user = await requireUser();
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: {
      id: true,
      submittedById: true,
      candidateResumeId: true,
      resumeBlobUrl: true,
      resumeWaivedAt: true,
      candidateId: true,
      jobId: true,
      candidate: { select: { fullName: true } },
      job: { select: { title: true } },
    },
  });
  if (!submission) return { error: "Submission not found." as const };
  if (!hasFullAccess(user) && user.id !== submission.submittedById)
    return {
      error:
        "Only the submitting recruiter or an admin can change the résumé requirement." as const,
    };
  return { user, submission };
}

function revalidateSubmission(submissionId: string, jobId: string, candidateId: string) {
  revalidatePath("/submissions");
  revalidatePath(`/submissions/${submissionId}`);
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/candidates/${candidateId}`);
  revalidatePath("/"); // dashboard "needs attention"
}

/** Mark a résumé-less submission as "résumé not required" — drops it off the
 *  missing-résumé worklist. No-op (friendly) if a résumé is already attached. */
export async function waiveSubmissionResume(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = String(formData.get("id") ?? "").trim();
  const loaded = await loadForResumeWaiver(id);
  if ("error" in loaded) return { error: loaded.error };
  const { user, submission } = loaded;

  if (submission.candidateResumeId || submission.resumeBlobUrl)
    return { error: "This submission already has a résumé." };
  if (submission.resumeWaivedAt)
    return { ok: true, toast: { title: "Already marked not required" } };

  await prisma.$transaction(async (tx) => {
    await tx.submission.update({
      where: { id },
      data: { resumeWaivedAt: new Date(), resumeWaivedById: user.id },
    });
    await logActivity(tx, {
      entityType: "SUBMISSION",
      action: "SUBMISSION_UPDATED",
      description: `${submission.candidate.fullName} on "${submission.job.title}": résumé marked not required`,
      newValue: "resume waived",
      performedById: user.id,
      submissionId: id,
    });
  });

  revalidateSubmission(id, submission.jobId, submission.candidateId);
  return { ok: true, toast: { title: "Marked — résumé not required" } };
}

/** Undo a résumé waiver — the submission returns to the missing-résumé worklist. */
export async function unwaiveSubmissionResume(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = String(formData.get("id") ?? "").trim();
  const loaded = await loadForResumeWaiver(id);
  if ("error" in loaded) return { error: loaded.error };
  const { user, submission } = loaded;

  if (!submission.resumeWaivedAt)
    return { ok: true, toast: { title: "Not waived" } };

  await prisma.$transaction(async (tx) => {
    await tx.submission.update({
      where: { id },
      data: { resumeWaivedAt: null, resumeWaivedById: null },
    });
    await logActivity(tx, {
      entityType: "SUBMISSION",
      action: "SUBMISSION_UPDATED",
      description: `${submission.candidate.fullName} on "${submission.job.title}": résumé waiver removed`,
      newValue: "resume waiver removed",
      performedById: user.id,
      submissionId: id,
    });
  });

  revalidateSubmission(id, submission.jobId, submission.candidateId);
  return { ok: true, toast: { title: "Waiver removed" } };
}
