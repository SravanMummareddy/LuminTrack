import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../src/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Fill in .env before seeding.");
}

const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });

const SAMPLE_RECRUITER_PASSWORD = "Recruiter123!";

async function main() {
  // ── Admin user (from env) ──────────────────────────────────────────────────
  const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? "admin@lumintrack.local")
    .trim()
    .toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";
  const adminName = process.env.SEED_ADMIN_NAME ?? "LuminTrack Admin";

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      fullName: adminName,
      passwordHash: await bcrypt.hash(adminPassword, 10),
      role: "ADMIN",
    },
  });

  // ── Sample recruiters ──────────────────────────────────────────────────────
  const recruiterHash = await bcrypt.hash(SAMPLE_RECRUITER_PASSWORD, 10);
  const recruiters = [
    { email: "priya@lumintrack.local", fullName: "Priya Sharma" },
    { email: "marcus@lumintrack.local", fullName: "Marcus Lee" },
  ];
  for (const r of recruiters) {
    await prisma.user.upsert({
      where: { email: r.email },
      update: {},
      create: { ...r, passwordHash: recruiterHash, role: "RECRUITER" },
    });
  }

  // ── Sample organisation entities ───────────────────────────────────────────
  for (const name of ["Sister Company One", "Sister Company Two"]) {
    await prisma.sisterCompanySource.upsert({ where: { name }, update: {}, create: { name } });
  }
  for (const name of ["Apple", "Microsoft"]) {
    await prisma.client.upsert({ where: { name }, update: {}, create: { name } });
  }
  for (const name of ["ABC Staffing", "TalentBridge"]) {
    await prisma.vendor.upsert({ where: { name }, update: {}, create: { name } });
  }

  console.log("Seed complete.");
  console.log(`  Admin login:     ${adminEmail} / (SEED_ADMIN_PASSWORD)`);
  console.log(`  Recruiter logins: ${recruiters.map((r) => r.email).join(", ")}`);
  console.log(`  Recruiter password: ${SAMPLE_RECRUITER_PASSWORD}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
