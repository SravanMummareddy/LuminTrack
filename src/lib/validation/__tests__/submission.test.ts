import { describe, it, expect } from "vitest";
import {
  submissionSchema,
  submissionEditSchema,
  statusChangeSchema,
} from "@/lib/validation/submission";

const baseCreate = {
  candidateId: "cand1",
  jobId: "job1",
  submittedById: "user1",
  resumeChoice: "none",
};

describe("submissionSchema — identity fields", () => {
  it("accepts a minimal valid submission with no résumé", () => {
    const r = submissionSchema.safeParse(baseCreate);
    expect(r.success).toBe(true);
  });

  it("requires candidate, job, and submitting recruiter", () => {
    for (const field of ["candidateId", "jobId", "submittedById"] as const) {
      const r = submissionSchema.safeParse({ ...baseCreate, [field]: "" });
      expect(r.success, `${field} should be required`).toBe(false);
    }
  });
});

describe("submissionSchema — résumé choice cross-field rules", () => {
  it("'existing' requires a candidateResumeId", () => {
    expect(
      submissionSchema.safeParse({ ...baseCreate, resumeChoice: "existing" })
        .success,
    ).toBe(false);
    expect(
      submissionSchema.safeParse({
        ...baseCreate,
        resumeChoice: "existing",
        candidateResumeId: "res1",
      }).success,
    ).toBe(true);
  });

  it("'new' requires both a label and a valid Drive link", () => {
    expect(
      submissionSchema.safeParse({
        ...baseCreate,
        resumeChoice: "new",
        newResumeLabel: "Resume v2",
      }).success,
    ).toBe(false); // missing link
    expect(
      submissionSchema.safeParse({
        ...baseCreate,
        resumeChoice: "new",
        newResumeLabel: "Resume v2",
        newResumeLink: "https://drive.google.com/file/d/abc",
      }).success,
    ).toBe(true);
  });

  it("an unknown resumeChoice falls back to 'none' (never throws)", () => {
    const r = submissionSchema.safeParse({
      ...baseCreate,
      resumeChoice: "garbage",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.resumeChoice).toBe("none");
  });
});

describe("submissionSchema — bench fields", () => {
  it("empty bench fields parse to undefined, not errors", () => {
    const r = submissionSchema.safeParse({
      ...baseCreate,
      engagement: "",
      vendorRecruiterName: "",
      payRate: "",
      billRate: "",
      teamLead: "",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.engagement).toBeUndefined();
      expect(r.data.payRate).toBeUndefined();
    }
  });

  it("engagement only accepts C2C / W2", () => {
    expect(
      submissionSchema.safeParse({ ...baseCreate, engagement: "C2C" }).success,
    ).toBe(true);
    expect(
      submissionSchema.safeParse({ ...baseCreate, engagement: "1099" }).success,
    ).toBe(false);
  });

  it("rejects negative pay/bill rates and coerces numeric strings", () => {
    expect(
      submissionSchema.safeParse({ ...baseCreate, payRate: "-5" }).success,
    ).toBe(false);
    const ok = submissionSchema.safeParse({ ...baseCreate, billRate: "85" });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.billRate).toBe(85);
  });

  it("rejects a non-numeric rate", () => {
    expect(
      submissionSchema.safeParse({ ...baseCreate, payRate: "abc" }).success,
    ).toBe(false);
  });
});

describe("statusChangeSchema", () => {
  it("accepts every SubmissionStatus including the newer BACKED_OUT", () => {
    for (const status of ["JOINED", "BACKED_OUT", "OFFER_ACCEPTED"]) {
      expect(
        statusChangeSchema.safeParse({ id: "s1", status }).success,
        `${status} should be accepted`,
      ).toBe(true);
    }
  });

  it("rejects an unknown status", () => {
    expect(
      statusChangeSchema.safeParse({ id: "s1", status: "WITHDRAWN" }).success,
    ).toBe(false);
  });

  it("requires an id", () => {
    expect(
      statusChangeSchema.safeParse({ id: "", status: "JOINED" }).success,
    ).toBe(false);
  });
});

describe("submissionEditSchema", () => {
  it("requires a parseable submittedAt date", () => {
    expect(
      submissionEditSchema.safeParse({ resumeChoice: "none", submittedAt: "" })
        .success,
    ).toBe(false);
    expect(
      submissionEditSchema.safeParse({
        resumeChoice: "none",
        submittedAt: "2026-06-01T10:00",
      }).success,
    ).toBe(true);
  });

  it("leaves submittedById optional (absent = unchanged)", () => {
    const r = submissionEditSchema.safeParse({
      resumeChoice: "none",
      submittedAt: "2026-06-01T10:00",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.submittedById).toBeUndefined();
  });
});
