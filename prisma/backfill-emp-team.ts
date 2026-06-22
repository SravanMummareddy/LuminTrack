/**
 * One-off backfill: give existing recruiters a placeholder EMP ID + team label
 * so the Monthly Performance scorecard has something to group by on a real
 * database (the demo seed already sets these). Idempotent — only touches
 * recruiters whose `empId` is still null, and skips any EMP ID already taken.
 *
 *   npx tsx prisma/backfill-emp-team.ts            # dry run
 *   npx tsx prisma/backfill-emp-team.ts --confirm  # write
 *
 * Admins can edit the assigned values later; these are just non-null seeds.
 */
import { prisma } from "../src/server/db";

const DEFAULT_TEAM = "Unassigned Team";

async function main() {
  const confirm = process.argv.includes("--confirm");

  const recruiters = await prisma.user.findMany({
    where: { role: "RECRUITER", empId: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, fullName: true, teamLabel: true },
  });

  if (recruiters.length === 0) {
    console.log("No recruiters need an EMP ID — nothing to do.");
    return;
  }

  // Find the highest existing EMP-### so we continue the sequence.
  const existing = await prisma.user.findMany({
    where: { empId: { startsWith: "EMP-" } },
    select: { empId: true },
  });
  let next =
    existing.reduce((mx, u) => {
      const n = Number(u.empId?.slice(4));
      return Number.isFinite(n) ? Math.max(mx, n) : mx;
    }, 100) + 1;

  for (const r of recruiters) {
    const empId = `EMP-${next++}`;
    const teamLabel = r.teamLabel ?? DEFAULT_TEAM;
    console.log(`${confirm ? "✓" : "would set"} ${r.fullName} → ${empId} · ${teamLabel}`);
    if (confirm) {
      await prisma.user.update({
        where: { id: r.id },
        data: { empId, teamLabel },
      });
    }
  }

  console.log(
    confirm
      ? `\nBackfilled ${recruiters.length} recruiter(s).`
      : `\nDry run — re-run with --confirm to write ${recruiters.length} change(s).`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
