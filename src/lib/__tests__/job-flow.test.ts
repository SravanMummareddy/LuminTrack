import { describe, it, expect } from "vitest";
import { jobStatusActions } from "@/lib/job-flow";
import { JobStatus } from "@/generated/prisma/enums";

describe("job-flow — jobStatusActions", () => {
  it("offers Filled / Hold / Close / Cancel from OPEN", () => {
    const nexts = jobStatusActions("OPEN").map((a) => a.next);
    expect(nexts).toEqual(["FILLED", "ON_HOLD", "CLOSED", "CANCELLED"]);
  });

  it("offers Reopen from ON_HOLD (plus Filled/Close/Cancel)", () => {
    const actions = jobStatusActions("ON_HOLD");
    expect(actions[0].next).toBe("OPEN");
    expect(actions.map((a) => a.next)).toContain("CANCELLED");
  });

  it("only offers Reopen from terminal states", () => {
    for (const s of ["CLOSED", "FILLED", "CANCELLED"] as JobStatus[]) {
      const actions = jobStatusActions(s);
      expect(actions).toHaveLength(1);
      expect(actions[0].next).toBe("OPEN");
    }
  });

  it("marks Cancel as a confirm action, and never offers a no-op to the current status", () => {
    for (const s of Object.values(JobStatus)) {
      const actions = jobStatusActions(s);
      expect(actions.every((a) => a.next !== s)).toBe(true);
      const cancel = actions.find((a) => a.next === "CANCELLED");
      if (cancel) expect(cancel.confirm).toBe(true);
    }
  });
});
