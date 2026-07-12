import { describe, it, expect } from "vitest";
import {
  digestEmail,
  newSubmissionEmail,
  recruiterAssignedEmail,
} from "@/server/email-templates";

describe("digestEmail", () => {
  const items = [
    { title: "Senior Data Engineer — under 2 submissions", meta: "JOB-118 · 1 submission so far", href: "https://x/jobs/1" },
    { title: "Interview Tue 11:00 AM", meta: "Priya Nair · SUB-341", href: "https://x/submissions/2" },
  ];

  it("returns null on an empty item list (caller skips the send)", () => {
    expect(digestEmail({ recipientName: "Hrishikesh", items: [], dashboardUrl: "https://x/" })).toBeNull();
  });

  it("renders the items, greets by first name, and counts them", () => {
    const out = digestEmail({ recipientName: "Hrishikesh Rao", items, dashboardUrl: "https://x/" })!;
    expect(out).not.toBeNull();
    expect(out.subject).toBe("Your day: 2 items need attention");
    expect(out.html).toContain("Good morning, Hrishikesh.");
    expect(out.html).toContain("Senior Data Engineer — under 2 submissions");
    expect(out.html).toContain("https://x/submissions/2");
  });

  it("singularizes the subject for one item", () => {
    const out = digestEmail({ recipientName: "A", items: [items[0]], dashboardUrl: "https://x/" })!;
    expect(out.subject).toBe("Your day: 1 item needs attention");
  });

  it("escapes HTML in item content", () => {
    const out = digestEmail({
      recipientName: "A",
      items: [{ title: "<script>bad</script>", meta: "x & y", href: "https://x/1" }],
      dashboardUrl: "https://x/",
    })!;
    expect(out.html).not.toContain("<script>bad");
    expect(out.html).toContain("&lt;script&gt;");
    expect(out.html).toContain("x &amp; y");
  });
});

describe("newSubmissionEmail", () => {
  it("names the submitter, candidate, job, and display id; omits null client", () => {
    const out = newSubmissionEmail({
      leadName: "Sriman Iyer",
      submitterName: "Hrishikesh",
      candidateName: "Priya Nair",
      jobTitle: "Senior Data Engineer",
      clientName: null,
      submissionDisplayId: "SUB-342",
      url: "https://x/submissions/9",
    });
    expect(out.subject).toContain("Priya Nair");
    expect(out.html).toContain("Hi Sriman,");
    expect(out.html).toContain("Priya Nair → Senior Data Engineer");
    expect(out.html).toContain("SUB-342");
    expect(out.html).toContain("https://x/submissions/9");
  });
});

describe("recruiterAssignedEmail", () => {
  const base = {
    recruiterName: "Hrishikesh Batta",
    teamLeadName: "Sriman Iyer",
    jobTitle: "Java Full-Stack Developer",
    vendorName: "Meridian Vendor",
    vprDisplayId: "VPR-042",
    billRate: "$92/hr",
    engagement: "C2C",
    url: "https://x/vendor-portal/42",
  };

  it("names the recruiter, team lead, job, vendor, and VPR id", () => {
    const out = recruiterAssignedEmail({ ...base, note: null });
    expect(out.subject).toBe("You've been assigned VPR-042: Java Full-Stack Developer");
    expect(out.html).toContain("Hi Hrishikesh,");
    expect(out.html).toContain("Sriman Iyer assigned a vendor requirement to you.");
    expect(out.html).toContain("Java Full-Stack Developer · Meridian Vendor");
    expect(out.html).toContain("VPR-042");
  });

  it("renders the note block only when a note is present", () => {
    const without = recruiterAssignedEmail({ ...base, note: null });
    expect(without.html).not.toContain("Note from");

    const withNote = recruiterAssignedEmail({
      ...base,
      note: "Priority — 2 by Friday",
    });
    expect(withNote.html).toContain("Note from Sriman Iyer");
    expect(withNote.html).toContain("Priority — 2 by Friday");
  });

  it("escapes HTML in the note", () => {
    const out = recruiterAssignedEmail({ ...base, note: "<b>x</b> & y" });
    expect(out.html).not.toContain("<b>x</b>");
    expect(out.html).toContain("&lt;b&gt;x&lt;/b&gt; &amp; y");
  });
});
