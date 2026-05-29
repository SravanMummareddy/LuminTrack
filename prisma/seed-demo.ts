/**
 * Demo seed — wipes the database and loads ~3 months of realistic recruiting
 * activity (8 users, org entities, 50 jobs, 30 candidates, 160 submissions with
 * lifecycle progression, interview rounds, notes, and a backdated audit trail).
 *
 * Run with:  npx tsx prisma/seed-demo.ts
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient, Prisma } from "../src/generated/prisma/client";
import type {
  JobStatus,
  SubmissionStatus,
  InterviewType,
  InterviewResult,
} from "../src/generated/prisma/enums";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Fill in .env before seeding.");
}
const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString }),
});

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
};

// ─── Data pools ──────────────────────────────────────────────────────────────

const ADMIN = {
  email: "admin@lumintrack.com",
  fullName: "Nina Alvarez",
};
const SHARED_PASSWORD = "LuminTrack2026!";

const RECRUITER_NAMES = [
  "Priya Sharma",
  "Marcus Lee",
  "Aisha Khan",
  "Daniel Okafor",
  "Elena Rossi",
  "Raj Patel",
  "Sophie Tran",
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
  await prisma.activity.deleteMany();
  await prisma.note.deleteMany();
  await prisma.interviewRound.deleteMany();
  await prisma.placementExtension.deleteMany();
  await prisma.placement.deleteMany();
  await prisma.submission.deleteMany();
  await prisma.candidateDocument.deleteMany();
  await prisma.candidateResume.deleteMany();
  await prisma.jobAssignment.deleteMany();
  await prisma.job.deleteMany();
  await prisma.candidate.deleteMany();
  await prisma.vendor.deleteMany();
  await prisma.client.deleteMany();
  await prisma.sisterCompanySource.deleteMany();
  await prisma.user.deleteMany();

  // ── Users ──
  console.log("Creating users…");
  const passwordHash = await bcrypt.hash(SHARED_PASSWORD, 10);
  const adminCreatedAt = new Date(WINDOW_START.getTime() - 5 * DAY);

  const admin = await prisma.user.create({
    data: {
      email: ADMIN.email,
      fullName: ADMIN.fullName,
      passwordHash,
      role: "ADMIN",
      createdAt: adminCreatedAt,
      updatedAt: adminCreatedAt,
    },
  });

  const recruiters: { id: string; fullName: string }[] = [];
  for (const fullName of RECRUITER_NAMES) {
    const email =
      fullName.split(" ")[0].toLowerCase() + "@lumintrack.com";
    const created = await prisma.user.create({
      data: {
        email,
        fullName,
        passwordHash,
        role: "RECRUITER",
        createdAt: adminCreatedAt,
        updatedAt: adminCreatedAt,
      },
      select: { id: true, fullName: true },
    });
    recruiters.push(created);
  }

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
    vendors.push(
      await prisma.vendor.create({
        data: {
          name,
          contactPerson: pick(FIRST_NAMES) + " " + pick(LAST_NAMES),
          email: name.toLowerCase().replace(/[^a-z]/g, "") + "@vendor.com",
          createdAt: adminCreatedAt,
          updatedAt: adminCreatedAt,
        },
        select: { id: true },
      }),
    );
  }

  // ── Jobs + assignments ──
  console.log("Creating 50 jobs…");
  const jobs: {
    id: string;
    title: string;
    createdAt: Date;
    candidateRate: number;
    assigneeIds: string[];
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
    const candidateRate = vendorRate - randInt(8, 22);
    const creator = chance(0.7) ? admin : pick(recruiters);
    const client = pick(clients);

    const job = await prisma.job.create({
      data: {
        title,
        location: pick(LOCATIONS),
        vendorRate,
        candidateRate,
        status,
        description: `${title} opening at ${client.name}. ${randInt(
          4,
          10,
        )}+ years of experience required. Solid hands-on skills expected across the core stack.`,
        notes: chance(0.4) ? pick(JOB_NOTES) : null,
        clientId: client.id,
        vendorId: pick(vendors).id,
        sisterCompanySourceId: pick(sources).id,
        createdById: creator.id,
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

    // Assignments — 1 to 3 recruiters.
    const assignees = pickN(recruiters, randInt(1, 3));
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
      candidateRate,
      assigneeIds: assignees.map((r) => r.id),
    });
  }

  // ── Candidates ──
  console.log("Creating 30 candidates…");
  const candidates: {
    id: string;
    fullName: string;
    createdAt: Date;
    resumes: { id: string; driveLink: string }[];
  }[] = [];
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

    const candidate = await prisma.candidate.create({
      data: {
        fullName,
        email: `${first}.${last}${i}`.toLowerCase() + "@example.com",
        phone: `+1 ${randInt(200, 989)}-${randInt(200, 989)}-${randInt(
          1000,
          9999,
        )}`,
        currentLocation: pick(LOCATIONS),
        workAuthorization: pick(WORK_AUTH),
        totalExperienceYears: randInt(2, 16) + (chance(0.5) ? 0.5 : 0),
        currentCompany: pick(CURRENT_COMPANIES),
        skills: pickN(SKILLS, randInt(4, 8)),
        linkedinUrl: `https://www.linkedin.com/in/${first}-${last}-${i}`.toLowerCase(),
        notes: chance(0.35) ? pick(CANDIDATE_NOTES) : null,
        createdById: creator.id,
        createdAt,
        updatedAt: createdAt,
      },
      select: { id: true },
    });

    // Résumé library — most candidates keep 1-3 labelled résumés.
    const resumes: { id: string; driveLink: string }[] = [];
    if (chance(0.8)) {
      const labels = pickN(RESUME_LABELS, randInt(1, 3));
      for (let j = 0; j < labels.length; j++) {
        const created = await prisma.candidateResume.create({
          data: {
            candidateId: candidate.id,
            label: labels[j],
            driveLink:
              "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz" +
              `${i}-${j}` +
              "/view",
            createdAt,
          },
          select: { id: true, driveLink: true },
        });
        resumes.push(created);
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
    candidates.push({ id: candidate.id, fullName, createdAt, resumes });
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
      ]);
    return weighted<SubmissionStatus>([
      ["VENDOR_SCREENING_CALL", 1],
      ["CLIENT_INTERVIEW", 2],
      ["SELECTED", 2],
      ["REJECTED", 4],
      ["ON_HOLD", 1],
      ["OFFER_RELEASED", 2],
      ["JOINED", 3],
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
  let submissionCount = 0;
  let roundCount = 0;

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

    // Most submissions carry one of the candidate's saved résumés.
    const pickedResume =
      candidate.resumes.length > 0 && chance(0.8)
        ? pick(candidate.resumes)
        : null;

    const submission = await prisma.submission.create({
      data: {
        candidateId: candidate.id,
        jobId: job.id,
        submittedById,
        status: finalStatus,
        candidateRate: job.candidateRate + randInt(-5, 6),
        rejectionReason:
          finalStatus === "REJECTED" ? pick(REJECTION_REASONS) : null,
        submissionNotes: chance(0.4) ? pick(SUBMISSION_NOTES) : null,
        candidateResumeId: pickedResume?.id ?? null,
        resumeDriveLink: pickedResume?.driveLink ?? null,
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
  console.log(`  Users:        ${recruiters.length + 1} (1 admin, ${recruiters.length} recruiters)`);
  console.log(`  Jobs:         ${jobs.length}`);
  console.log(`  Candidates:   ${candidates.length}`);
  console.log(`  Resumes:      ${resumeCount}`);
  console.log(`  Submissions:  ${submissionCount}`);
  console.log(`  Interview rounds: ${roundCount}`);
  console.log(`  Notes:        ${noteRows.length}`);
  console.log(`  Activity rows: ${activityRows.length}`);
  console.log(`\n  Admin login:  ${ADMIN.email}  /  ${SHARED_PASSWORD}`);
  console.log(`  (all sample recruiters share the same password)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
