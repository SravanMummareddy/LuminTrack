import { describe, it, expect, beforeEach, vi } from "vitest";
import { testPrisma } from "./db";
import { truncateAll } from "./helpers";

// Real bench actions → test DB; stub the Next.js request couplings.
vi.mock("@/server/db", async () => {
  const real = await import("./db");
  return { prisma: real.testPrisma, isUniqueConstraintError: real.isUniqueConstraintError };
});
vi.mock("@/lib/session", () => ({ requireUser: vi.fn(), getCurrentUser: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
// updateBenchConsultant / createBenchConsultant end in redirect(); make it a no-op.
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));

import {
  updateBenchConsultant,
  createBenchConsultant,
} from "@/server/actions/bench-consultants";
import { requireUser } from "@/lib/session";

let dbReachable = false;
try {
  await testPrisma.$queryRaw`SELECT 1`;
  dbReachable = true;
} catch {
  console.warn("⚠ integration DB unreachable — skipping (run `npm run test:db:up`)");
}

/** Build a bench-consultant FormData. By default it carries NO credential
 *  fields — exactly like the form a non-admin sees (the inputs aren't rendered). */
function benchForm(fields: Record<string, string>): FormData {
  const fd = new FormData();
  fd.set("fullName", "Marketed Consultant");
  fd.set("priority", "SECOND");
  fd.set("marketingStatus", "ACTIVE");
  fd.set("isActive", "on");
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe.skipIf(!dbReachable)("bench credentials — admin gate (regression)", () => {
  let admin: { id: string; role: string };
  let recruiter: { id: string; role: string };
  let consultantId: string;

  beforeEach(async () => {
    await truncateAll(testPrisma);
    admin = await testPrisma.user.create({
      data: { fullName: "Admin", email: "admin@test.local", passwordHash: "x", role: "ADMIN" },
    });
    recruiter = await testPrisma.user.create({
      data: { fullName: "Recruiter", email: "rec@test.local", passwordHash: "x", role: "RECRUITER" },
    });
    const c = await testPrisma.benchConsultant.create({
      data: {
        fullName: "Marketed Consultant",
        createdById: admin.id,
        currentLocation: "Austin, TX",
        marketingEmail: "mkt@portal.test",
        marketingPassword: "Secret123!",
        marketingNumber: "555-0100",
        personalNumber: "555-0199",
      },
    });
    consultantId = c.id;
  });

  it("a recruiter editing a non-credential field does NOT wipe the credentials", async () => {
    vi.mocked(requireUser).mockResolvedValue(recruiter as never);
    await updateBenchConsultant(
      undefined as never,
      benchForm({ id: consultantId, currentLocation: "New York, NY" }),
    );

    const after = await testPrisma.benchConsultant.findUnique({ where: { id: consultantId } });
    expect(after!.currentLocation).toBe("New York, NY"); // their edit applied
    expect(after!.marketingPassword).toBe("Secret123!"); // creds untouched
    expect(after!.marketingEmail).toBe("mkt@portal.test");
    expect(after!.personalNumber).toBe("555-0199");
  });

  it("a recruiter cannot SET credentials by smuggling them into the form", async () => {
    vi.mocked(requireUser).mockResolvedValue(recruiter as never);
    await updateBenchConsultant(
      undefined as never,
      benchForm({ id: consultantId, marketingPassword: "hijacked" }),
    );
    const after = await testPrisma.benchConsultant.findUnique({ where: { id: consultantId } });
    expect(after!.marketingPassword).toBe("Secret123!"); // unchanged, not "hijacked"
  });

  it("an admin CAN update the credentials", async () => {
    vi.mocked(requireUser).mockResolvedValue(admin as never);
    await updateBenchConsultant(
      undefined as never,
      benchForm({ id: consultantId, marketingPassword: "NewSecret!" }),
    );
    const after = await testPrisma.benchConsultant.findUnique({ where: { id: consultantId } });
    expect(after!.marketingPassword).toBe("NewSecret!");
  });

  it("a recruiter creating a consultant cannot seed credentials (stripped)", async () => {
    vi.mocked(requireUser).mockResolvedValue(recruiter as never);
    await createBenchConsultant(
      undefined as never,
      benchForm({ fullName: "Fresh Consultant", marketingPassword: "sneaky" }),
    );
    const created = await testPrisma.benchConsultant.findFirst({
      where: { fullName: "Fresh Consultant" },
    });
    expect(created).not.toBeNull();
    expect(created!.marketingPassword).toBeNull(); // stripped on create
  });
});
