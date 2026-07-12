/**
 * Wave 7 — plain-HTML email templates (inline styles; email clients strip
 * <style>). Pure string builders, unit-tested. No React-Email dependency until
 * we outgrow ~5 templates.
 */

export type DigestItem = {
  title: string;
  meta: string;
  href: string; // absolute URL
};

const BRAND = "#16794a";
const INK = "#1c1c1a";
const SOFT = "#55554f";
const FAINT = "#8b8b83";
const LINE = "#e4e2da";

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

/** The weekday-morning action-item digest. Returns null when there are no items
 *  (caller skips the send). */
export function digestEmail(opts: {
  recipientName: string;
  items: DigestItem[];
  dashboardUrl: string;
}): { subject: string; html: string } | null {
  if (opts.items.length === 0) return null;
  const first = opts.recipientName.split(" ")[0] || opts.recipientName;
  const n = opts.items.length;
  const rows = opts.items
    .map(
      (it) => `<tr><td style="padding:13px 0;border-top:1px solid ${LINE}">
<a href="${esc(it.href)}" style="text-decoration:none">
<div style="font-size:14px;font-weight:600;color:${INK}">${esc(it.title)}</div>
<div style="font-size:12.5px;color:${SOFT};margin-top:2px">${esc(it.meta)}</div></a></td></tr>`,
    )
    .join("");
  const inner = `<p style="font-size:15px;color:${INK};margin:0 0 4px">Good morning, ${esc(first)}.</p>
<p style="font-size:13.5px;color:${SOFT};margin:0 0 16px">Here's what's waiting on you — ${n} item${n === 1 ? "" : "s"} across your desk.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}
<tr><td style="border-top:1px solid ${LINE}"></td></tr></table>
<a href="${esc(opts.dashboardUrl)}" style="display:inline-block;margin-top:20px;background:${BRAND};color:#fff;font-weight:700;font-size:13.5px;padding:9px 18px;border-radius:8px;text-decoration:none">Open my dashboard →</a>
<p style="font-size:11.5px;color:${FAINT};margin-top:18px;border-top:1px solid ${LINE};padding-top:12px">You're getting this because you have open items in LuminTrack. Turn off the daily digest in Settings › My account.</p>`;
  const subject =
    n === 1 ? "Your day: 1 item needs attention" : `Your day: ${n} items need attention`;
  return { subject, html: shell(inner) };
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
