/**
 * Wave 7 — immediate event emails (fired inline from server actions). Kept
 * separate from the digest cron. Self-contained: loads everything it needs from
 * the submission id so callers just hand over the id + their scoped client.
 * Safe by construction — sendEmail never throws — but callers should still not
 * let it block the user's redirect for long (bounded by sendEmail's 8s timeout).
 */
import type { ScopedPrisma } from "@/server/db";
import { sendEmail, appUrl } from "@/server/email";
import { newSubmissionEmail, recruiterAssignedEmail } from "@/server/email-templates";
import {
  formatSubmissionDisplayId,
  formatVendorRequirementDisplayId,
} from "@/lib/format";

/** Notify the submitting recruiter's team lead that a new submission landed on a
 *  requirement they lead. No-op when there's no lead, no email, the lead opted
 *  out, or the lead is the submitter themselves. */
export async function notifyNewSubmission(
  db: ScopedPrisma,
  submissionId: string,
): Promise<void> {
  const sub = await db.submission.findUnique({
    where: { id: submissionId },
    select: {
      seq: true,
      candidate: { select: { fullName: true } },
      submittedBy: {
        select: {
          id: true,
          fullName: true,
          team: {
            select: {
              lead: {
                select: { id: true, fullName: true, email: true, notifyEvents: true },
              },
            },
          },
        },
      },
      job: { select: { title: true, client: { select: { name: true } } } },
    },
  });
  const lead = sub?.submittedBy?.team?.lead;
  if (
    !sub ||
    !lead ||
    !lead.email ||
    !lead.notifyEvents ||
    lead.id === sub.submittedBy.id
  )
    return;

  const email = newSubmissionEmail({
    leadName: lead.fullName,
    submitterName: sub.submittedBy.fullName,
    candidateName: sub.candidate?.fullName ?? "A candidate",
    jobTitle: sub.job?.title ?? "a role",
    clientName: sub.job?.client?.name ?? null,
    submissionDisplayId: formatSubmissionDisplayId(sub),
    url: `${appUrl()}/submissions/${submissionId}`,
  });
  await sendEmail({ to: lead.email, subject: email.subject, html: email.html });
}

/** Immediate email to the recruiter assigned to a VPR — a team lead's explicit,
 *  intended message, so it IGNORES the `notifyEvents` opt-out (that governs only
 *  the automatic system emails). No-op when no recruiter is assigned. Returns
 *  the recruiter's name when sent (or attempted) so the caller can toast; null
 *  when there was no one to notify. */
export async function notifyRecruiterAssigned(
  db: ScopedPrisma,
  requirementId: string,
  opts: { note?: string | null; actorName: string },
): Promise<string | null> {
  const vpr = await db.vendorRequirement.findUnique({
    where: { id: requirementId },
    select: {
      seq: true,
      teamLead: true,
      billRate: true,
      engagement: true,
      recruiter: { select: { fullName: true, email: true } },
      job: {
        select: { title: true, vendor: { select: { name: true } } },
      },
    },
  });
  const recruiter = vpr?.recruiter;
  if (!vpr || !recruiter || !recruiter.email) return null;

  const email = recruiterAssignedEmail({
    recruiterName: recruiter.fullName,
    teamLeadName: vpr.teamLead ?? opts.actorName,
    jobTitle: vpr.job?.title ?? "a role",
    vendorName: vpr.job?.vendor?.name ?? null,
    vprDisplayId: formatVendorRequirementDisplayId(vpr),
    billRate: vpr.billRate ? `$${vpr.billRate}/hr` : null,
    engagement: vpr.engagement ?? null,
    note: opts.note?.trim() || null,
    url: `${appUrl()}/vendor-portal/${requirementId}`,
  });
  await sendEmail({ to: recruiter.email, subject: email.subject, html: email.html });
  return recruiter.fullName;
}
