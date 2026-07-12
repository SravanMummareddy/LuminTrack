/**
 * Demo seed — wipes the database and loads ~3 months of realistic recruiting
 * activity (8 users, org entities, 50 jobs, 30 candidates, 160 submissions with
 * lifecycle progression, interview rounds, notes, and a backdated audit trail).
 *
 * Run with:  npx tsx prisma/seed-demo.ts
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { put } from "@vercel/blob";
import { gzipForBlob } from "../src/server/blob-upload";
import { seedRbac } from "../src/server/rbac-seed";
import { orgScopeExtension } from "../src/server/db";
import {
  DEFAULT_ORG_ID,
  DEFAULT_ORG_NAME,
  DEFAULT_ORG_SLUG,
} from "../src/lib/default-org";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "../src/generated/prisma/client";
import type {
  JobStatus,
  SubmissionStatus,
  InterviewType,
  InterviewResult,
  Discipline,
} from "../src/generated/prisma/enums";

// A bulk one-shot script: use a direct TCP connection (DIRECT_URL, the pg
// adapter) rather than the app's Neon serverless WebSocket driver, which is
// flaky for long batch runs from a fresh process. Same adapter the migrations
// and integration tests use.
const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DIRECT_URL / DATABASE_URL is not set. Fill in .env before seeding.");
}
// The UNSCOPED base client — used for the wipe, creating the org, and RBAC
// provisioning. All tenant DATA is created through `prisma` (redefined inside
// main() as the org-scoped client), so every row is auto-stamped with the org.
const baseDb = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

/**
 * Builds a tiny but valid one-page PDF (correct xref offsets computed from byte
 * length, so any title length works). Used to seed real uploaded résumés into
 * private Blob so the demo shows the upload flow, not just Drive links.
 */
function makeSamplePdf(title: string): Buffer {
  const esc = title.replace(/([()\\])/g, "\\$1");
  const stream = `BT /F1 24 Tf 72 700 Td (${esc}) Tj ET`;
  const objs = [
    "<</Type/Catalog/Pages 2 0 R>>",
    "<</Type/Pages/Kids[3 0 R]/Count 1>>",
    "<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Resources<</Font<</F1 5 0 R>>>>/Contents 4 0 R>>",
    `<</Length ${stream.length}>>stream\n${stream}\nendstream`,
    "<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((body, i) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefStart = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}

type SampleBlob = { pathname: string; url: string; size: number };

/** Uploads a few sample résumé PDFs to private Blob once (reused across seeded
 *  résumés). Empty when no Blob token is configured — the seed then falls back
 *  to legacy Drive links so it still runs. */
async function uploadSampleResumeBlobs(): Promise<SampleBlob[]> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.log("  (no BLOB_READ_WRITE_TOKEN — seeding legacy Drive-link résumés)");
    return [];
  }
  const out: SampleBlob[] = [];
  for (const name of ["Sample Resume A", "Sample Resume B", "Sample Resume C"]) {
    const pdf = makeSamplePdf(name);
    // Stored gzip-compressed to match what the serve routes expect (they set
    // Content-Encoding: gzip). Fixed pathname (no random suffix) so re-seeding
    // overwrites the same few sample blobs instead of piling up orphans.
    const blob = await put(
      `resumes/samples/${name.replace(/\s+/g, "-").toLowerCase()}.pdf`,
      gzipForBlob(pdf),
      {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "application/pdf",
      },
    );
    out.push({ pathname: blob.pathname, url: blob.url, size: pdf.length });
  }
  console.log(`  Uploaded ${out.length} sample résumé PDFs to private Blob`);
  return out;
}

// ─── Deterministic RNG (mulberry32) ──────────────────────────────────────────

let seed = 20260521;
function rand(): number {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const randInt = (min: number, max: number) =>
  Math.floor(rand() * (max - min + 1)) + min;
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];
const chance = (p: number) => rand() < p;
function pickN<T>(arr: readonly T[], n: number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.min(n, copy.length));
}
function weighted<T>(entries: readonly [T, number][]): T {
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [v, w] of entries) {
    if ((r -= w) < 0) return v;
  }
  return entries[entries.length - 1][0];
}

// ─── Date helpers ────────────────────────────────────────────────────────────

const DAY = 86_400_000;
const HOUR = 3_600_000;
const NOW = new Date();
const WINDOW_START = new Date(NOW.getTime() - 92 * DAY);

function randDate(start: Date, end: Date): Date {
  const lo = start.getTime();
  const hi = Math.max(lo + HOUR, end.getTime());
  return new Date(lo + rand() * (hi - lo));
}
const daysAgo = (d: Date) => (NOW.getTime() - d.getTime()) / DAY;

// ─── Labels (inlined to keep this script self-contained) ─────────────────────

const SUB_LABEL: Record<SubmissionStatus, string> = {
  SUBMITTED: "Submitted",
  RESUME_PICKED: "Resume Picked",
  VENDOR_SCREENING_CALL: "Vendor Screening Call",
  CLIENT_INTERVIEW: "Client Interview",
  SELECTED: "Selected",
  REJECTED: "Rejected",
  ON_HOLD: "On Hold",
  OFFER_RELEASED: "Offer Released",
  OFFER_ACCEPTED: "Offer Accepted",
  JOINED: "Joined",
  BACKED_OUT: "Backed Out",
};
const JOB_LABEL: Record<JobStatus, string> = {
  OPEN: "Open",
  ON_HOLD: "On Hold",
  CLOSED: "Closed",
  FILLED: "Filled",
  CANCELLED: "Cancelled",
};
const ITYPE_LABEL: Record<InterviewType, string> = {
  VENDOR_SCREENING: "Vendor Screening",
  CLIENT_INTERVIEW: "Client Interview",
  MANAGER_ROUND: "Manager Round",
  HR_ROUND: "HR Round",
  FINAL_ROUND: "Final Round",
  OTHER: "Other",
};
const IRESULT_LABEL: Record<InterviewResult, string> = {
  WAITING: "Waiting",
  NEED_ANOTHER_ROUND: "Need Another Round",
  SELECTED: "Selected",
  REJECTED: "Rejected",
  ON_HOLD: "On Hold",
  COMPLETED: "Completed",
  NO_SHOW: "Didn't happen — no-show",
  CANCELLED: "Didn't happen — cancelled",
};

// ─── Data pools ──────────────────────────────────────────────────────────────

const SHARED_PASSWORD = "LuminTrack2026!";

// Two teams so the Monthly Performance scorecard's team filter has something to
// do. "USEI-Sales IT" is the team named on the June-19 sheet.
const TEAM_A = "USEI-Sales IT";
const TEAM_B = "USEI-Sales IT-2";

// Real people from the June-19 spreadsheet + generated teammates. Tiers:
// CEO (apex) → Manager (Sriman, primary login) → 2 Team Leads (one per team) →
// 8 recruiters. Managers and team leads both have full-management access; the
// CEO + managers sit above teams (teamKey null). Everyone shares SHARED_PASSWORD.
const ADMIN_LOGIN = "sriman@lumintrack.com";
const CEO_LOGIN = "ceo@lumintrack.com";
type RosterUser = {
  fullName: string;
  email: string;
  role: "MANAGER" | "TEAM_LEAD" | "RECRUITER";
  empId: string;
  teamKey: "A" | "B" | null; // null = CEO / manager (above the teams)
};
const USER_ROSTER: RosterUser[] = [
  // ── CEO (org apex; real login, reports to nobody) ──
  { fullName: "Anjali Rao", email: CEO_LOGIN, role: "MANAGER", empId: "INC001", teamKey: null },
  // ── Manager (primary login; reports to the CEO) ──
  { fullName: "Sriman Udugula", email: ADMIN_LOGIN, role: "MANAGER", empId: "INC105", teamKey: null },
  // ── Team leads (one per team, drive VPR planning; report to the manager) ──
  { fullName: "Vikram Reddy", email: "vikram@lumintrack.com", role: "TEAM_LEAD", empId: "INC112", teamKey: "A" },
  { fullName: "Deepa Nair", email: "deepa@lumintrack.com", role: "TEAM_LEAD", empId: "TK2204", teamKey: "B" },
  // ── Recruiters — real (from the sheet's Monthly Performance tab) ──
  { fullName: "Hrishikesh Batta", email: "hrishikesh@lumintrack.com", role: "RECRUITER", empId: "TK2090", teamKey: "A" },
  { fullName: "Sameer Shaik", email: "sameer@lumintrack.com", role: "RECRUITER", empId: "TK2161", teamKey: "A" },
  { fullName: "Akhila Kalyadapu", email: "akhila@lumintrack.com", role: "RECRUITER", empId: "INC83", teamKey: "B" },
  // ── Recruiters — generated ──
  { fullName: "Anil Kumar", email: "anil@lumintrack.com", role: "RECRUITER", empId: "INC121", teamKey: "A" },
  { fullName: "Pooja Verma", email: "pooja@lumintrack.com", role: "RECRUITER", empId: "TK2233", teamKey: "A" },
  { fullName: "Rahul Joshi", email: "rahul@lumintrack.com", role: "RECRUITER", empId: "INC138", teamKey: "B" },
  { fullName: "Sneha Iyer", email: "sneha@lumintrack.com", role: "RECRUITER", empId: "TK2251", teamKey: "B" },
  { fullName: "Karthik Menon", email: "karthik@lumintrack.com", role: "RECRUITER", empId: "INC146", teamKey: "B" },
];

const SOURCE_NAMES = [
  "Lumin Tech Partners",
  "Brightline Partners",
  "Nexus Talent Group",
  "Vertex Solutions",
  "Orion Group",
];
const CLIENT_NAMES = [
  "Apple",
  "Microsoft",
  "JPMorgan Chase",
  "UnitedHealth Group",
  "Verizon",
  "Walt Disney",
  "Comcast",
  "Boeing",
  "Wells Fargo",
  "Cisco Systems",
  "Bank of America",
  "AT&T",
  "Pfizer",
  "Caterpillar",
  "American Express",
  "Lockheed Martin",
];
const VENDOR_NAMES = [
  "ABC Staffing",
  "TalentBridge",
  "Apex Systems",
  "Insight Global",
  "TEKsystems",
  "Cognizant",
  "Collabera",
  "Mastech Digital",
  "Kforce",
  "Robert Half",
  "Randstad Technologies",
  "Judge Group",
  "Artech",
  "Diverse Lynx",
];

const JOB_TITLES = [
  "Senior Java Developer",
  "React Frontend Engineer",
  "Full Stack Engineer",
  "DevOps Engineer",
  "Data Engineer",
  "Data Analyst",
  "Machine Learning Engineer",
  "Cloud Architect",
  "QA Automation Engineer",
  "Product Manager",
  "UX Designer",
  "Scrum Master",
  "Business Analyst",
  ".NET Developer",
  "Python Backend Developer",
  "Salesforce Administrator",
  "Site Reliability Engineer",
  "iOS Developer",
  "Database Administrator",
  "Security Engineer",
];
const LOCATIONS = [
  "Remote",
  "New York, NY",
  "San Francisco, CA",
  "Austin, TX",
  "Chicago, IL",
  "Seattle, WA",
  "Dallas, TX",
  "Boston, MA",
  "Atlanta, GA",
  "Denver, CO",
];
const SKILLS = [
  "Java",
  "Spring Boot",
  "React",
  "TypeScript",
  "Node.js",
  "Python",
  "AWS",
  "Azure",
  "Docker",
  "Kubernetes",
  "SQL",
  "PostgreSQL",
  "MongoDB",
  "GraphQL",
  "Angular",
  "C#",
  ".NET",
  "Go",
  "Terraform",
  "CI/CD",
  "Kafka",
  "Microservices",
  "REST APIs",
  "Jenkins",
  "Selenium",
  "Machine Learning",
  "Tableau",
  "Salesforce",
];
const WORK_AUTH = [
  "US Citizen",
  "Green Card",
  "H1-B",
  "OPT EAD",
  "TN Visa",
  "GC EAD",
];
const CURRENT_COMPANIES = [
  "Infosys",
  "TCS",
  "Accenture",
  "Capgemini",
  "Wipro",
  "Deloitte",
  "IBM",
  "Oracle",
  "HCL",
  "Cognizant",
  "Tech Mahindra",
  "Globant",
];
const FIRST_NAMES = [
  "James",
  "Maria",
  "David",
  "Linda",
  "Wei",
  "Fatima",
  "Carlos",
  "Anita",
  "Kevin",
  "Grace",
  "Omar",
  "Nina",
  "Arjun",
  "Chloe",
  "Sam",
  "Yuki",
  "Diego",
  "Priscilla",
  "Tobias",
  "Hannah",
  "Ravi",
  "Mei",
  "Andre",
  "Sofia",
  "Noah",
  "Leila",
  "Victor",
  "Emma",
  "Hassan",
  "Olivia",
];
const LAST_NAMES = [
  "Smith",
  "Johnson",
  "Patel",
  "Garcia",
  "Chen",
  "Nguyen",
  "Brown",
  "Kim",
  "Lopez",
  "Williams",
  "Singh",
  "Anderson",
  "Martinez",
  "Davis",
  "Khan",
  "Wang",
  "Hernandez",
  "Taylor",
  "Mwangi",
  "Rossi",
];
// ── Bench-Sales sample data pools ──
const BENCH_TECHS = [
  "Java Full Stack",
  "React / Node",
  ".NET Core",
  "Data Engineer",
  "DevOps / AWS",
  "Python / Django",
  "Salesforce",
  "QA Automation",
];
const BENCH_VISAS = ["H1B", "GC", "USC", "OPT-EAD", "H4-EAD", "TN"];
const CALL_TYPES = ["Direct Client", "Implementation Partner", "Tier-1 Vendor"];
const PAYROLL_TYPES = ["C2C", "W2", "1099"];
const PROJECT_TYPES = ["Contract", "Contract-to-Hire", "Full-time"];
const BENCH_REFERENCES = [
  "LinkedIn outreach",
  "Internal referral",
  "Vendor pool",
  "Job board",
  "Repeat consultant",
];
const VENDOR_RECRUITER_NAMES = [
  "Amit (TechProsource)",
  "Lisa Wong (Collabera)",
  "Raj K. (Cybertec)",
  "Megan (Insight Global)",
  "Carlos (Apex Systems)",
];
const JOB_DUTIES_SAMPLES = [
  "Design and build REST microservices; own CI/CD pipeline.",
  "Lead front-end migration to React 19; mentor two juniors.",
  "Build data ingestion pipelines on AWS (Glue, Redshift).",
  "Automate regression suite in Playwright; cut cycle time.",
  "Configure Salesforce flows and Apex triggers for sales ops.",
];
const INTERVIEWERS = [
  "Sarah Chen",
  "Michael Brown",
  "David Kim",
  "Jennifer Lopez",
  "Robert Singh",
  "Amanda White",
  "James Wilson",
  "Lisa Anderson",
];
const TEAM_LEADS = ["Sriman Udugula", "Akhila Kalyadapu", "Sameer Shaik"];
const ORGANISATIONS = [
  "USEI Technologies",
  "Lumin Global Inc",
  "Astra Consulting LLC",
  "Vertex Systems Group",
];
const PLACEMENT_REMARKS = [
  "Client confirmed start; onboarding paperwork in progress.",
  "Remote role, 1 day onsite per month.",
  "Rate locked for 6 months, renewal expected.",
  "Backfill for a prior consultant who rolled off.",
  "Net-30 payment terms with the vendor.",
];
const REJECTION_REASONS = [
  "Client selected another candidate.",
  "Rate expectations above the approved band.",
  "Did not clear the technical round.",
  "Position put on hold by the client.",
  "Candidate accepted another offer.",
  "Insufficient relevant experience for the role.",
  "Communication skills below the bar for a client-facing role.",
  "Failed the vendor screening call.",
];
const JOB_NOTES = [
  "Client wants candidates available to start within 2 weeks.",
  "Vendor confirmed the rate is flexible by a few dollars for the right fit.",
  "Hybrid role — 3 days onsite required, no full remote.",
  "Client prefers local candidates; relocation not covered.",
  "Two open positions under this requirement.",
  "Client asked us to prioritise senior profiles only.",
];
const CANDIDATE_NOTES = [
  "Open to relocation for the right opportunity.",
  "Currently serving a notice period — about 3 weeks out.",
  "Prefers remote-first roles.",
  "Strong communicator — good for client-facing rounds.",
  "Passive candidate; only interested in senior roles.",
  "Has prior experience with this client's tech stack.",
];
const SUBMISSION_NOTES = [
  "Client acknowledged the profile and is reviewing.",
  "Followed up with the vendor on screening feedback.",
  "Candidate confirmed availability for interviews.",
  "Awaiting client decision after the panel.",
  "Vendor wants an updated resume with recent project details.",
  "Candidate is also interviewing elsewhere — moving fast on this one.",
];
const ROUND_NOTES = [
  "Conducted over Zoom.",
  "Panel of two interviewers.",
  "Rescheduled once at the client's request.",
  "Coding exercise plus discussion.",
];

function feedbackFor(result: InterviewResult): string {
  switch (result) {
    case "SELECTED":
      return pick([
        "Strong technical depth and clear communication. Recommended to move forward.",
        "Cleared all areas comfortably. Good culture fit — client is keen.",
      ]);
    case "REJECTED":
      return pick([
        "Gaps in core fundamentals. Not a fit for this role.",
        "Struggled with the system-design discussion.",
      ]);
    case "ON_HOLD":
      return "Panel undecided — client has paused the requirement.";
    case "NEED_ANOTHER_ROUND":
      return "Solid round overall; client would like one more technical screen.";
    case "COMPLETED":
      return "Round completed — feedback shared with the recruiter.";
    default:
      return "";
  }
}

// ─── Collected rows for bulk insert ──────────────────────────────────────────

const activityRows: Prisma.ActivityCreateManyInput[] = [];
const noteRows: Prisma.NoteCreateManyInput[] = [];
const assignmentRows: Prisma.JobAssignmentCreateManyInput[] = [];
const updatedAtFixes: { table: string; id: string; ts: Date }[] = [];

async function chunkedCreateMany<T>(
  rows: T[],
  create: (batch: T[]) => Promise<unknown>,
) {
  for (let i = 0; i < rows.length; i += 200) {
    await create(rows.slice(i, i + 200));
  }
}

const RESUME_LABELS = [
  "General",
  "Backend Engineer",
  "Data Analyst",
  "Full Stack",
  "Cloud / DevOps",
  "Frontend Engineer",
];

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Wiping existing data…");
  // FK-safe order: children before parents. Activity/Note carry nullable FKs to
  // almost everything, so they go first. Then placements → submissions → jobs/
  // candidates → org entities → users. Bench consultants reference both User and
  // Candidate, so they clear before either.
  await baseDb.activity.deleteMany();
  await baseDb.note.deleteMany();
  // VendorRequirement holds Restrict FKs to Job — must go before jobs/candidates.
  await baseDb.vendorRequirement.deleteMany();
  await baseDb.placementExtension.deleteMany();
  await baseDb.placement.deleteMany();
  await baseDb.interviewRound.deleteMany();
  await baseDb.supportProvider.deleteMany();
  await baseDb.benchConsultant.deleteMany();
  await baseDb.submission.deleteMany();
  await baseDb.candidateDocument.deleteMany();
  await baseDb.candidateResume.deleteMany();
  await baseDb.jobAssignment.deleteMany();
  await baseDb.job.deleteMany();
  await baseDb.candidate.deleteMany();
  await baseDb.contact.deleteMany();
  await baseDb.vendor.deleteMany();
  await baseDb.client.deleteMany();
  await baseDb.sisterCompanySource.deleteMany();
  await baseDb.lookupOption.deleteMany();
  // Glossary: notes cascade on user delete, but custom terms Restrict — remove
  // them first so the user wipe doesn't fail.
  await baseDb.customGlossaryTerm.deleteMany();
  await baseDb.glossaryNote.deleteMany();
  // Team ↔ User FKs are both SetNull, so neither delete blocks the other.
  await baseDb.team.deleteMany();
  await baseDb.rolePermission.deleteMany();
  await baseDb.role.deleteMany();
  await baseDb.permission.deleteMany();
  await baseDb.user.deleteMany();
  // Organizations last — users/roles hold Restrict FKs to it, so they clear first.
  await baseDb.organization.deleteMany();

  // ── Default organization (tenant boundary) ──
  // Every row below belongs to this one org. `prisma` is redefined here as the
  // org-scoped client, so all the create/createMany calls that follow are
  // auto-stamped with `organizationId` — no per-row change needed.
  await baseDb.organization.create({
    data: { id: DEFAULT_ORG_ID, name: DEFAULT_ORG_NAME, slug: DEFAULT_ORG_SLUG },
  });
  const prisma = baseDb.$extends(orgScopeExtension(DEFAULT_ORG_ID));

  // ── Learned dropdown values (a few non-default extras, to show the
  //    "remembered" behaviour alongside the curated defaults) ──
  await prisma.lookupOption.createMany({
    data: [
      { category: "WORK_AUTH", value: "H-1B1" },
      { category: "WORK_AUTH", value: "GC-EAD (i485)" },
      { category: "WORKING_TYPE", value: "Contract-to-hire" },
      { category: "CALL_TYPE", value: "C2C only" },
      { category: "PAYROLL_TYPE", value: "1099-NEC" },
    ],
    skipDuplicates: true,
  });

  // ── Users ──
  console.log("Creating users…");
  const passwordHash = await bcrypt.hash(SHARED_PASSWORD, 10);
  const adminCreatedAt = new Date(WINDOW_START.getTime() - 5 * DAY);

  const allUsers: {
    id: string;
    fullName: string;
    role: string;
    email: string;
    teamKey: "A" | "B" | null;
  }[] = [];
  for (const u of USER_ROSTER) {
    const created = await prisma.user.create({
      data: {
        email: u.email,
        fullName: u.fullName,
        passwordHash,
        role: u.role,
        empId: u.empId,
        createdAt: adminCreatedAt,
        updatedAt: adminCreatedAt,
      },
      select: { id: true, fullName: true, role: true, email: true },
    });
    allUsers.push({ ...created, teamKey: u.teamKey });
  }
  // RBAC: seed the permission catalog + system roles and backfill each user's
  // roleId from its enum role (idempotent — see src/server/rbac-seed.ts).
  await seedRbac(baseDb, DEFAULT_ORG_ID);
  // Sriman is the primary manager (used as createdBy / assignedBy across the seed).
  const admin = allUsers.find((u) => u.email === ADMIN_LOGIN)!;
  const ceo = allUsers.find((u) => u.email === CEO_LOGIN)!;

  // ── Org: named teams + the reporting chain ──
  // Each team is led by the TEAM_LEAD carrying its teamKey.
  const leadByKey: Record<"A" | "B", (typeof allUsers)[number]> = {
    A: allUsers.find((u) => u.role === "TEAM_LEAD" && u.teamKey === "A")!,
    B: allUsers.find((u) => u.role === "TEAM_LEAD" && u.teamKey === "B")!,
  };
  const teamByKey: Record<"A" | "B", { id: string }> = {
    A: await prisma.team.create({ data: { name: TEAM_A, leadId: leadByKey.A.id } }),
    B: await prisma.team.create({ data: { name: TEAM_B, leadId: leadByKey.B.id } }),
  };
  // Wire team membership + reporting line: recruiter → its team's lead;
  // team lead → the manager; manager → the CEO; CEO → nobody (apex).
  for (const u of allUsers) {
    if (u.email === CEO_LOGIN) continue;
    const data: { teamId?: string; reportsToId?: string } = {};
    if (u.teamKey) data.teamId = teamByKey[u.teamKey].id;
    if (u.role === "RECRUITER" && u.teamKey) data.reportsToId = leadByKey[u.teamKey].id;
    else if (u.role === "TEAM_LEAD") data.reportsToId = admin.id;
    else if (u.role === "MANAGER") data.reportsToId = ceo.id;
    await prisma.user.update({ where: { id: u.id }, data });
  }
  const leadNameByKey: Record<"A" | "B", string> = {
    A: leadByKey.A.fullName,
    B: leadByKey.B.fullName,
  };

  // Submissions/assignments are attributed to RECRUITER-role users only, so the
  // Monthly Performance scorecard (recruiters only) reconciles. Managers and team
  // leads show zero activity — matching Sriman's row on the sheet.
  const recruiters = allUsers.filter((u) => u.role === "RECRUITER");
  const leadCount = allUsers.filter((u) => u.role !== "RECRUITER").length;

  // ── Org entities ──
  console.log("Creating organisation entities…");
  const sources = [];
  for (const name of SOURCE_NAMES) {
    sources.push(
      await prisma.sisterCompanySource.create({
        data: {
          name,
          contactPerson: pick(FIRST_NAMES) + " " + pick(LAST_NAMES),
          email: name.toLowerCase().replace(/[^a-z]/g, "") + "@partners.com",
          createdAt: adminCreatedAt,
          updatedAt: adminCreatedAt,
        },
        select: { id: true },
      }),
    );
  }
  const clients = [];
  for (const name of CLIENT_NAMES) {
    clients.push(
      await prisma.client.create({
        data: {
          name,
          location: pick(LOCATIONS),
          createdAt: adminCreatedAt,
          updatedAt: adminCreatedAt,
        },
        select: { id: true, name: true },
      }),
    );
  }
  const vendors = [];
  for (const name of VENDOR_NAMES) {
    // "Recruited by" — the team member who owns this vendor. ~75% link to a real
    // user; the rest use a free-typed name (someone not in the system) so both
    // storage paths are exercised in the demo.
    const linkOwner = chance(0.75);
    const owner = pick(allUsers);
    vendors.push(
      await prisma.vendor.create({
        data: {
          name,
          contactPerson: pick(FIRST_NAMES) + " " + pick(LAST_NAMES),
          email: name.toLowerCase().replace(/[^a-z]/g, "") + "@vendor.com",
          recruitedById: linkOwner ? owner.id : null,
          recruitedByName: linkOwner
            ? null
            : pick(FIRST_NAMES) + " " + pick(LAST_NAMES),
          createdAt: adminCreatedAt,
          updatedAt: adminCreatedAt,
        },
        select: { id: true },
      }),
    );
  }

  // ── Support providers (external interview-support individuals) ──
  const SUPPORT_PROVIDERS: {
    name: string;
    discipline: "IT" | "NON_IT";
    skills: string[];
  }[] = [
    { name: "Arjun Mehta", discipline: "IT", skills: ["Java", "Spring Boot", "Microservices"] },
    { name: "Wei Chen", discipline: "IT", skills: [".NET", "C#", "Azure"] },
    { name: "Sofia Álvarez", discipline: "IT", skills: ["React", "Node.js", "TypeScript"] },
    { name: "Daniel Owusu", discipline: "IT", skills: ["Python", "Django", "AWS"] },
    { name: "Priyanka Rao", discipline: "NON_IT", skills: ["Pharmacovigilance", "Clinical Data", "Regulatory"] },
  ];
  const supportProviders = [];
  for (const sp of SUPPORT_PROVIDERS) {
    supportProviders.push(
      await prisma.supportProvider.create({
        data: {
          name: sp.name,
          email: sp.name.toLowerCase().replace(/[^a-z]/g, "") + "@support.dev",
          phone: `+1 (312) 555-0${randInt(100, 199)}`,
          discipline: sp.discipline,
          skills: sp.skills,
          reference: chance(0.6) ? pick(FIRST_NAMES) + " " + pick(LAST_NAMES) : null,
          createdAt: adminCreatedAt,
          updatedAt: adminCreatedAt,
        },
        select: { id: true },
      }),
    );
  }
  const SUPPORT_METHODS = [
    "Live audio support during the technical round.",
    "On-call assistance for system-design questions.",
    "Screen-share guidance through the coding task.",
    "Prepped answers and stayed on the line as backup.",
  ];

  // ── Jobs + assignments ──
  console.log("Creating 50 jobs…");
  const jobs: {
    id: string;
    title: string;
    createdAt: Date;
    payBase: number;
    clientRate: number | null;
    assigneeIds: string[];
    status: JobStatus;
  }[] = [];

  const JOB_STATUS_W: [JobStatus, number][] = [
    ["OPEN", 52],
    ["ON_HOLD", 13],
    ["FILLED", 14],
    ["CLOSED", 13],
    ["CANCELLED", 8],
  ];

  for (let i = 0; i < 50; i++) {
    const title = pick(JOB_TITLES);
    const createdAt = randDate(
      WINDOW_START,
      new Date(NOW.getTime() - 2 * DAY),
    );
    const status = weighted(JOB_STATUS_W);
    const vendorRate = randInt(75, 150);
    // Pay-rate anchor used to derive each candidate's pay/bill below. NOT a DB
    // field — the legacy single "candidate rate" was retired; the DB stores only
    // pay/bill (per submission/requirement) plus vendor/client rate (per job).
    const payBase = vendorRate - randInt(8, 22);
    // Client rate sits at the top of the chain (Client >= Bill >= Pay). Set on
    // ~80% of jobs; the vendor leaves it undisclosed on the rest (nullable).
    // +30..55 over the pay anchor keeps it above any generated bill rate.
    const clientRate = chance(0.8) ? payBase + randInt(30, 55) : null;
    const creator = chance(0.7) ? admin : pick(recruiters);
    const client = pick(clients);

    const job = await prisma.job.create({
      data: {
        title,
        location: pick(LOCATIONS),
        vendorRate,
        clientRate,
        status,
        // IT-heavy split for a tech-recruiting firm; ~15% left null so the
        // "not set" state is represented too.
        discipline: (chance(0.15)
          ? null
          : chance(0.75)
            ? "IT"
            : "NON_IT") as Discipline | null,
        description: `${title} opening at ${client.name}. ${randInt(
          4,
          10,
        )}+ years of experience required. Solid hands-on skills expected across the core stack.`,
        notes: chance(0.4) ? pick(JOB_NOTES) : null,
        clientId: client.id,
        vendorId: pick(vendors).id,
        sisterCompanySourceId: pick(sources).id,
        // Optional job-detail fields — populated on a subset so the columns have data.
        positions: chance(0.5) ? randInt(1, 4) : null,
        createdById: creator.id,
        // D3: requirements arrive 0–5 days before they're logged — so the
        // demo's time-to-first-submission reflects the real gap.
        receivedAt: new Date(createdAt.getTime() - randInt(0, 5) * 86_400_000),
        createdAt,
        updatedAt: createdAt,
      },
      select: { id: true },
    });

    activityRows.push({
      entityType: "JOB",
      action: "JOB_CREATED",
      description: `Job "${title}" created`,
      performedById: creator.id,
      jobId: job.id,
      createdAt,
    });

    // Assignments — 1 to 3 recruiters, but ~15% of jobs are left unassigned so
    // the recruiter assignment gate / self-claim flow can be tested.
    const assignees = chance(0.15) ? [] : pickN(recruiters, randInt(1, 3));
    for (const r of assignees) {
      const assignedAt = new Date(createdAt.getTime() + randInt(1, 36) * HOUR);
      assignmentRows.push({
        jobId: job.id,
        recruiterId: r.id,
        assignedById: admin.id,
        assignedAt,
      });
      activityRows.push({
        entityType: "JOB",
        action: "RECRUITER_ASSIGNED",
        description: `${r.fullName} assigned to the job`,
        performedById: admin.id,
        jobId: job.id,
        createdAt: assignedAt,
      });
    }

    let jobUpdatedAt = createdAt;

    // Non-OPEN jobs got a status change partway through the window.
    if (status !== "OPEN") {
      const changeAt = randDate(
        new Date(createdAt.getTime() + 5 * DAY),
        NOW,
      );
      activityRows.push({
        entityType: "JOB",
        action: "JOB_UPDATED",
        description: `Status changed from Open to ${JOB_LABEL[status]}`,
        oldValue: "Open",
        newValue: JOB_LABEL[status],
        performedById: admin.id,
        jobId: job.id,
        createdAt: changeAt,
      });
      jobUpdatedAt = changeAt;
    }

    updatedAtFixes.push({ table: "Job", id: job.id, ts: jobUpdatedAt });
    jobs.push({
      id: job.id,
      title,
      createdAt,
      payBase,
      clientRate,
      assigneeIds: assignees.map((r) => r.id),
      status,
    });
  }

  // ── Candidates ──
  console.log("Creating 30 candidates…");
  const candidates: {
    id: string;
    fullName: string;
    createdAt: Date;
    status: string;
    resumes: { id: string; blobUrl: string | null }[];
  }[] = [];
  const CANDIDATE_TAGS = ["java", "react", "remote", "senior", "urgent", "passive", "h1b", "local"];
  const CANDIDATE_SOURCES = ["LinkedIn", "Referral", "Job board", "Vendor pool", "Repeat consultant"];
  const sampleBlobs = await uploadSampleResumeBlobs();
  let resumeCount = 0;
  for (let i = 0; i < 30; i++) {
    const first = pick(FIRST_NAMES);
    const last = pick(LAST_NAMES);
    const fullName = `${first} ${last}`;
    const createdAt = randDate(
      WINDOW_START,
      new Date(NOW.getTime() - 3 * DAY),
    );
    const creator = pick(recruiters);
    // Mostly AVAILABLE; a few NOT_INTERESTED / DO_NOT_CONTACT for status variety.
    // (The join cascade later overrides placed candidates to PLACED.)
    const status = weighted<string>([
      ["AVAILABLE", 8],
      ["NOT_INTERESTED", 1],
      ["DO_NOT_CONTACT", 1],
    ]);
    // Total (headline) vs real-time (actual hands-on) experience — the latter is
    // a few years lower. Both live on the candidate (source of truth).
    const totalExp = randInt(2, 16) + (chance(0.5) ? 0.5 : 0);
    const realTimeExp = Math.max(1, totalExp - randInt(1, 4));
    // "Working now?" — independent of Placement (may be an external engagement).
    const isWorking = chance(0.35);

    const candidate = await prisma.candidate.create({
      data: {
        firstName: first,
        lastName: last,
        fullName,
        email: `${first}.${last}${i}`.toLowerCase() + "@example.com",
        phone: `+1 ${randInt(200, 989)}-${randInt(200, 989)}-${randInt(
          1000,
          9999,
        )}`,
        currentLocation: pick(LOCATIONS),
        workAuthorization: pick(WORK_AUTH),
        totalExperienceYears: totalExp,
        realTimeExperienceYears: realTimeExp,
        technology: pick(BENCH_TECHS),
        isWorking,
        workingType: isWorking ? pick(["C2C", "W2", "Full-time", "Contract-to-hire"]) : null,
        currentCompany: pick(CURRENT_COMPANIES),
        // IT vs Non-IT domain; ~15% left null (not yet classified).
        discipline: (chance(0.15)
          ? null
          : chance(0.75)
            ? "IT"
            : "NON_IT") as Discipline | null,
        skills: pickN(SKILLS, randInt(4, 8)),
        linkedinUrl: `https://www.linkedin.com/in/${first}-${last}-${i}`.toLowerCase(),
        notes: chance(0.35) ? pick(CANDIDATE_NOTES) : null,
        status: status as never,
        tags: chance(0.5) ? pickN(CANDIDATE_TAGS, randInt(1, 3)) : [],
        lastContactedAt: chance(0.6) ? randDate(createdAt, NOW) : null,
        source: chance(0.5) ? pick(CANDIDATE_SOURCES) : null,
        createdById: creator.id,
        createdAt,
        updatedAt: createdAt,
      },
      select: { id: true },
    });

    // Résumé library — most candidates keep 1-3 uploaded PDF résumés (rotating
    // through the sample blobs). Skipped entirely if no Blob store is configured.
    const resumes: { id: string; blobUrl: string | null }[] = [];
    if (chance(0.8) && sampleBlobs.length) {
      const labels = pickN(RESUME_LABELS, randInt(1, 3));
      for (let j = 0; j < labels.length; j++) {
        // A few résumés are archived (soft-deleted) so the "Show archived" chip
        // on the candidate page has data. Archived ones aren't offered for
        // submission, so only active ones go into the pick pool below.
        const isActive = chance(0.85);
        const sample = sampleBlobs[(i + j) % sampleBlobs.length];
        const created = await prisma.candidateResume.create({
          data: {
            candidateId: candidate.id,
            label: labels[j],
            blobPathname: sample.pathname,
            blobUrl: sample.url,
            contentType: "application/pdf",
            sizeBytes: sample.size,
            isActive,
            createdAt,
          },
          select: { id: true, blobUrl: true },
        });
        if (isActive) {
          resumes.push(created);
        }
        resumeCount++;
      }
    }

    activityRows.push({
      entityType: "CANDIDATE",
      action: "CANDIDATE_CREATED",
      description: `Candidate "${fullName}" created`,
      performedById: creator.id,
      candidateId: candidate.id,
      createdAt,
    });
    updatedAtFixes.push({ table: "Candidate", id: candidate.id, ts: createdAt });
    candidates.push({ id: candidate.id, fullName, createdAt, status, resumes });
  }

  // ── Submissions + interview rounds ──
  console.log("Creating 160 submissions with lifecycle…");
  const PIPELINE: SubmissionStatus[] = [
    "SUBMITTED",
    "RESUME_PICKED",
    "VENDOR_SCREENING_CALL",
    "CLIENT_INTERVIEW",
  ];

  function pickFinalStatus(age: number): SubmissionStatus {
    if (age < 8)
      return weighted<SubmissionStatus>([
        ["SUBMITTED", 6],
        ["RESUME_PICKED", 3],
        ["REJECTED", 1],
      ]);
    if (age < 20)
      return weighted<SubmissionStatus>([
        ["SUBMITTED", 1],
        ["RESUME_PICKED", 3],
        ["VENDOR_SCREENING_CALL", 3],
        ["CLIENT_INTERVIEW", 2],
        ["REJECTED", 3],
        ["ON_HOLD", 1],
        ["JOINED", 1],
        // A fast offer-then-backout — keeps the scorecard's Backouts column
        // populated for the current month, not just old data.
        ["BACKED_OUT", 1],
      ]);
    if (age < 45)
      return weighted<SubmissionStatus>([
        ["RESUME_PICKED", 1],
        ["VENDOR_SCREENING_CALL", 2],
        ["CLIENT_INTERVIEW", 3],
        ["SELECTED", 2],
        ["REJECTED", 4],
        ["ON_HOLD", 2],
        ["OFFER_RELEASED", 1],
        ["JOINED", 4],
        ["BACKED_OUT", 1],
      ]);
    return weighted<SubmissionStatus>([
      ["VENDOR_SCREENING_CALL", 1],
      ["CLIENT_INTERVIEW", 2],
      ["SELECTED", 2],
      ["REJECTED", 4],
      ["ON_HOLD", 1],
      ["OFFER_RELEASED", 2],
      ["JOINED", 5],
      ["BACKED_OUT", 2],
    ]);
  }

  function buildPath(final: SubmissionStatus): SubmissionStatus[] {
    switch (final) {
      case "SUBMITTED":
        return ["SUBMITTED"];
      case "RESUME_PICKED":
        return PIPELINE.slice(0, 2);
      case "VENDOR_SCREENING_CALL":
        return PIPELINE.slice(0, 3);
      case "CLIENT_INTERVIEW":
        return [...PIPELINE];
      case "SELECTED":
        return [...PIPELINE, "SELECTED"];
      case "OFFER_RELEASED":
        return [...PIPELINE, "SELECTED", "OFFER_RELEASED"];
      case "OFFER_ACCEPTED":
        return [...PIPELINE, "SELECTED", "OFFER_RELEASED", "OFFER_ACCEPTED"];
      case "JOINED":
        return [
          ...PIPELINE,
          "SELECTED",
          "OFFER_RELEASED",
          "OFFER_ACCEPTED",
          "JOINED",
        ];
      case "REJECTED":
        return [...PIPELINE.slice(0, randInt(1, 4)), "REJECTED"];
      case "ON_HOLD":
        return [...PIPELINE.slice(0, randInt(2, 4)), "ON_HOLD"];
      case "BACKED_OUT":
        // Got all the way to an accepted offer, then walked.
        return [
          ...PIPELINE,
          "SELECTED",
          "OFFER_RELEASED",
          "OFFER_ACCEPTED",
          "BACKED_OUT",
        ];
    }
  }

  const milestoneAction = (s: SubmissionStatus) =>
    s === "SELECTED"
      ? "CANDIDATE_SELECTED"
      : s === "REJECTED"
        ? "CANDIDATE_REJECTED"
        : s === "OFFER_RELEASED"
          ? "OFFER_RELEASED"
          : s === "OFFER_ACCEPTED"
            ? "OFFER_ACCEPTED"
            : s === "JOINED"
              ? "CANDIDATE_JOINED"
              : "SUBMISSION_STATUS_CHANGED";

  const usedPairs = new Set<string>();
  const subCountByCandidate = new Map<string, number>();
  // Candidates with a live (ACTIVE) placement — drives the linked bench record's
  // marketing status (PLACED) below, so the roster reflects the lifecycle model.
  const placedCandidateIds = new Set<string>();
  let submissionCount = 0;
  let roundCount = 0;
  let placementCount = 0;

  // VPR-first: every submission is created *against* a Vendor Portal Requirement.
  // Scope one requirement per job on first use (occasionally a second one) and
  // reuse it for that job's other submissions — one requirement, many candidate
  // submissions. The requirement's commercial terms are carried onto each sub.
  type VprRec = {
    id: string;
    payRate: number;
    billRate: number;
    engagement: "C2C" | "W2";
    teamLead: string | null;
    vendorRecruiterName: string | null;
  };
  const vprByJob = new Map<string, VprRec[]>();
  let requirementCount = 0;

  async function getVprForJob(job: (typeof jobs)[number]): Promise<VprRec> {
    const existing = vprByJob.get(job.id) ?? [];
    // Reuse an existing requirement most of the time; ~20% of the time scope a
    // second one for the same job so "many requirements per job" is represented.
    if (existing.length > 0 && !(existing.length === 1 && chance(0.2))) {
      return pick(existing);
    }
    const recruiter = pick(recruiters);
    const payRate = job.payBase - randInt(0, 6);
    const billRate = job.payBase + randInt(10, 30);
    const engagement: "C2C" | "W2" = chance(0.6) ? "C2C" : "W2";
    const teamLead = recruiter.teamKey ? leadNameByKey[recruiter.teamKey] : null;
    const vendorRecruiterName = chance(0.5) ? pick(VENDOR_RECRUITER_NAMES) : null;
    // Scoped right after the job is created, so it always predates its submissions.
    const createdAt = new Date(job.createdAt.getTime() + 6 * HOUR);
    // Mirror the runtime job→VPR cascade: a requirement under a terminal job is
    // never left OPEN (that's the misleading "job Filled, requirement Open"
    // state). FILLED → CONVERTED (fulfilled), CLOSED/CANCELLED → CANCELLED.
    const vprStatus =
      job.status === "FILLED"
        ? "CONVERTED"
        : job.status === "CLOSED" || job.status === "CANCELLED"
          ? "CANCELLED"
          : "OPEN";
    const req = await prisma.vendorRequirement.create({
      data: {
        jobId: job.id,
        recruiterId: recruiter.id,
        location: pick(LOCATIONS),
        payRate,
        billRate,
        clientRate: job.clientRate,
        engagement,
        vendorRecruiterName,
        teamLead,
        submissionNotes: chance(0.4) ? pick(CANDIDATE_NOTES) : null,
        status: vprStatus,
        createdById: admin.id,
        createdAt,
        updatedAt: createdAt,
      },
      select: { id: true },
    });
    requirementCount++;
    activityRows.push({
      entityType: "REQUIREMENT",
      action: "REQUIREMENT_CREATED",
      description: `Vendor requirement created for "${job.title}"`,
      performedById: admin.id,
      requirementId: req.id,
      createdAt,
    });
    const rec: VprRec = {
      id: req.id,
      payRate,
      billRate,
      engagement,
      teamLead,
      vendorRecruiterName,
    };
    vprByJob.set(job.id, [...existing, rec]);
    return rec;
  }

  for (let i = 0; i < 160; i++) {
    // Pick a unique candidate+job pair (candidate capped at 9 submissions).
    let candidate = candidates[0];
    let job = jobs[0];
    let attempts = 0;
    while (attempts < 200) {
      attempts++;
      const c = pick(candidates);
      const j = pick(jobs);
      const key = `${c.id}:${j.id}`;
      if (usedPairs.has(key)) continue;
      if ((subCountByCandidate.get(c.id) ?? 0) >= 9) continue;
      candidate = c;
      job = j;
      usedPairs.add(key);
      break;
    }
    subCountByCandidate.set(
      candidate.id,
      (subCountByCandidate.get(candidate.id) ?? 0) + 1,
    );

    const submittedById = job.assigneeIds.length
      ? pick(job.assigneeIds)
      : pick(recruiters).id;

    const earliest = new Date(
      Math.max(job.createdAt.getTime(), candidate.createdAt.getTime()) +
        12 * HOUR,
    );
    const submittedAt = randDate(earliest, new Date(NOW.getTime() - 2 * HOUR));

    const finalStatus = pickFinalStatus(daysAgo(submittedAt));
    const path = buildPath(finalStatus);

    // Spread the status transitions across [submittedAt, NOW].
    const transitions = path.length - 1;
    const span = NOW.getTime() - submittedAt.getTime();
    const times: Date[] = [submittedAt];
    for (let k = 1; k <= transitions; k++) {
      const frac = k / (transitions + 1);
      const jitter = (rand() - 0.5) * span * 0.08;
      let t = submittedAt.getTime() + span * frac + jitter;
      t = Math.min(t, NOW.getTime() - HOUR);
      t = Math.max(t, times[k - 1].getTime() + HOUR);
      times.push(new Date(t));
    }

    // Most submissions carry one of the candidate's saved résumés; ~20% go out
    // without one (the "missing résumé" worklist). Of those, ~30% are then
    // waived ("résumé not required") so the demo shows all three states.
    const pickedResume =
      candidate.resumes.length > 0 && chance(0.8)
        ? pick(candidate.resumes)
        : null;
    const waiveResume = !pickedResume && chance(0.3);

    // The requirement this candidate is submitted against (VPR-first).
    const vpr = await getVprForJob(job);

    const submission = await prisma.submission.create({
      data: {
        candidateId: candidate.id,
        jobId: job.id,
        submittedById,
        status: finalStatus,
        clientRate: job.clientRate, // carried down the chain: job → requirement → sub
        vendorRequirementId: vpr.id, // submitted against this requirement

        rejectionReason:
          finalStatus === "REJECTED" ? pick(REJECTION_REASONS) : null,
        submissionNotes: chance(0.4) ? pick(SUBMISSION_NOTES) : null,
        // Commercial terms carried from the requirement (slight per-candidate
        // variance on pay), so the submission mirrors what it was scoped against.
        engagement: vpr.engagement,
        vendorRecruiterName: vpr.vendorRecruiterName,
        jobDuties: chance(0.3) ? pick(JOB_DUTIES_SAMPLES) : null,
        payRate: vpr.payRate + randInt(-2, 2),
        billRate: vpr.billRate,
        teamLead: vpr.teamLead,
        candidateResumeId: pickedResume?.id ?? null,
        resumeBlobUrl: pickedResume?.blobUrl ?? null,
        resumeWaivedAt: waiveResume ? submittedAt : null,
        resumeWaivedById: waiveResume ? submittedById : null,
        submittedAt,
        createdAt: submittedAt,
        updatedAt: times[times.length - 1],
      },
      select: { id: true },
    });
    submissionCount++;
    updatedAtFixes.push({
      table: "Submission",
      id: submission.id,
      ts: times[times.length - 1],
    });

    activityRows.push({
      entityType: "SUBMISSION",
      action: "CANDIDATE_SUBMITTED",
      description: `${candidate.fullName} submitted to "${job.title}"`,
      performedById: submittedById,
      submissionId: submission.id,
      createdAt: submittedAt,
    });

    for (let k = 1; k <= transitions; k++) {
      const from = path[k - 1];
      const to = path[k];
      activityRows.push({
        entityType: "SUBMISSION",
        action: milestoneAction(to),
        description: `${candidate.fullName} on "${job.title}": status changed from ${SUB_LABEL[from]} to ${SUB_LABEL[to]}`,
        oldValue: SUB_LABEL[from],
        newValue: SUB_LABEL[to],
        performedById: submittedById,
        submissionId: submission.id,
        createdAt: times[k],
      });
    }

    // Interview rounds — only once the pipeline reached Client Interview.
    if (path.includes("CLIENT_INTERVIEW")) {
      const ciTime = times[path.indexOf("CLIENT_INTERVIEW")];
      const rounds = chance(0.4) ? 1 : chance(0.66) ? 2 : 3;
      let cursor = ciTime.getTime();
      for (let r = 1; r <= rounds; r++) {
        cursor = Math.min(
          cursor + randInt(3, 9) * DAY,
          NOW.getTime() - HOUR,
        );
        const roundCreatedAt = new Date(cursor);
        const isLast = r === rounds;

        let result: InterviewResult;
        if (!isLast) {
          result = weighted<InterviewResult>([
            ["COMPLETED", 3],
            ["NEED_ANOTHER_ROUND", 2],
          ]);
        } else if (
          finalStatus === "SELECTED" ||
          finalStatus === "OFFER_RELEASED" ||
          finalStatus === "JOINED"
        ) {
          result = "SELECTED";
        } else if (finalStatus === "REJECTED") {
          result = "REJECTED";
        } else if (finalStatus === "ON_HOLD") {
          result = "ON_HOLD";
        } else {
          result = weighted<InterviewResult>([
            ["WAITING", 2],
            ["NEED_ANOTHER_ROUND", 2],
            ["COMPLETED", 1],
          ]);
        }

        const type: InterviewType =
          r === 1
            ? pick<InterviewType>(["CLIENT_INTERVIEW", "MANAGER_ROUND"])
            : r === 2
              ? pick<InterviewType>(["MANAGER_ROUND", "FINAL_ROUND"])
              : pick<InterviewType>(["HR_ROUND", "FINAL_ROUND"]);
        const roundName =
          r === 1
            ? "Technical Round 1"
            : r === 2
              ? pick(["Technical Round 2", "Manager Round"])
              : pick(["Final Round", "HR Round"]);

        const feedback = feedbackFor(result);
        // The last round of an in-progress submission may be scheduled ahead.
        const scheduledAt =
          result === "WAITING"
            ? new Date(roundCreatedAt.getTime() + randInt(2, 8) * DAY)
            : new Date(
                Math.min(
                  roundCreatedAt.getTime() + randInt(1, 4) * DAY,
                  NOW.getTime() - HOUR,
                ),
              );

        const round = await prisma.interviewRound.create({
          data: {
            submissionId: submission.id,
            roundOrder: r,
            roundName,
            interviewType: type,
            interviewerName: pick(INTERVIEWERS),
            scheduledAt,
            result,
            ...(chance(0.3)
              ? {
                  supportNeeded: true,
                  // ~70% of supported rounds name the external provider + method.
                  ...(chance(0.7)
                    ? {
                        supportProviderId: pick(supportProviders).id,
                        supportMethod: pick(SUPPORT_METHODS),
                      }
                    : {}),
                }
              : { supportNeeded: false }),
            feedback: feedback || null,
            notes: chance(0.4) ? pick(ROUND_NOTES) : null,
            updatedById: submittedById,
            createdAt: roundCreatedAt,
            updatedAt: roundCreatedAt,
          },
          select: { id: true },
        });
        roundCount++;

        activityRows.push({
          entityType: "INTERVIEW_ROUND",
          action: "INTERVIEW_ROUND_ADDED",
          description: `Interview round "${roundName}" added (${ITYPE_LABEL[type]})`,
          performedById: submittedById,
          interviewRoundId: round.id,
          createdAt: roundCreatedAt,
        });

        let roundUpdatedAt = roundCreatedAt;
        if (result !== "WAITING") {
          const resultAt = new Date(
            Math.min(roundCreatedAt.getTime() + 6 * HOUR, NOW.getTime()),
          );
          activityRows.push({
            entityType: "INTERVIEW_ROUND",
            action: "INTERVIEW_RESULT_UPDATED",
            description: `Result for round "${roundName}" changed from Waiting to ${IRESULT_LABEL[result]}`,
            oldValue: "Waiting",
            newValue: IRESULT_LABEL[result],
            performedById: submittedById,
            interviewRoundId: round.id,
            createdAt: resultAt,
          });
          roundUpdatedAt = resultAt;
        }
        if (feedback) {
          const fbAt = new Date(
            Math.min(roundCreatedAt.getTime() + 7 * HOUR, NOW.getTime()),
          );
          activityRows.push({
            entityType: "INTERVIEW_ROUND",
            action: "FEEDBACK_ADDED",
            description: `Feedback added to round "${roundName}"`,
            performedById: submittedById,
            interviewRoundId: round.id,
            createdAt: fbAt,
          });
          if (fbAt > roundUpdatedAt) roundUpdatedAt = fbAt;
        }
        updatedAtFixes.push({
          table: "InterviewRound",
          id: round.id,
          ts: roundUpdatedAt,
        });
      }
    }

    // Placement — created when the submission reached JOINED. Populates the
    // Bench-Sales "Placements" sheet fields so /placements has realistic data.
    if (finalStatus === "JOINED") {
      const startDate = times[times.length - 1];
      // ~20% of placements have rates still pending (0/0) — exercises the
      // "Rates pending" UI flag + the dashboard "rates pending" card.
      const ratesPending = chance(0.2);
      const bill = ratesPending ? 0 : job.payBase + randInt(12, 30);
      const pay = ratesPending ? 0 : job.payBase + randInt(-3, 4);
      // ~25% have already ended; the rest stay ACTIVE (open-ended or a future
      // end date for a fixed-length contract).
      const ended = chance(0.25);
      const contractMonths = randInt(3, 12);
      const endDate = ended
        ? new Date(
            Math.min(
              startDate.getTime() + contractMonths * 30 * DAY,
              NOW.getTime() - DAY,
            ),
          )
        : chance(0.5)
          ? new Date(startDate.getTime() + contractMonths * 30 * DAY)
          : null;
      const interviewDate = new Date(
        startDate.getTime() - randInt(5, 20) * DAY,
      );
      const placement = await prisma.placement.create({
        data: {
          submissionId: submission.id,
          candidateId: candidate.id,
          jobId: job.id,
          startDate,
          endDate,
          billRate: bill,
          payRate: pay,
          status: ended ? "ENDED" : "ACTIVE",
          endReason: ended ? "COMPLETED" : null,
          endNote: ended ? "Contract completed." : null,
          organisation: chance(0.7) ? pick(ORGANISATIONS) : null,
          teamLead: chance(0.7) ? pick(TEAM_LEADS) : null,
          interviewDate,
          placementDate: startDate,
          remarks: chance(0.5) ? pick(PLACEMENT_REMARKS) : null,
          createdAt: startDate,
          updatedAt: endDate ?? startDate,
        },
        select: { id: true, seq: true },
      });
      placementCount++;
      // Keep the candidate's status consistent with a live placement.
      if (!ended) {
        await prisma.candidate.update({
          where: { id: candidate.id },
          data: { status: "PLACED" },
        });
        placedCandidateIds.add(candidate.id);
      }
      activityRows.push({
        entityType: "SUBMISSION",
        action: "PLACEMENT_CREATED",
        description: `Placement PLC-${String(placement.seq).padStart(3, "0")} created for ${candidate.fullName} on "${job.title}"`,
        performedById: submittedById,
        submissionId: submission.id,
        candidateId: candidate.id,
        jobId: job.id,
        createdAt: startDate,
      });
    }

    // Submission note (~45%).
    if (chance(0.45)) {
      const body = pick(SUBMISSION_NOTES);
      const noteAt = randDate(submittedAt, NOW);
      noteRows.push({
        entityType: "SUBMISSION",
        body,
        createdById: submittedById,
        submissionId: submission.id,
        createdAt: noteAt,
      });
      activityRows.push({
        entityType: "SUBMISSION",
        action: "NOTE_ADDED",
        description: `Note added: "${body.slice(0, 60)}"`,
        performedById: submittedById,
        submissionId: submission.id,
        createdAt: noteAt,
      });
    }
  }

  // ── Bench consultants (marketing roster) ──
  // Lifecycle bench model: every candidate is linked 1:1 to a bench record (the
  // marketing identity), and its marketing status reflects the candidate's
  // pipeline state — PLACED for those with a live placement, INACTIVE for the
  // ones marked not-interested / do-not-contact (off the bench), and a spread of
  // ACTIVE/PAUSED for the rest (on the bench, being marketed).
  console.log("Creating bench consultants (linked to candidates)…");
  let benchCount = 0;
  for (const c of candidates) {
    const [first, ...rest] = c.fullName.split(" ");
    const last = rest.join(" ") || "Consultant";
    const recruiter = pick(recruiters);
    const priority = chance(0.4) ? "HIGH" : "SECOND";
    const marketingStatus = placedCandidateIds.has(c.id)
      ? "PLACED"
      : c.status === "NOT_INTERESTED" || c.status === "DO_NOT_CONTACT"
        ? "INACTIVE"
        : weighted<"ACTIVE" | "PAUSED">([
            ["ACTIVE", 8],
            ["PAUSED", 2],
          ]);
    const hasCreds = chance(0.7);
    const mkExp = randInt(3, 14) + (chance(0.5) ? 0.5 : 0);

    const consultant = await prisma.benchConsultant.create({
      data: {
        firstName: first,
        lastName: last,
        fullName: c.fullName,
        email: `${first}.${last}.bench`.toLowerCase().replace(/\s+/g, "") + "@example.com",
        phone: `+1 ${randInt(200, 989)}-${randInt(200, 989)}-${randInt(1000, 9999)}`,
        currentLocation: pick(LOCATIONS),
        workAuthorization: pick(BENCH_VISAS),
        mVisa: pick(BENCH_VISAS),
        aVisa: chance(0.4) ? pick(BENCH_VISAS) : null,
        marketingExpYears: mkExp,
        realTimeExpYears: Math.max(1, mkExp - randInt(1, 3)),
        skills: pickN(SKILLS, randInt(3, 6)),
        reference: chance(0.6) ? pick(BENCH_REFERENCES) : null,
        company: chance(0.5) ? pick(CURRENT_COMPANIES) : null,
        projectType: pick(PROJECT_TYPES),
        leastRateC2C: randInt(55, 95),
        callType: pick(CALL_TYPES),
        payrollType: pick(PAYROLL_TYPES),
        ...(() => {
          const relocation = chance(0.5);
          return {
            relocation,
            // Some non-relocating consultants still name specific cities.
            relocationCities:
              !relocation && chance(0.5)
                ? pickN(LOCATIONS, randInt(1, 2)).join(", ")
                : null,
          };
        })(),
        marketingStartDate: c.createdAt,
        marketingEmail: hasCreds
          ? `${first}.${last}.mktg`.toLowerCase().replace(/\s+/g, "") + "@bench-marketing.com"
          : null,
        marketingPassword: hasCreds ? `Mktg!${randInt(1000, 9999)}` : null,
        marketingNumber: hasCreds
          ? `+1 ${randInt(200, 989)}-${randInt(200, 989)}-${randInt(1000, 9999)}`
          : null,
        personalNumber: chance(0.5)
          ? `+1 ${randInt(200, 989)}-${randInt(200, 989)}-${randInt(1000, 9999)}`
          : null,
        priority,
        marketingStatus,
        notes: chance(0.4) ? pick(CANDIDATE_NOTES) : null,
        candidateId: c.id,
        recruiterId: recruiter.id,
        createdById: admin.id,
        createdAt: c.createdAt,
        updatedAt: c.createdAt,
      },
      select: { id: true },
    });
    benchCount++;

    activityRows.push({
      entityType: "CONSULTANT",
      action: "BENCH_CONSULTANT_CREATED",
      description: `Bench consultant "${c.fullName}" added to marketing roster`,
      performedById: admin.id,
      benchConsultantId: consultant.id,
      createdAt: c.createdAt,
    });
  }

  // ── Extra vendor portal requirements (still awaiting candidates) ──
  // The submission loop above already scoped a requirement per job it touched
  // (each with 1+ submissions). These extras are OPEN requirements no candidate
  // has been submitted against yet — plus a couple CANCELLED so the status
  // filter has something to do. Team lead is derived from the recruiter's team.
  console.log("Creating extra (awaiting) vendor portal requirements…");
  // An "awaiting candidates" (OPEN) requirement only makes sense on a job that's
  // still accepting — otherwise we recreate the misleading "job Filled,
  // requirement Open" state. Scope these to non-terminal jobs.
  const openJobs = jobs.filter(
    (j) => j.status === "OPEN" || j.status === "ON_HOLD",
  );
  for (let i = 0; i < 8; i++) {
    const job = pick(openJobs);
    const recruiter = pick(recruiters);
    // ~70% already have a candidate picked; the rest are candidate-less plans.
    const candidate = chance(0.7) ? pick(candidates) : null;
    const status = weighted<"OPEN" | "CANCELLED">([
      ["OPEN", 11],
      ["CANCELLED", 3],
    ]);
    const payRate = job.payBase - randInt(0, 6);
    const billRate = job.payBase + randInt(10, 30);
    const createdAt = randDate(
      new Date(NOW.getTime() - 30 * DAY),
      new Date(NOW.getTime() - 1 * DAY),
    );
    const requirement = await prisma.vendorRequirement.create({
      data: {
        jobId: job.id,
        candidateId: candidate?.id ?? null,
        recruiterId: recruiter.id,
        location: pick(LOCATIONS),
        payRate,
        billRate,
        clientRate: job.clientRate, // carried from the job (Client >= Bill >= Pay)
        engagement: chance(0.6) ? "C2C" : "W2",
        vendorRecruiterName: chance(0.5) ? pick(VENDOR_RECRUITER_NAMES) : null,
        teamLead: recruiter.teamKey ? leadNameByKey[recruiter.teamKey] : null,
        submissionNotes: chance(0.4) ? pick(CANDIDATE_NOTES) : null,
        status,
        createdById: admin.id,
        createdAt,
        updatedAt: createdAt,
      },
      select: { id: true },
    });
    requirementCount++;
    activityRows.push({
      entityType: "REQUIREMENT",
      action: "REQUIREMENT_CREATED",
      description: `Vendor requirement created for "${job.title}"`,
      performedById: admin.id,
      requirementId: requirement.id,
      createdAt,
    });
    if (status === "CANCELLED") {
      activityRows.push({
        entityType: "REQUIREMENT",
        action: "REQUIREMENT_CANCELLED",
        description: "Vendor requirement cancelled",
        performedById: admin.id,
        requirementId: requirement.id,
        createdAt: new Date(createdAt.getTime() + 2 * DAY),
      });
    }
  }

  // ── Candidate documents (with a spread of expiry dates) ──
  // Exercises the expiry pills + the dashboard "Documents expiring (30 days)"
  // banner: some are already expired, some expire within 30 days, some far out.
  console.log("Creating candidate documents…");
  let docCount = 0;
  const DOC_TEMPLATES: { category: string; label: string }[] = [
    { category: "WORK_AUTH", label: "H1-B I-797" },
    { category: "WORK_AUTH", label: "EAD Card" },
    { category: "IDENTITY", label: "Passport" },
    { category: "IDENTITY", label: "Driver's License" },
    { category: "EDUCATION", label: "Master's Degree" },
    { category: "EMPLOYMENT", label: "Latest Offer Letter" },
  ];
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    if (!chance(0.5)) continue;
    for (const t of pickN(DOC_TEMPLATES, randInt(1, 3))) {
      const bucket = weighted<"past" | "soon" | "future" | "none">([
        ["past", 1],
        ["soon", 1],
        ["future", 2],
        ["none", 1],
      ]);
      const expiresAt =
        bucket === "past"
          ? new Date(NOW.getTime() - randInt(5, 60) * DAY)
          : bucket === "soon"
            ? new Date(NOW.getTime() + randInt(3, 28) * DAY)
            : bucket === "future"
              ? new Date(NOW.getTime() + randInt(120, 700) * DAY)
              : null;
      // Reuse the sample résumé blobs as document files (no extra uploads).
      const docSample = sampleBlobs.length
        ? sampleBlobs[(i + docCount) % sampleBlobs.length]
        : null;
      await prisma.candidateDocument.create({
        data: {
          candidateId: c.id,
          category: t.category as never,
          label: t.label,
          ...(docSample
            ? {
                blobPathname: docSample.pathname,
                blobUrl: docSample.url,
                contentType: "application/pdf",
                sizeBytes: docSample.size,
              }
            : {}),
          issuedAt: new Date(NOW.getTime() - randInt(200, 1000) * DAY),
          expiresAt,
          uploadedById: admin.id,
          createdAt: c.createdAt,
          updatedAt: c.createdAt,
        },
      });
      docCount++;
      activityRows.push({
        entityType: "CANDIDATE",
        action: "CANDIDATE_DOCUMENT_ADDED",
        description: `Document "${t.label}" added`,
        performedById: admin.id,
        candidateId: c.id,
        createdAt: c.createdAt,
      });
    }
  }

  // ── Job & candidate notes ──
  console.log("Creating notes…");
  for (const job of jobs) {
    if (!chance(0.4)) continue;
    for (let n = 0; n < randInt(1, 2); n++) {
      const body = pick(JOB_NOTES);
      const author = job.assigneeIds.length
        ? pick(job.assigneeIds)
        : admin.id;
      const noteAt = randDate(job.createdAt, NOW);
      noteRows.push({
        entityType: "JOB",
        body,
        createdById: author,
        jobId: job.id,
        createdAt: noteAt,
      });
      activityRows.push({
        entityType: "JOB",
        action: "NOTE_ADDED",
        description: `Note added: "${body.slice(0, 60)}"`,
        performedById: author,
        jobId: job.id,
        createdAt: noteAt,
      });
    }
  }
  for (const candidate of candidates) {
    if (!chance(0.4)) continue;
    const body = pick(CANDIDATE_NOTES);
    const author = pick(recruiters).id;
    const noteAt = randDate(candidate.createdAt, NOW);
    noteRows.push({
      entityType: "CANDIDATE",
      body,
      createdById: author,
      candidateId: candidate.id,
      createdAt: noteAt,
    });
    activityRows.push({
      entityType: "CANDIDATE",
      action: "NOTE_ADDED",
      description: `Note added: "${body.slice(0, 60)}"`,
      performedById: author,
      candidateId: candidate.id,
      createdAt: noteAt,
    });
  }

  // ── Integrity guard: drop any activity row whose FK target didn't commit ──
  // `activityRows` is collected across the whole seed; a draw-dependent path can
  // push a row referencing an entity that's later removed or never created. A
  // single orphan would fail the entire `createMany` with an opaque Postgres FK
  // error (and leave a half-seeded DB). Verify every referenced id against what
  // actually landed in the DB, then drop + report the stragglers so the seed
  // always completes and any real gap is named instead of cryptic.
  {
    const idSet = async (
      rows: Promise<{ id: string }[]>,
    ): Promise<Set<string>> => new Set((await rows).map((r) => r.id));
    const [uSet, jSet, cSet, sSet, rSet, bSet, vSet] = await Promise.all([
      idSet(prisma.user.findMany({ select: { id: true } })),
      idSet(prisma.job.findMany({ select: { id: true } })),
      idSet(prisma.candidate.findMany({ select: { id: true } })),
      idSet(prisma.submission.findMany({ select: { id: true } })),
      idSet(prisma.interviewRound.findMany({ select: { id: true } })),
      idSet(prisma.benchConsultant.findMany({ select: { id: true } })),
      idSet(prisma.vendorRequirement.findMany({ select: { id: true } })),
    ]);
    const ok = (r: Prisma.ActivityCreateManyInput): boolean =>
      uSet.has(r.performedById) &&
      (r.jobId == null || jSet.has(r.jobId)) &&
      (r.candidateId == null || cSet.has(r.candidateId)) &&
      (r.submissionId == null || sSet.has(r.submissionId)) &&
      (r.interviewRoundId == null || rSet.has(r.interviewRoundId)) &&
      (r.benchConsultantId == null || bSet.has(r.benchConsultantId)) &&
      (r.requirementId == null || vSet.has(r.requirementId));
    const kept = activityRows.filter(ok);
    const dropped = activityRows.length - kept.length;
    if (dropped > 0) {
      const bad = activityRows.find((r) => !ok(r));
      console.warn(
        `  ⚠ Dropped ${dropped} activity row(s) referencing missing entities ` +
          `(e.g. ${JSON.stringify({
            action: bad?.action,
            performedById: bad?.performedById,
            jobId: bad?.jobId ?? null,
            candidateId: bad?.candidateId ?? null,
            submissionId: bad?.submissionId ?? null,
            interviewRoundId: bad?.interviewRoundId ?? null,
            benchConsultantId: bad?.benchConsultantId ?? null,
            requirementId: bad?.requirementId ?? null,
          })}).`,
      );
      activityRows.length = 0;
      activityRows.push(...kept);
    }
  }

  // ── Bulk insert assignments, notes, activities ──
  console.log(
    `Inserting ${assignmentRows.length} assignments, ${noteRows.length} notes, ${activityRows.length} activity rows…`,
  );
  await chunkedCreateMany(assignmentRows, (b) =>
    prisma.jobAssignment.createMany({ data: b }),
  );
  await chunkedCreateMany(noteRows, (b) =>
    prisma.note.createMany({ data: b }),
  );
  await chunkedCreateMany(activityRows, (b) =>
    prisma.activity.createMany({ data: b }),
  );

  // ── Backdate updatedAt (Prisma's @updatedAt can override values set on create) ──
  console.log(`Backdating ${updatedAtFixes.length} updatedAt timestamps…`);
  function applyFix(f: { table: string; id: string; ts: Date }) {
    if (f.table === "Job")
      return prisma.$executeRaw`UPDATE "Job" SET "updatedAt" = ${f.ts} WHERE id = ${f.id}`;
    if (f.table === "Candidate")
      return prisma.$executeRaw`UPDATE "Candidate" SET "updatedAt" = ${f.ts} WHERE id = ${f.id}`;
    if (f.table === "Submission")
      return prisma.$executeRaw`UPDATE "Submission" SET "updatedAt" = ${f.ts} WHERE id = ${f.id}`;
    return prisma.$executeRaw`UPDATE "InterviewRound" SET "updatedAt" = ${f.ts} WHERE id = ${f.id}`;
  }
  for (let i = 0; i < updatedAtFixes.length; i += 25) {
    await Promise.all(updatedAtFixes.slice(i, i + 25).map(applyFix));
  }

  console.log("\nSeed complete.");
  console.log(`  Users:        ${allUsers.length} (${leadCount} managers/team leads, ${recruiters.length} recruiters)`);
  console.log(`  Jobs:         ${jobs.length}`);
  console.log(`  Candidates:   ${candidates.length}`);
  console.log(`  Bench consultants: ${benchCount} (linked 1:1 to candidates)`);
  console.log(`  Vendor requirements: ${requirementCount}`);
  console.log(`  Candidate documents: ${docCount}`);
  console.log(`  Resumes:      ${resumeCount}`);
  console.log(`  Submissions:  ${submissionCount}`);
  console.log(`  Placements:   ${placementCount}`);
  console.log(`  Interview rounds: ${roundCount}`);
  console.log(`  Notes:        ${noteRows.length}`);
  console.log(`  Activity rows: ${activityRows.length}`);
  console.log(`\n  Admin login:  ${ADMIN_LOGIN}  /  ${SHARED_PASSWORD}  (Sriman Udugula)`);
  console.log(`  (all ${USER_ROSTER.length} users share the same password)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => baseDb.$disconnect());
