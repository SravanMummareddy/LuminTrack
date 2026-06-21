import { describe, it, expect, beforeEach, vi } from "vitest";
import { testPrisma } from "./db";
import { truncateAll, seedBasics } from "./helpers";

// Point the real server action at the test database, and stub the Next.js
// runtime couplings (auth + cache revalidation) it can't have outside a request.
vi.mock("@/server/db", async () => {
  const real = await import("./db");
  return { prisma: real.testPrisma, isUniqueConstraintError: real.isUniqueConstraintError };
});
vi.mock("@/lib/session", () => ({ requireUser: vi.fn(), getCurrentUser: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));

import { changeSubmissionStatus } from "@/server/actions/submissions";
import { requireUser } from "@/lib/session";

// Auto-skip the whole suite when the Docker test DB isn't up, so it never blocks
// `npm test` / CI's no-DB job. Start it with `npm run test:db:up`.
let dbReachable = false;
try {
  await testPrisma.$queryRaw`SELECT 1`;
  dbReachable = true;
} catch {
  console.warn("⚠ integration DB unreachable — skipping (run `npm run test:db:up`)");
}

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe.skipIf(!dbReachable)("changeSubmissionStatus — real DB cascades", () => {
  let ctx: Awaited<ReturnType<typeof seedBasics>>;

  beforeEach(async () => {
    await truncateAll(testPrisma);
    ctx = await seedBasics(testPrisma);
    vi.mocked(requireUser).mockResolvedValue(ctx.user as never);
  });

  it("JOINED creates a placement and flips the candidate to PLACED", async () => {
    const res = await changeSubmissionStatus(
      undefined as never,
      form({ id: ctx.submission.id, status: "JOINED" }),
    );
    expect(res.ok).toBe(true);

    const placement = await testPrisma.placement.findUnique({
      where: { submissionId: ctx.submission.id },
    });
    expect(placement, "a placement row should exist").not.toBeNull();
    expect(placement!.status).toBe("ACTIVE");
    // My lifecycle default: Date of Placement seeds to the start date.
    expect(placement!.placementDate).not.toBeNull();

    const candidate = await testPrisma.candidate.findUnique({
      where: { id: ctx.candidate.id },
    });
    expect(candidate!.status).toBe("PLACED");

    // The cascade is atomic with the audit log (PLACEMENT_CREATED + status change).
    const actions = (
      await testPrisma.activity.findMany({ select: { action: true } })
    ).map((a) => a.action);
    expect(actions).toContain("PLACEMENT_CREATED");
    expect(actions).toContain("CANDIDATE_JOINED");
  });

  it("reverting JOINED → SELECTED terminates the placement and frees the candidate", async () => {
    await changeSubmissionStatus(
      undefined as never,
      form({ id: ctx.submission.id, status: "JOINED" }),
    );
    await changeSubmissionStatus(
      undefined as never,
      form({ id: ctx.submission.id, status: "SELECTED" }),
    );

    const placement = await testPrisma.placement.findUnique({
      where: { submissionId: ctx.submission.id },
    });
    expect(placement!.status).toBe("TERMINATED"); // soft, not hard-deleted
    expect(placement!.endReason).toBe("OTHER");

    const candidate = await testPrisma.candidate.findUnique({
      where: { id: ctx.candidate.id },
    });
    expect(candidate!.status).toBe("AVAILABLE");
  });

  it("re-JOINING reactivates the same placement (no duplicate row)", async () => {
    await changeSubmissionStatus(undefined as never, form({ id: ctx.submission.id, status: "JOINED" }));
    await changeSubmissionStatus(undefined as never, form({ id: ctx.submission.id, status: "SELECTED" }));
    await changeSubmissionStatus(undefined as never, form({ id: ctx.submission.id, status: "JOINED" }));

    const placements = await testPrisma.placement.findMany({
      where: { submissionId: ctx.submission.id },
    });
    expect(placements).toHaveLength(1);
    expect(placements[0].status).toBe("ACTIVE");
  });

  it("BACKED_OUT is terminal and creates NO placement", async () => {
    const res = await changeSubmissionStatus(
      undefined as never,
      form({ id: ctx.submission.id, status: "BACKED_OUT" }),
    );
    expect(res.ok).toBe(true);

    const placement = await testPrisma.placement.findUnique({
      where: { submissionId: ctx.submission.id },
    });
    expect(placement).toBeNull();

    const candidate = await testPrisma.candidate.findUnique({
      where: { id: ctx.candidate.id },
    });
    expect(candidate!.status).toBe("AVAILABLE"); // unchanged
  });

  it("rejects a no-op status change to the same value", async () => {
    const res = await changeSubmissionStatus(
      undefined as never,
      form({ id: ctx.submission.id, status: "SELECTED" }), // already SELECTED
    );
    expect(res.ok).toBeUndefined();
    expect(res.error).toMatch(/already set/i);
  });
});
