import { describe, it, expect } from "vitest";
import { digestEmail, newSubmissionEmail } from "@/server/email-templates";

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
