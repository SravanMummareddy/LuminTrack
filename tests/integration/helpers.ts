import type { PrismaClient } from "@/generated/prisma/client";

/** Wipe every table (except the migration ledger) between tests. Discovered
 *  dynamically so new models never need to be added here by hand. */
export async function truncateAll(prisma: PrismaClient): Promise<void> {
  const rows = await prisma.$queryRawUnsafe<{ tablename: string }[]>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`,
  );
  if (rows.length === 0) return;
  const list = rows.map((r) => `"${r.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

/** Minimal connected graph: admin user → client/vendor → candidate → job →
 *  one SELECTED submission. Enough to exercise the status-change cascades. */
export async function seedBasics(prisma: PrismaClient) {
  const user = await prisma.user.create({
    data: {
      fullName: "Test Admin",
      email: "admin@test.local",
      passwordHash: "x",
      role: "ADMIN",
    },
  });
  const [client, vendor] = await Promise.all([
    prisma.client.create({ data: { name: "Test Client" } }),
    prisma.vendor.create({ data: { name: "Test Vendor" } }),
  ]);
  const candidate = await prisma.candidate.create({
    data: {
      fullName: "Test Candidate",
      status: "AVAILABLE",
      createdBy: { connect: { id: user.id } },
    },
  });
  const job = await prisma.job.create({
    data: {
      title: "Senior Engineer",
      candidateRate: 80,
      client: { connect: { id: client.id } },
      vendor: { connect: { id: vendor.id } },
      createdBy: { connect: { id: user.id } },
    },
  });
  const submission = await prisma.submission.create({
    data: {
      status: "SELECTED",
      candidateRate: 80,
      candidate: { connect: { id: candidate.id } },
      job: { connect: { id: job.id } },
      submittedBy: { connect: { id: user.id } },
    },
  });
  return { user, client, vendor, candidate, job, submission };
}
