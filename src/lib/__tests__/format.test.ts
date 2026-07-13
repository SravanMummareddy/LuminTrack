import { describe, it, expect } from "vitest";
import {
  deletedSuffix,
  formatDate,
  jobDuration,
  daysToFirstSubmission,
  avgDaysToFirstSubmission,
  timeToFirstSubmissionLabel,
  formatClientDisplayId,
  formatVendorDisplayId,
  formatSourceDisplayId,
  formatReferrerDisplayId,
  splitFullName,
} from "@/lib/format";

describe("splitFullName", () => {
  it("splits first token vs remainder", () => {
    expect(splitFullName("Jane Smith")).toEqual({ firstName: "Jane", lastName: "Smith" });
    expect(splitFullName("Mary Jane Watson")).toEqual({
      firstName: "Mary",
      lastName: "Jane Watson",
    });
  });
  it("puts a single word entirely in firstName (never leaves both blank)", () => {
    expect(splitFullName("Cher")).toEqual({ firstName: "Cher", lastName: "" });
  });
  it("trims surrounding and internal extra whitespace", () => {
    expect(splitFullName("  Jane   Smith  ")).toEqual({
      firstName: "Jane",
      lastName: "Smith",
    });
  });
});

describe("org-entity display IDs", () => {
  it("pads to 3 digits with the right prefix", () => {
    expect(formatClientDisplayId({ seq: 1 })).toBe("CLI-001");
    expect(formatVendorDisplayId({ seq: 14 })).toBe("VEN-014");
    expect(formatSourceDisplayId({ seq: 7 })).toBe("SRC-007");
    expect(formatReferrerDisplayId({ seq: 123 })).toBe("REF-123");
  });
});

describe("jobDuration", () => {
  it("returns — with no start date", () => {
    expect(jobDuration(null, "2026-06-01")).toBe("—");
  });
  it("is Ongoing when there's a start but no end", () => {
    expect(jobDuration("2026-01-01", null)).toBe("Ongoing");
  });
  it("computes months between start and end", () => {
    expect(jobDuration("2026-01-01", "2026-07-01")).toBe("~6 months");
  });
  it("uses weeks for short spans", () => {
    expect(jobDuration("2026-01-01", "2026-01-15")).toBe("~2 weeks");
  });
  it("returns — when end precedes start", () => {
    expect(jobDuration("2026-07-01", "2026-01-01")).toBe("—");
  });
  it("appends (est.) when the start is an estimate", () => {
    expect(jobDuration("2026-01-01", "2026-07-01", true)).toBe("~6 months (est.)");
    expect(jobDuration("2026-01-01", null, true)).toBe("Ongoing (est.)");
  });
});

describe("deletedSuffix", () => {
  it("is empty for a live record", () => {
    expect(deletedSuffix({ deletedAt: null, erasedAt: null })).toBe("");
    expect(deletedSuffix({})).toBe("");
  });

  it("marks a trashed record (deletedAt set)", () => {
    expect(deletedSuffix({ deletedAt: new Date(), erasedAt: null })).toBe(
      " (deleted)",
    );
  });

  it("marks an erased record (erasedAt set)", () => {
    expect(deletedSuffix({ deletedAt: null, erasedAt: new Date() })).toBe(
      " (deleted)",
    );
  });

  it("accepts string timestamps too", () => {
    expect(deletedSuffix({ deletedAt: "2026-07-08T00:00:00Z" })).toBe(
      " (deleted)",
    );
  });
});

describe("formatDate", () => {
  it("renders a fixed UTC date regardless of runtime zone", () => {
    // A near-midnight UTC instant must not shift a day (hydration determinism).
    expect(formatDate("2026-01-01T00:30:00Z")).toBe("Jan 1, 2026");
  });
});

describe("daysToFirstSubmission (D3/V-5)", () => {
  it("measures whole days from received to first submission", () => {
    expect(daysToFirstSubmission("2026-07-08", "2026-07-14")).toBe(6);
    expect(daysToFirstSubmission("2026-07-08", "2026-07-08")).toBe(0);
  });

  it("is null when there's no submission yet", () => {
    expect(daysToFirstSubmission("2026-07-08", null)).toBeNull();
    expect(daysToFirstSubmission(null, "2026-07-14")).toBeNull();
  });

  it("clamps a pre-logged submission (negative) to 0", () => {
    // Résumé submitted before the job was received — owner's edge case.
    expect(daysToFirstSubmission("2026-07-14", "2026-07-08")).toBe(0);
  });

  it("labels the number", () => {
    expect(timeToFirstSubmissionLabel("2026-07-08", "2026-07-14")).toBe("6 days");
    expect(timeToFirstSubmissionLabel("2026-07-08", "2026-07-09")).toBe("1 day");
    expect(timeToFirstSubmissionLabel("2026-07-08", "2026-07-08")).toBe("Same day");
    expect(timeToFirstSubmissionLabel("2026-07-08", null)).toBe("—");
  });
});

describe("avgDaysToFirstSubmission (V-5 rollup)", () => {
  it("groups by job → earliest submission per job → averages", () => {
    const subs = [
      // job A: received Jul 1; earliest sub Jul 4 = 3 days (a later sub is ignored)
      { jobId: "A", receivedAt: "2026-07-01", submittedAt: "2026-07-04" },
      { jobId: "A", receivedAt: "2026-07-01", submittedAt: "2026-07-09" },
      // job B: received Jul 1; earliest sub Jul 6 = 5 days
      { jobId: "B", receivedAt: "2026-07-01", submittedAt: "2026-07-06" },
    ];
    expect(avgDaysToFirstSubmission(subs)).toBe(4); // (3 + 5) / 2
  });

  it("is null with no rows", () => {
    expect(avgDaysToFirstSubmission([])).toBeNull();
  });

  it("rounds to one decimal", () => {
    const subs = [
      { jobId: "A", receivedAt: "2026-07-01", submittedAt: "2026-07-02" }, // 1
      { jobId: "B", receivedAt: "2026-07-01", submittedAt: "2026-07-03" }, // 2
      { jobId: "C", receivedAt: "2026-07-01", submittedAt: "2026-07-03" }, // 2
    ];
    expect(avgDaysToFirstSubmission(subs)).toBe(1.7); // 5/3 = 1.666…
  });
})
