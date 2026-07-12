/**
 * Wave 7 — the weekday-morning digest. Runs from a Vercel Cron with NO user
 * session, so it can't use the request-scoped dashboard queries; instead it
 * iterates active orgs, scopes a client per org (mirrors the purge cron), and
 * builds each recruiter's action items directly. One email per recipient, sent
 * only when they have items AND haven't opted out.
 */
import { prisma, scopedPrisma, type ScopedPrisma } from "@/server/db";
import { sendEmail, appUrl } from "@/server/email";
import { digestEmail, type DigestItem } from "@/server/email-templates";
import {
  formatJobDisplayId,
  formatSubmissionDisplayId,
  formatCandidateDisplayId,
} from "@/lib/format";

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function fmtDateTime(d: Date): string {
  return d.toLocaleString("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Build the digest items for one recruiter using an already-org-scoped client. */
export async function buildDigestItems(
  db: ScopedPrisma,
  userId: string,
): Promise<DigestItem[]> {
  const base = appUrl();
  const now = new Date();
  const in2Days = new Date(now.getTime() + 2 * 86_400_000);
  const in30Days = new Date(now.getTime() + 30 * 86_400_000);

  const [assigned, rounds, expiringDocs, noResume] = await Promise.all([
    db.jobAssignment.findMany({
      where: { recruiterId: userId, job: { status: { in: ["OPEN", "ON_HOLD"] } } },
      take: 20,
      select: {
        job: {
          select: {
            id: true,
            seq: true,
            title: true,
            _count: { select: { submissions: true } },
          },
        },
      },
    }),
    db.interviewRound.findMany({
      where: {
        scheduledAt: { gte: now, lte: in2Days },
        result: { in: ["WAITING", "NEED_ANOTHER_ROUND"] },
        submission: { submittedById: userId },
      },
      orderBy: { scheduledAt: "asc" },
      take: 5,
      select: {
        scheduledAt: true,
        submission: {
          select: { id: true, seq: true, candidate: { select: { fullName: true } } },
        },
      },
    }),
    db.candidateDocument.findMany({
      where: {
        category: "WORK_AUTH",
        expiresAt: { gte: now, lte: in30Days },
        candidate: { submissions: { some: { submittedById: userId } } },
      },
      orderBy: { expiresAt: "asc" },
      take: 5,
      select: {
        label: true,
        expiresAt: true,
        candidate: { select: { id: true, seq: true, fullName: true } },
      },
    }),
    db.submission.findMany({
      where: {
        submittedById: userId,
        status: { notIn: ["REJECTED", "JOINED", "BACKED_OUT"] },
        candidateResumeId: null,
        resumeBlobUrl: null,
        resumeWaivedAt: null,
      },
      orderBy: { submittedAt: "asc" },
      take: 5,
      select: { id: true, seq: true, candidate: { select: { fullName: true } } },
    }),
  ]);

  const items: DigestItem[] = [];

  for (const a of assigned.filter((x) => x.job._count.submissions < 2).slice(0, 5)) {
    const n = a.job._count.submissions;
    items.push({
      title: `${a.job.title} — under 2 submissions`,
      meta: `${formatJobDisplayId(a.job)} · ${n} submission${n === 1 ? "" : "s"} so far`,
      href: `${base}/jobs/${a.job.id}`,
    });
  }
  for (const r of rounds) {
    items.push({
      title: `Interview ${fmtDateTime(r.scheduledAt!)}`,
      meta: `${r.submission.candidate?.fullName ?? "Candidate"} · ${formatSubmissionDisplayId(r.submission)} — log the outcome after`,
      href: `${base}/submissions/${r.submission.id}`,
    });
  }
  for (const d of expiringDocs) {
    items.push({
      title: `Work authorization expiring ${d.expiresAt ? fmtDate(d.expiresAt) : "soon"}`,
      meta: `${d.candidate.fullName} · ${d.label} · ${formatCandidateDisplayId(d.candidate)}`,
      href: `${base}/candidates/${d.candidate.id}`,
    });
  }
  for (const s of noResume) {
    items.push({
      title: `Submission missing a résumé`,
      meta: `${formatSubmissionDisplayId(s)} ${s.candidate?.fullName ?? ""} — attach or waive before it advances`,
      href: `${base}/submissions/${s.id}`,
    });
  }

  return items;
}

/** Orchestrate the whole run: every active org → every opted-in recruiter with
 *  items → one email. Returns a small summary for the cron response. */
export async function runDigest(): Promise<{ sent: number; skipped: number }> {
  const orgs = await prisma.organization.findMany({
    where: { isActive: true },
    select: { id: true },
  });
  let sent = 0;
  let skipped = 0;
  const dashboardUrl = `${appUrl()}/`;

  for (const org of orgs) {
    const db = scopedPrisma(org.id);
    const users = await db.user.findMany({
      where: { isActive: true, notifyDigest: true },
      select: { id: true, fullName: true, email: true },
    });
    for (const u of users) {
      const items = await buildDigestItems(db, u.id);
      const email = digestEmail({ recipientName: u.fullName, items, dashboardUrl });
      if (!email) {
        skipped++;
        continue;
      }
      const ok = await sendEmail({ to: u.email, subject: email.subject, html: email.html });
      ok ? sent++ : skipped++;
    }
  }
  return { sent, skipped };
}
