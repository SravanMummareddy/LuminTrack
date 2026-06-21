import { describe, it, expect, beforeEach, vi } from "vitest";
import { testPrisma } from "./db";
import { truncateAll, seedPlacementScenario } from "./helpers";

vi.mock("@/server/db", async () => {
  const real = await import("./db");
  return { prisma: real.testPrisma, isUniqueConstraintError: real.isUniqueConstraintError };
});
vi.mock("@/lib/session", () => ({ requireUser: vi.fn(), getCurrentUser: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));

import { updatePlacement } from "@/server/actions/placements";
import { requireUser } from "@/lib/session";

let dbReachable = false;
try {
  await testPrisma.$queryRaw`SELECT 1`;
  dbReachable = true;
} catch {
  console.warn("⚠ integration DB unreachable — skipping (run `npm run test:db:up`)");
}

describe.skipIf(!dbReachable)("updatePlacement — rate-edit permission + bench fields", () => {
  let ctx: Awaited<ReturnType<typeof seedPlacementScenario>>;

  beforeEach(async () => {
    await truncateAll(testPrisma);
    ctx = await seedPlacementScenario(testPrisma);
  });

  // The placement edit form always posts startDate (required by the schema).
  function placementForm(fields: Record<string, string>): FormData {
    const fd = new FormData();
    fd.set("id", ctx.placement.id);
    fd.set("startDate", "2026-06-01");
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    return fd;
  }

  it("the recruiter-of-record can edit rates", async () => {
    vi.mocked(requireUser).mockResolvedValue(ctx.recruiterA as never);
    await updatePlacement(undefined as never, placementForm({ billRate: "120", payRate: "85" }));
    const p = await testPrisma.placement.findUnique({ where: { id: ctx.placement.id } });
    expect(Number(p!.billRate)).toBe(120);
    expect(Number(p!.payRate)).toBe(85);
  });

  it("an admin can edit rates", async () => {
    vi.mocked(requireUser).mockResolvedValue(ctx.admin as never);
    await updatePlacement(undefined as never, placementForm({ billRate: "150" }));
    const p = await testPrisma.placement.findUnique({ where: { id: ctx.placement.id } });
    expect(Number(p!.billRate)).toBe(150);
  });

  it("an unrelated recruiter CANNOT edit rates, but can still edit non-rate fields", async () => {
    vi.mocked(requireUser).mockResolvedValue(ctx.recruiterB as never);
    await updatePlacement(
      undefined as never,
      placementForm({ billRate: "999", payRate: "999", remarks: "added a note" }),
    );
    const p = await testPrisma.placement.findUnique({ where: { id: ctx.placement.id } });
    expect(Number(p!.billRate)).toBe(90); // unchanged — rate edit blocked
    expect(Number(p!.payRate)).toBe(70); // unchanged
    expect(p!.remarks).toBe("added a note"); // non-rate edit applied
  });

  it("persists the Bench-Sales sheet fields (organisation / lead / dates / remarks)", async () => {
    vi.mocked(requireUser).mockResolvedValue(ctx.admin as never);
    await updatePlacement(
      undefined as never,
      placementForm({
        organisation: "USEI Technologies",
        teamLead: "Sriman Udugula",
        interviewDate: "2026-05-20",
        placementDate: "2026-06-01",
        remarks: "Net-30 terms",
      }),
    );
    const p = await testPrisma.placement.findUnique({ where: { id: ctx.placement.id } });
    expect(p!.organisation).toBe("USEI Technologies");
    expect(p!.teamLead).toBe("Sriman Udugula");
    expect(p!.interviewDate?.toISOString().slice(0, 10)).toBe("2026-05-20");
    expect(p!.remarks).toBe("Net-30 terms");
  });
});
