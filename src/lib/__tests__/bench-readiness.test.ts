import { describe, it, expect } from "vitest";
import { missingCandidateDetails } from "@/lib/bench-readiness";

const ready = {
  hasResume: true,
  totalExperienceYears: 5,
  technology: "Java",
  workAuthorization: "H1B",
  currentLocation: "Austin, TX",
};

describe("missingCandidateDetails", () => {
  it("returns [] when every required field is present", () => {
    expect(missingCandidateDetails(ready)).toEqual([]);
  });

  it("flags each blank field, treating 0/null/whitespace as missing", () => {
    expect(
      missingCandidateDetails({
        hasResume: false,
        totalExperienceYears: null,
        technology: "",
        workAuthorization: "   ",
        currentLocation: null,
      }),
    ).toEqual(["résumé", "experience", "technology", "visa", "location"]);
  });

  it("treats experience 0 as present but null as missing", () => {
    expect(missingCandidateDetails({ ...ready, totalExperienceYears: 0 })).toEqual([]);
    expect(missingCandidateDetails({ ...ready, totalExperienceYears: null })).toEqual([
      "experience",
    ]);
  });
});
