/**
 * Wave 7.2 — the single source of truth for "pending todos". One canonical set
 * of buckets, keyed on a SET of owner user-ids (`[me]` for a recruiter, the team
 * members for a lead, `[uid]` per-recipient in the digest cron). Both the
 * dashboard "Needs attention" card and the digest email read from here, so they
 * finally agree. Every item carries an `urgency` tier (overdue / soon / backlog)
 * and its owner (for the team view's per-item tag).
 *
 * No schema change — every signal derives from existing fields.
 */
import type { ScopedPrisma } from "@/server/db";
import {
  formatSubmissionDisplayId,
  formatJobDisplayId,
  formatCandidateDisplayId,
  formatVendorRequirementDisplayId,
  formatPlacementDisplayId,
  formatDate,
} from "@/lib/format";

export type TodoUrgency = "overdue" | "soon" | "backlog";

export type TodoKind =
  | "interview_to_log"
  | "interview_upcoming"
  | "round_next"
  | "join_slipped"
  | "offer_chase"
  | "resume_missing"
  | "doc_expiring"
  | "job_under_subs"
  | "vpr_to_move"
  | "submission_stale"
  // manager-only action items (org oversight)
  | "rates_pending"
  | "job_past_close"
  | "job_unassigned";

export type TodoItem = {
  kind: TodoKind;
  urgency: TodoUrgency;
  /** Relative href (dashboard uses as-is; digest prepends the app URL). */
  href: string;
  primary: string;
  secondary: string;
  ownerId: string;
  ownerName: string;
  /** Driving timestamp (ms) for intra-tier ordering; smaller = more urgent. */
  at: number;
};

const TAKE = 25;
const DAY = 86_400_000;
const STALE_DAYS = 7;
/** Active-moving statuses (a recruiter should be pushing the next step). */
const MOVING = ["SUBMITTED", "RESUME_PICKED", "VENDOR_SCREENING_CALL", "CLIENT_INTERVIEW"] as const;
/** Terminal — never a todo. */
const TERMINAL = ["REJECTED", "JOINED", "BACKED_OUT"] as const;

/** Urgency of an expiring document: already past → overdue, else soon. */
export function docUrgency(expiresAt: Date | null, now: number): TodoUrgency {
  return expiresAt && expiresAt.getTime() < now ? "overdue" : "soon";
}

const TIER_RANK: Record<TodoUrgency, number> = { overdue: 0, soon: 1, backlog: 2 };

/** Group items into the three urgency tiers, each ordered most-urgent-first. */
export function groupByUrgency(items: TodoItem[]): Record<TodoUrgency, TodoItem[]> {
  const out: Record<TodoUrgency, TodoItem[]> = { overdue: [], soon: [], backlog: [] };
  for (const it of items) out[it.urgency].push(it);
  for (const tier of Object.keys(out) as TodoUrgency[])
    out[tier].sort((a, b) => a.at - b.at);
  return out;
}

/** Stable sort key so a flat list reads overdue → soon → backlog, urgent-first. */
export function sortTodos(items: TodoItem[]): TodoItem[] {
  return [...items].sort(
    (a, b) => TIER_RANK[a.urgency] - TIER_RANK[b.urgency] || a.at - b.at,
  );
}

/**
 * Build the pending todos owned by any of `userIds`. `canSensitive` gates
 * sensitive document categories (IDENTITY / WORK_AUTH) out for non-privileged
 * viewers, matching `getExpiringDocuments`.
 */
export async function getPendingTodos(
  db: ScopedPrisma,
  userIds: string[],
  opts: { canSensitive: boolean },
): Promise<TodoItem[]> {
  if (userIds.length === 0) return [];
  const now = Date.now();
  const in2Days = new Date(now + 2 * DAY);
  const in30Days = new Date(now + 30 * DAY);
  const staleBefore = new Date(now - STALE_DAYS * DAY);
  const inSet = { in: userIds };

  const [rounds, pipeline, missingResume, docs, assigned, vprs] = await Promise.all([
    // Interview rounds — still WAITING or needing another round.
    db.interviewRound.findMany({
      where: {
        result: { in: ["WAITING", "NEED_ANOTHER_ROUND"] },
        submission: { submittedById: inSet },
      },
      orderBy: { scheduledAt: "asc" },
      take: TAKE,
      select: {
        scheduledAt: true,
        result: true,
        roundOrder: true,
        submission: {
          select: {
            id: true,
            seq: true,
            submittedById: true,
            submittedBy: { select: { fullName: true } },
            candidate: { select: { fullName: true } },
            job: { select: { title: true } },
          },
        },
      },
    }),
    // Offer/join pipeline — accepted-but-not-joined past the date, released
    // offers to chase, and active-moving submissions gone stale.
    db.submission.findMany({
      where: {
        submittedById: inSet,
        status: { in: ["OFFER_ACCEPTED", "OFFER_RELEASED", ...MOVING] },
      },
      take: TAKE * 2,
      select: {
        id: true,
        seq: true,
        status: true,
        expectedJoinDate: true,
        updatedAt: true,
        submittedById: true,
        submittedBy: { select: { fullName: true } },
        candidate: { select: { fullName: true } },
        job: { select: { title: true } },
      },
    }),
    // Résumé-less in-flight submissions.
    db.submission.findMany({
      where: {
        submittedById: inSet,
        status: { notIn: [...TERMINAL] },
        candidateResumeId: null,
        resumeBlobUrl: null,
        resumeWaivedAt: null,
      },
      orderBy: { submittedAt: "asc" },
      take: TAKE,
      select: {
        id: true,
        seq: true,
        submittedById: true,
        submittedBy: { select: { fullName: true } },
        candidate: { select: { fullName: true } },
        job: { select: { title: true } },
      },
    }),
    // Documents expiring within 30 days (or already expired). Owner = whoever
    // created the candidate (matches getExpiringDocuments "me" scope).
    db.candidateDocument.findMany({
      where: {
        expiresAt: { not: null, lte: in30Days },
        candidate: { createdById: inSet },
        ...(opts.canSensitive ? {} : { category: { in: ["EDUCATION", "EMPLOYMENT"] } }),
      },
      orderBy: { expiresAt: "asc" },
      take: TAKE,
      select: {
        label: true,
        category: true,
        expiresAt: true,
        candidate: {
          select: {
            id: true,
            seq: true,
            fullName: true,
            createdById: true,
            createdBy: { select: { fullName: true } },
          },
        },
      },
    }),
    // Assigned OPEN/ON_HOLD jobs — filtered to < 2 submissions below (D4).
    db.jobAssignment.findMany({
      where: { recruiterId: inSet, job: { status: { in: ["OPEN", "ON_HOLD"] } } },
      take: TAKE * 2,
      select: {
        recruiterId: true,
        recruiter: { select: { fullName: true } },
        assignedAt: true,
        job: {
          select: {
            id: true,
            seq: true,
            title: true,
            client: { select: { name: true } },
            _count: { select: { submissions: true } },
          },
        },
      },
    }),
    // OPEN vendor requirements waiting to move to a submission.
    db.vendorRequirement.findMany({
      where: {
        recruiterId: inSet,
        status: "OPEN",
        job: { status: { notIn: ["CLOSED", "FILLED", "CANCELLED"] } },
      },
      orderBy: { createdAt: "asc" },
      take: TAKE,
      select: {
        id: true,
        seq: true,
        recruiterId: true,
        recruiter: { select: { fullName: true } },
        job: { select: { title: true } },
        candidate: { select: { fullName: true } },
      },
    }),
  ]);

  const items: TodoItem[] = [];

  for (const r of rounds) {
    const s = r.submission;
    const owner = {
      ownerId: s.submittedById ?? "",
      ownerName: s.submittedBy?.fullName ?? "—",
    };
    const base = {
      href: `/submissions/${s.id}`,
      primary: `${s.candidate?.fullName ?? "Candidate"} · R${r.roundOrder}`,
      ...owner,
    };
    if (r.result === "NEED_ANOTHER_ROUND") {
      items.push({
        ...base,
        kind: "round_next",
        urgency: "soon",
        secondary: `${s.job?.title ?? ""} · schedule the next round`,
        at: r.scheduledAt?.getTime() ?? now,
      });
    } else {
      // WAITING — past/undated = log the outcome (overdue); next 2 days = prep.
      const t = r.scheduledAt?.getTime();
      if (t === undefined || t < now) {
        items.push({
          ...base,
          kind: "interview_to_log",
          urgency: "overdue",
          secondary: `${s.job?.title ?? ""} · ${r.scheduledAt ? `interview ${formatDate(r.scheduledAt)} — log the outcome` : "no date — log the outcome"}`,
          at: t ?? now,
        });
      } else if (r.scheduledAt! <= in2Days) {
        items.push({
          ...base,
          kind: "interview_upcoming",
          urgency: "soon",
          secondary: `${s.job?.title ?? ""} · interview ${formatDate(r.scheduledAt!)}`,
          at: t,
        });
      }
    }
  }

  for (const s of pipeline) {
    const owner = {
      ownerId: s.submittedById ?? "",
      ownerName: s.submittedBy?.fullName ?? "—",
    };
    const who = `${s.candidate?.fullName ?? "Candidate"} → ${s.job?.title ?? "role"}`;
    const id = formatSubmissionDisplayId(s);
    if (s.status === "OFFER_ACCEPTED") {
      if (s.expectedJoinDate && s.expectedJoinDate.getTime() < now)
        items.push({
          kind: "join_slipped",
          urgency: "overdue",
          href: `/submissions/${s.id}`,
          primary: `Join date slipped — ${who}`,
          secondary: `${id} · expected ${formatDate(s.expectedJoinDate)}`,
          ...owner,
          at: s.expectedJoinDate.getTime(),
        });
    } else if (s.status === "OFFER_RELEASED") {
      items.push({
        kind: "offer_chase",
        urgency: "soon",
        href: `/submissions/${s.id}`,
        primary: `Offer released — chase acceptance`,
        secondary: `${who} · ${id}`,
        ...owner,
        at: s.updatedAt.getTime(),
      });
    } else if (s.updatedAt < staleBefore) {
      const days = Math.floor((now - s.updatedAt.getTime()) / DAY);
      items.push({
        kind: "submission_stale",
        urgency: "backlog",
        href: `/submissions/${s.id}`,
        primary: `Submission stalled ${days} days`,
        secondary: `${who} · ${id}`,
        ...owner,
        at: s.updatedAt.getTime(),
      });
    }
  }

  for (const s of missingResume) {
    items.push({
      kind: "resume_missing",
      urgency: "soon",
      href: `/submissions/${s.id}`,
      primary: `Submission missing a résumé`,
      secondary: `${formatSubmissionDisplayId(s)} · ${s.candidate?.fullName ?? ""}`,
      ownerId: s.submittedById ?? "",
      ownerName: s.submittedBy?.fullName ?? "—",
      at: now,
    });
  }

  for (const d of docs) {
    const urgency = docUrgency(d.expiresAt, now);
    const days = d.expiresAt ? Math.ceil((d.expiresAt.getTime() - now) / DAY) : 0;
    const status = days < 0 ? "expired" : days < 1 ? "expires today" : `${days}d left`;
    items.push({
      kind: "doc_expiring",
      urgency,
      href: `/candidates/${d.candidate.id}`,
      primary: `${d.candidate.fullName} · ${d.label}`,
      secondary: `${d.category.replace("_", " ").toLowerCase()} · ${status} · ${formatCandidateDisplayId(d.candidate)}`,
      ownerId: d.candidate.createdById ?? "",
      ownerName: d.candidate.createdBy?.fullName ?? "—",
      at: d.expiresAt?.getTime() ?? now,
    });
  }

  for (const a of assigned) {
    if (a.job._count.submissions >= 2) continue;
    const n = a.job._count.submissions;
    items.push({
      kind: "job_under_subs",
      urgency: "backlog",
      href: `/jobs/${a.job.id}`,
      primary: `${a.job.title} — under 2 submissions`,
      secondary: `${formatJobDisplayId(a.job)} · ${a.job.client?.name ?? ""} · ${n} sub${n === 1 ? "" : "s"}`,
      ownerId: a.recruiterId,
      ownerName: a.recruiter?.fullName ?? "—",
      at: a.assignedAt.getTime(),
    });
  }

  for (const v of vprs) {
    items.push({
      kind: "vpr_to_move",
      urgency: "backlog",
      href: `/vendor-portal/${v.id}`,
      primary: `${formatVendorRequirementDisplayId(v)} · ${v.job?.title ?? ""}`,
      secondary: v.candidate
        ? `${v.candidate.fullName} — ready to move to a submission`
        : "Waiting to move to a submission",
      ownerId: v.recruiterId ?? "",
      ownerName: v.recruiter?.fullName ?? "—",
      at: now,
    });
  }

  return items;
}

/**
 * Manager-only action items — org-wide todos only a manager/admin resolves:
 * placements live with $0 rates, open jobs past their target-close date, and
 * OPEN jobs with no recruiter assigned. Surfaced in the manager's own "My work"
 * tier (not visible to recruiters). Caller gates on `hasFullAccess`.
 */
export async function getManagerActionItems(db: ScopedPrisma): Promise<TodoItem[]> {
  const now = Date.now();
  const nowDate = new Date(now);
  const [ratesPending, pastClose, unassigned] = await Promise.all([
    db.placement.findMany({
      where: { status: { in: ["ACTIVE", "EXTENDED"] }, billRate: 0, payRate: 0 },
      orderBy: { createdAt: "desc" },
      take: TAKE,
      select: {
        id: true,
        seq: true,
        candidate: { select: { fullName: true } },
        job: { select: { title: true } },
      },
    }),
    db.job.findMany({
      where: {
        status: { in: ["OPEN", "ON_HOLD"] },
        targetCloseDate: { not: null, lt: nowDate },
      },
      orderBy: { targetCloseDate: "asc" },
      take: TAKE,
      select: { id: true, seq: true, title: true, targetCloseDate: true },
    }),
    db.job.findMany({
      where: { status: "OPEN", assignments: { none: {} } },
      orderBy: { createdAt: "asc" },
      take: TAKE,
      select: { id: true, seq: true, title: true },
    }),
  ]);

  const items: TodoItem[] = [];
  for (const p of ratesPending)
    items.push({
      kind: "rates_pending",
      urgency: "overdue",
      href: `/placements/${p.id}`,
      primary: `Placement live with rates at $0`,
      secondary: `${p.candidate?.fullName ?? ""} · ${p.job?.title ?? ""} · ${formatPlacementDisplayId(p)}`,
      ownerId: "",
      ownerName: "",
      at: now,
    });
  for (const j of pastClose)
    items.push({
      kind: "job_past_close",
      urgency: "overdue",
      href: `/jobs/${j.id}`,
      primary: `Job past its target-close date`,
      secondary: `${formatJobDisplayId(j)} · ${j.title} · target ${j.targetCloseDate ? formatDate(j.targetCloseDate) : ""}`,
      ownerId: "",
      ownerName: "",
      at: j.targetCloseDate?.getTime() ?? now,
    });
  for (const j of unassigned)
    items.push({
      kind: "job_unassigned",
      urgency: "backlog",
      href: `/jobs/${j.id}`,
      primary: `Open job with no recruiter assigned`,
      secondary: `${formatJobDisplayId(j)} · ${j.title}`,
      ownerId: "",
      ownerName: "",
      at: now,
    });
  return items;
}

export type TeamRollup = {
  teamId: string;
  teamName: string;
  leadName: string | null;
  memberCount: number;
  open: number;
  overdue: number;
  members: { id: string; name: string; open: number; overdue: number }[];
};

/**
 * Org oversight for the manager dashboard: one rollup per team (open + overdue
 * pending counts, worst-first, with per-member breakdown), plus the few most-
 * urgent items across the whole org. One `getPendingTodos` pass per team — fine
 * for the current handful of teams. ponytail: N teams × 6 queries; batch if the
 * org grows past a few dozen teams.
 */
export async function getTeamRollup(
  db: ScopedPrisma,
  opts: { canSensitive: boolean },
): Promise<{ teams: TeamRollup[]; topUrgent: TodoItem[] }> {
  const teams = await db.team.findMany({
    select: {
      id: true,
      name: true,
      lead: { select: { fullName: true } },
      members: { select: { id: true, fullName: true } },
    },
  });

  const all: TodoItem[] = [];
  const rollups = await Promise.all(
    teams.map(async (t) => {
      const memberIds = t.members.map((m) => m.id);
      const todos = memberIds.length
        ? await getPendingTodos(db, memberIds, opts)
        : [];
      all.push(...todos);
      const open = new Map<string, number>();
      const overdue = new Map<string, number>();
      for (const x of todos) {
        open.set(x.ownerId, (open.get(x.ownerId) ?? 0) + 1);
        if (x.urgency === "overdue")
          overdue.set(x.ownerId, (overdue.get(x.ownerId) ?? 0) + 1);
      }
      const members = t.members
        .map((m) => ({
          id: m.id,
          name: m.fullName,
          open: open.get(m.id) ?? 0,
          overdue: overdue.get(m.id) ?? 0,
        }))
        .sort((a, b) => b.open - a.open);
      return {
        teamId: t.id,
        teamName: t.name,
        leadName: t.lead?.fullName ?? null,
        memberCount: t.members.length,
        open: todos.length,
        overdue: todos.filter((x) => x.urgency === "overdue").length,
        members,
      };
    }),
  );

  rollups.sort((a, b) => b.overdue - a.overdue || b.open - a.open);
  return { teams: rollups, topUrgent: sortTodos(all).slice(0, 5) };
}
