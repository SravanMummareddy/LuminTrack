/**
 * Wave 7.2 — the weekday-morning digest. Runs from a Vercel Cron with NO user
 * session, so it iterates active orgs and scopes a client per org (mirrors the
 * purge cron). Reads the SAME canonical pending set as the dashboard
 * (`getPendingTodos`), grouped by urgency. A team lead also gets a "Your team"
 * section. One email per opted-in recipient, sent only when they have items.
 */
import { prisma, scopedPrisma, type ScopedPrisma } from "@/server/db";
import { sendEmail, appUrl } from "@/server/email";
import {
  digestEmail,
  type DigestTeamSummary,
} from "@/server/email-templates";
import {
  getPendingTodos,
  groupByUrgency,
  sortTodos,
  type TodoItem,
} from "@/server/pending";
import { leadsAnyTeam, ledTeamMemberIds } from "@/server/team-lead";
import { canViewSensitiveDocs } from "@/lib/permissions";
import type { UserRole } from "@/generated/prisma/enums";

/** Absolutize the relative hrefs the pending module produces (email needs them). */
function absolutize(items: TodoItem[]): TodoItem[] {
  const base = appUrl();
  return items.map((t) => ({ ...t, href: `${base}${t.href}` }));
}

/** Per-team rollup for a lead's digest: member open/overdue counts + the top few
 *  most-urgent items across the team. Null when the lead's team has nothing. */
async function buildTeamSummary(
  db: ScopedPrisma,
  lead: { id: string; role: UserRole },
): Promise<DigestTeamSummary | null> {
  const memberIds = await ledTeamMemberIds(db, lead.id);
  if (memberIds.length === 0) return null;
  const todos = await getPendingTodos(db, memberIds, {
    canSensitive: canViewSensitiveDocs({ role: lead.role }),
  });
  if (todos.length === 0) return null;

  const members = await db.user.findMany({
    where: { id: { in: memberIds } },
    select: { id: true, fullName: true },
  });
  const open = new Map<string, number>();
  const overdue = new Map<string, number>();
  for (const t of todos) {
    open.set(t.ownerId, (open.get(t.ownerId) ?? 0) + 1);
    if (t.urgency === "overdue")
      overdue.set(t.ownerId, (overdue.get(t.ownerId) ?? 0) + 1);
  }
  const memberRows = members
    .map((m) => ({
      name: m.fullName,
      open: open.get(m.id) ?? 0,
      overdue: overdue.get(m.id) ?? 0,
    }))
    .sort((a, b) => b.open - a.open);
  const topItems = sortTodos(todos)
    .slice(0, 3)
    .map((t) => ({ primary: t.primary, secondary: `${t.ownerName} · ${t.secondary}` }));

  return { totalOpen: todos.length, members: memberRows, topItems };
}

/** Orchestrate the whole run: every active org → every opted-in user with items
 *  (or a team) → one email. Returns a small summary for the cron response. */
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
      select: { id: true, fullName: true, email: true, role: true },
    });
    for (const u of users) {
      const canSensitive = canViewSensitiveDocs({ role: u.role });
      const todos = await getPendingTodos(db, [u.id], { canSensitive });
      const teamSummary = (await leadsAnyTeam(db, u.id))
        ? await buildTeamSummary(db, u)
        : null;
      const email = digestEmail({
        recipientName: u.fullName,
        grouped: groupByUrgency(absolutize(todos)),
        dashboardUrl,
        teamSummary,
      });
      if (!email) {
        skipped++;
        continue;
      }
      const ok = await sendEmail({ to: u.email, subject: email.subject, html: email.html });
      if (ok) sent++;
      else skipped++;
    }
  }
  return { sent, skipped };
}
