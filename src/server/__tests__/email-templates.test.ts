import { describe, it, expect } from "vitest";
import {
  digestEmail,
  newSubmissionEmail,
  recruiterAssignedEmail,
} from "@/server/email-templates";
import { groupByUrgency, type TodoItem } from "@/server/pending";

function todo(over: Partial<TodoItem>): TodoItem {
  return {
    kind: "submission_stale",
    urgency: "backlog",
    href: "https://x/submissions/1",
    primary: "An item",
    secondary: "detail",
    ownerId: "u1",
    ownerName: "Someone",
    at: 0,
    ...over,
  };
}

describe("digestEmail", () => {
  const items: TodoItem[] = [
    todo({ urgency: "overdue", primary: "Join date slipped", href: "https://x/submissions/2" }),
    todo({ urgency: "soon", primary: "Interview tomorrow" }),
    todo({ urgency: "backlog", primary: "Job under 2 submissions" }),
  ];

  it("returns null with no personal items and no team (caller skips the send)", () => {
    expect(
      digestEmail({
        recipientName: "Hrishikesh",
        grouped: groupByUrgency([]),
        dashboardUrl: "https://x/",
      }),
    ).toBeNull();
  });

  it("renders each non-empty urgency tier, greets by first name, counts items", () => {
    const out = digestEmail({
      recipientName: "Hrishikesh Rao",
      grouped: groupByUrgency(items),
      dashboardUrl: "https://x/",
    })!;
    expect(out.subject).toBe("Your day: 3 items need attention");
    expect(out.html).toContain("Good morning, Hrishikesh.");
    expect(out.html).toContain("1 need"); // 1 overdue → "1 need action today"
    expect(out.html).toContain("Overdue — action now");
    expect(out.html).toContain("This week");
    expect(out.html).toContain("Backlog");
    expect(out.html).toContain("Join date slipped");
    expect(out.html).toContain("https://x/submissions/2");
  });

  it("singularizes the subject for one item", () => {
    const out = digestEmail({
      recipientName: "A",
      grouped: groupByUrgency([items[0]]),
      dashboardUrl: "https://x/",
    })!;
    expect(out.subject).toBe("Your day: 1 item needs attention");
  });

  it("sends a team-only digest when the lead has no personal items but the team does", () => {
    const out = digestEmail({
      recipientName: "Sriman",
      grouped: groupByUrgency([]),
      dashboardUrl: "https://x/",
      teamSummary: {
        totalOpen: 5,
        members: [{ name: "Sameer", open: 5, overdue: 2 }],
        topItems: [{ primary: "Unlogged interview", secondary: "Sameer · SUB-1" }],
      },
    })!;
    expect(out).not.toBeNull();
    expect(out.subject).toBe("Your team: 5 open items");
    expect(out.html).toContain("Your team — 5 open items");
    expect(out.html).toContain("Sameer");
  });

  it("escapes HTML in item content", () => {
    const out = digestEmail({
      recipientName: "A",
      grouped: groupByUrgency([todo({ primary: "<script>bad</script>", secondary: "x & y" })]),
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
