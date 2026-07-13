/**
 * Wave 7 — plain-HTML email templates (inline styles; email clients strip
 * <style>). Pure string builders, unit-tested. No React-Email dependency until
 * we outgrow ~5 templates.
 */
import type { TodoItem, TodoUrgency } from "@/server/pending";

const BRAND = "#16794a";
const INK = "#1c1c1a";
const SOFT = "#55554f";
const FAINT = "#8b8b83";
const LINE = "#e4e2da";
const BLUE = "#2f6db3";

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!,
  );
}

function shell(inner: string, bar = BRAND): string {
  return `<div style="background:#f6f5f1;padding:24px 0;font-family:-apple-system,Segoe UI,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid ${LINE};border-radius:12px;overflow:hidden">
<tr><td style="height:4px;background:${bar};font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td style="padding:24px 26px 26px">
<div style="font-weight:800;font-size:15px;color:${INK};margin-bottom:18px">
<span style="display:inline-block;width:15px;height:15px;background:${BRAND};border-radius:5px;vertical-align:-2px;margin-right:7px"></span>LuminTrack</div>
${inner}
</td></tr></table></td></tr></table></div>`;
}

export type DigestTeamSummary = {
  totalOpen: number;
  members: { name: string; open: number; overdue: number }[];
  topItems: { primary: string; secondary: string }[];
};

const DIGEST_TIERS: { key: TodoUrgency; label: string; color: string }[] = [
  { key: "overdue", label: "Overdue — action now", color: "#d85a30" },
  { key: "soon", label: "This week", color: "#b7791f" },
  { key: "backlog", label: "Backlog", color: "#8b8b83" },
];

/**
 * The weekday-morning action-item digest, grouped by urgency (Wave 7.2 — reads
 * the same canonical pending set as the dashboard). Item hrefs must already be
 * absolute. A team lead gets an extra "Your team" section. Returns null when the
 * recipient has neither personal items nor a non-empty team summary (skip send).
 */
export function digestEmail(opts: {
  recipientName: string;
  grouped: Record<TodoUrgency, TodoItem[]>;
  dashboardUrl: string;
  teamSummary?: DigestTeamSummary | null;
}): { subject: string; html: string } | null {
  const g = opts.grouped;
  const total = g.overdue.length + g.soon.length + g.backlog.length;
  const team =
    opts.teamSummary && opts.teamSummary.totalOpen > 0 ? opts.teamSummary : null;
  if (total === 0 && !team) return null;

  const first = opts.recipientName.split(" ")[0] || opts.recipientName;
  const overdueN = g.overdue.length;

  const tierBlocks = DIGEST_TIERS.map((t) => {
    const items = g[t.key];
    if (items.length === 0) return "";
    const rows = items
      .map(
        (it) => `<tr><td style="padding:9px 0;border-top:1px solid ${LINE}">
<a href="${esc(it.href)}" style="text-decoration:none">
<div style="font-size:13.5px;font-weight:600;color:${INK}">${esc(it.primary)}</div>
<div style="font-size:12px;color:${SOFT};margin-top:1px">${esc(it.secondary)}</div></a></td></tr>`,
      )
      .join("");
    return `<div style="margin-top:16px">
<div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;font-weight:800;color:${t.color}">${esc(t.label)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table></div>`;
  }).join("");

  let teamBlock = "";
  if (team) {
    const memberRows = team.members
      .map(
        (m) => `<tr><td style="font-size:12.5px;padding:3px 8px;color:${INK}">${esc(m.name)}</td>
<td align="right" style="font-size:12.5px;font-weight:700;color:${BLUE};padding:3px 8px">${m.open} open${m.overdue ? ` · ${m.overdue} overdue` : ""}</td></tr>`,
      )
      .join("");
    const topRows = team.topItems
      .map(
        (it) => `<div style="padding:7px 0;border-top:1px solid ${LINE}">
<div style="font-size:13px;font-weight:600;color:${INK}">${esc(it.primary)}</div>
<div style="font-size:12px;color:${SOFT}">${esc(it.secondary)}</div></div>`,
      )
      .join("");
    teamBlock = `<div style="margin-top:18px">
<div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;font-weight:800;color:${BLUE}">Your team — ${team.totalOpen} open item${team.totalOpen === 1 ? "" : "s"}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px;border:1px solid #e8f0f8;border-radius:8px">${memberRows}</table>
${topRows ? `<div style="margin-top:8px">${topRows}</div>` : ""}</div>`;
  }

  const line =
    total > 0
      ? `${total} item${total === 1 ? "" : "s"} on your plate${overdueN ? ` — ${overdueN} need${overdueN === 1 ? "s" : ""} action today` : ""}.`
      : `Your team has ${team!.totalOpen} open item${team!.totalOpen === 1 ? "" : "s"}.`;

  const inner = `<p style="font-size:15px;color:${INK};margin:0 0 3px">Good morning, ${esc(first)}.</p>
<p style="font-size:13px;color:${SOFT};margin:0 0 4px">${esc(line)}</p>
${tierBlocks}${teamBlock}
<a href="${esc(opts.dashboardUrl)}" style="display:inline-block;margin-top:18px;background:${BRAND};color:#fff;font-weight:700;font-size:13.5px;padding:9px 18px;border-radius:8px;text-decoration:none">Open my dashboard →</a>
<p style="font-size:11.5px;color:${FAINT};margin-top:16px;border-top:1px solid ${LINE};padding-top:12px">You're getting this because you have open items in LuminTrack. Turn off the daily digest in Settings › My account.</p>`;

  const subject =
    total === 0
      ? `Your team: ${team!.totalOpen} open item${team!.totalOpen === 1 ? "" : "s"}`
      : total === 1
        ? "Your day: 1 item needs attention"
        : `Your day: ${total} items need attention`;
  return { subject, html: shell(inner, total === 0 && team ? BLUE : BRAND) };
}

/** Immediate email: a recruiter submitted a candidate on a requirement the
 *  recipient (their team lead) leads. */
export function newSubmissionEmail(opts: {
  leadName: string;
  submitterName: string;
  candidateName: string;
  jobTitle: string;
  clientName: string | null;
  submissionDisplayId: string;
  url: string;
}): { subject: string; html: string } {
  const first = opts.leadName.split(" ")[0] || opts.leadName;
  const inner = `<p style="font-size:14px;color:${INK};margin:0 0 4px">Hi ${esc(first)},</p>
<p style="font-size:13.5px;color:${SOFT};margin:0 0 14px">${esc(opts.submitterName)} just submitted a candidate on a requirement you lead.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:13px 0;border-top:1px solid ${LINE};border-bottom:1px solid ${LINE}">
<div style="font-size:14px;font-weight:600;color:${INK}">${esc(opts.candidateName)} → ${esc(opts.jobTitle)}</div>
<div style="font-size:12.5px;color:${SOFT};margin-top:2px">${esc(opts.submissionDisplayId)}${opts.clientName ? " · " + esc(opts.clientName) : ""}</div></td></tr></table>
<a href="${esc(opts.url)}" style="display:inline-block;margin-top:16px;background:${BRAND};color:#fff;font-weight:700;font-size:13.5px;padding:9px 18px;border-radius:8px;text-decoration:none">Review submission →</a>
<p style="font-size:11.5px;color:${FAINT};margin-top:16px;border-top:1px solid ${LINE};padding-top:12px">Turn off these emails in Settings › My account.</p>`;
  return {
    subject: `New submission on your team: ${opts.candidateName}`,
    html: shell(inner, "#d85a30"),
  };
}

/** Immediate email: a team lead assigned a VPR to the recipient (a recruiter),
 *  optionally with a personal note. */
export function recruiterAssignedEmail(opts: {
  recruiterName: string;
  teamLeadName: string;
  jobTitle: string;
  vendorName: string | null;
  vprDisplayId: string;
  billRate: string | null;
  engagement: string | null;
  note: string | null;
  url: string;
}): { subject: string; html: string } {
  const first = opts.recruiterName.split(" ")[0] || opts.recruiterName;
  const terms = [
    opts.billRate ? `Bill ${opts.billRate}` : null,
    opts.engagement ? `engagement ${opts.engagement}` : null,
  ].filter((t): t is string => Boolean(t));
  const metaLine = [opts.vprDisplayId, ...terms].map(esc).join(" · ");
  const noteBlock = opts.note
    ? `<div style="margin-top:14px;border-left:3px solid ${BRAND};background:#f4f8f6;padding:10px 14px;border-radius:0 8px 8px 0">
<div style="font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:${SOFT};font-weight:700">Note from ${esc(opts.teamLeadName)}</div>
<div style="font-size:13.5px;color:${INK};margin-top:3px;white-space:pre-wrap">${esc(opts.note)}</div></div>`
    : "";
  const inner = `<p style="font-size:14px;color:${INK};margin:0 0 4px">Hi ${esc(first)},</p>
<p style="font-size:13.5px;color:${SOFT};margin:0 0 14px">${esc(opts.teamLeadName)} assigned a vendor requirement to you.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:13px 0;border-top:1px solid ${LINE};border-bottom:1px solid ${LINE}">
<div style="font-size:14px;font-weight:600;color:${INK}">${esc(opts.jobTitle)}${opts.vendorName ? " · " + esc(opts.vendorName) : ""}</div>
<div style="font-size:12.5px;color:${SOFT};margin-top:2px">${metaLine}</div></td></tr></table>
${noteBlock}
<a href="${esc(opts.url)}" style="display:inline-block;margin-top:16px;background:${BRAND};color:#fff;font-weight:700;font-size:13.5px;padding:9px 18px;border-radius:8px;text-decoration:none">Open requirement →</a>
<p style="font-size:11.5px;color:${FAINT};margin-top:16px;border-top:1px solid ${LINE};padding-top:12px">A direct message from your team lead in LuminTrack.</p>`;
  return {
    subject: `You've been assigned ${opts.vprDisplayId}: ${opts.jobTitle}`,
    html: shell(inner),
  };
}
