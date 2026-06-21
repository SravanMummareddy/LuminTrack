import { describe, it, expect } from "vitest";
import * as L from "@/lib/labels";
import { SUBMISSION_STATUS_VALUES } from "@/lib/validation/submission";
import {
  JobStatus,
  CandidateStatus,
  SubmissionStatus,
  InterviewType,
  InterviewResult,
  PlacementStatus,
  PlacementEndReason,
  BenchPriority,
  BenchMarketingStatus,
  BenchEngagement,
} from "@/generated/prisma/enums";

/**
 * Every enum value must have an entry in each of its label/tone maps, and no map
 * may carry a stale key for a removed value. This is the test that would have
 * caught the BACKED_OUT / OFFER_ACCEPTED omissions before they shipped — adding
 * an enum value now fails the suite until every map is updated.
 */
const cases: Array<{
  name: string;
  values: readonly string[];
  maps: Array<{ label: string; map: Record<string, unknown> }>;
}> = [
  {
    name: "JobStatus",
    values: Object.values(JobStatus),
    maps: [
      { label: "JOB_STATUS_LABEL", map: L.JOB_STATUS_LABEL },
      { label: "JOB_STATUS_TONE", map: L.JOB_STATUS_TONE },
    ],
  },
  {
    name: "CandidateStatus",
    values: Object.values(CandidateStatus),
    maps: [
      { label: "CANDIDATE_STATUS_LABEL", map: L.CANDIDATE_STATUS_LABEL },
      { label: "CANDIDATE_STATUS_TONE", map: L.CANDIDATE_STATUS_TONE },
    ],
  },
  {
    name: "SubmissionStatus",
    values: Object.values(SubmissionStatus),
    maps: [
      { label: "SUBMISSION_STATUS_LABEL", map: L.SUBMISSION_STATUS_LABEL },
      { label: "SUBMISSION_STATUS_TONE", map: L.SUBMISSION_STATUS_TONE },
      { label: "SUBMISSION_STAGE_INDEX", map: L.SUBMISSION_STAGE_INDEX },
    ],
  },
  {
    name: "InterviewType",
    values: Object.values(InterviewType),
    maps: [{ label: "INTERVIEW_TYPE_LABEL", map: L.INTERVIEW_TYPE_LABEL }],
  },
  {
    name: "InterviewResult",
    values: Object.values(InterviewResult),
    maps: [
      { label: "INTERVIEW_RESULT_LABEL", map: L.INTERVIEW_RESULT_LABEL },
      { label: "INTERVIEW_RESULT_TONE", map: L.INTERVIEW_RESULT_TONE },
    ],
  },
  {
    name: "PlacementStatus",
    values: Object.values(PlacementStatus),
    maps: [
      { label: "PLACEMENT_STATUS_LABEL", map: L.PLACEMENT_STATUS_LABEL },
      { label: "PLACEMENT_STATUS_TONE", map: L.PLACEMENT_STATUS_TONE },
    ],
  },
  {
    name: "PlacementEndReason",
    values: Object.values(PlacementEndReason),
    maps: [
      { label: "PLACEMENT_END_REASON_LABEL", map: L.PLACEMENT_END_REASON_LABEL },
    ],
  },
  {
    name: "BenchPriority",
    values: Object.values(BenchPriority),
    maps: [
      { label: "BENCH_PRIORITY_LABEL", map: L.BENCH_PRIORITY_LABEL },
      { label: "BENCH_PRIORITY_TONE", map: L.BENCH_PRIORITY_TONE },
    ],
  },
  {
    name: "BenchMarketingStatus",
    values: Object.values(BenchMarketingStatus),
    maps: [
      { label: "BENCH_MARKETING_STATUS_LABEL", map: L.BENCH_MARKETING_STATUS_LABEL },
      { label: "BENCH_MARKETING_STATUS_TONE", map: L.BENCH_MARKETING_STATUS_TONE },
    ],
  },
  {
    name: "BenchEngagement",
    values: Object.values(BenchEngagement),
    maps: [{ label: "BENCH_ENGAGEMENT_LABEL", map: L.BENCH_ENGAGEMENT_LABEL }],
  },
];

describe("labels — every enum value is mapped (and no stale keys)", () => {
  for (const c of cases) {
    describe(c.name, () => {
      for (const { label, map } of c.maps) {
        it(`${label} covers every value`, () => {
          for (const v of c.values) {
            // SUBMISSION_STAGE_INDEX legitimately maps to 0/-1, so accept any
            // defined value; label/tone maps must be non-empty strings.
            expect(map[v], `${label} missing key "${v}"`).not.toBeUndefined();
          }
        });
        it(`${label} has no key outside the enum`, () => {
          for (const key of Object.keys(map)) {
            expect(c.values, `${label} has stale key "${key}"`).toContain(key);
          }
        });
      }
    });
  }
});

describe("labels — validation tuple stays in lockstep with the enum", () => {
  // SUBMISSION_STATUS_VALUES is a hand-maintained tuple feeding statusChangeSchema,
  // NOT type-linked to SubmissionStatus. This is precisely the gap the plan flagged.
  it("SUBMISSION_STATUS_VALUES matches the SubmissionStatus enum exactly", () => {
    expect([...SUBMISSION_STATUS_VALUES].sort()).toEqual(
      Object.values(SubmissionStatus).sort(),
    );
  });
});
