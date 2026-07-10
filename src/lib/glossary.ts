/**
 * Curated glossary of the vocabulary used across LuminTrack, grouped by area.
 * Rendered on Settings → Glossary so anyone unsure of a term can look it up.
 * Definitions live here (in code) so they stay current; each user can attach
 * their own private note per term (stored in the GlossaryNote table, keyed by
 * the stable `term` slug below — do NOT rename a slug once shipped or existing
 * notes lose their anchor).
 */
export type GlossaryTerm = {
  /** Stable slug — the key a user's personal note hangs off. Never rename. */
  term: string;
  label: string;
  category: string;
  definition: string;
};

export const GLOSSARY_CATEGORIES = [
  "Pipeline",
  "Jobs & requirements",
  "Rates & money",
  "Bench & marketing",
  "Visas & work authorization",
  "Statuses",
] as const;

export const GLOSSARY: GlossaryTerm[] = [
  // ── Pipeline ────────────────────────────────────────────────────────────
  {
    term: "job",
    label: "Job",
    category: "Pipeline",
    definition:
      "The bare requisition or opening — title, client, vendor, location, positions, and the client rate only. The starting point of the three-tier pipeline: Job → VPR → Submission.",
  },
  {
    term: "vpr",
    label: "Vendor Portal Requirement (VPR)",
    category: "Pipeline",
    definition:
      "A team-lead's commercial plan built from a Job: it adds the bill/pay rates, engagement, and team lead. Recruiters then submit candidates against it. A VPR is invisible to recruiter analytics — it's planning, not a tracked record. One Job can have several VPRs.",
  },
  {
    term: "submission",
    label: "Submission",
    category: "Pipeline",
    definition:
      "A recruiter submitting an actual candidate against a VPR. This is THE tracked record for recruiter performance — it enters the status pipeline (interview → offer → joined).",
  },
  {
    term: "placement",
    label: "Placement",
    category: "Pipeline",
    definition:
      "Created automatically when a submission is marked Joined. It's the revenue record and tracks margin. Placements only cover engagements that went through us.",
  },
  {
    term: "interview_round",
    label: "Interview round",
    category: "Pipeline",
    definition:
      "A single scheduled interview against a submission (vendor screen, client interview, manager round, etc.), each with its own date, mode, and result.",
  },

  // ── Jobs & requirements ─────────────────────────────────────────────────
  {
    term: "discipline",
    label: "Discipline (IT / Non-IT)",
    category: "Jobs & requirements",
    definition:
      "Whether the role or candidate is IT or Non-IT. Set on the Job and the Candidate; the bench reads it from the linked candidate.",
  },
  {
    term: "ilabor",
    label: "iLabor requisition",
    category: "Jobs & requirements",
    definition:
      "A requisition imported from the Randstad iLabor vendor portal. Carries extra signals: a submit cap, whether iLabor is still accepting submissions, and whether a screener is attached.",
  },
  {
    term: "positions",
    label: "Positions",
    category: "Jobs & requirements",
    definition:
      "How many openings the requisition has — you can submit and place more than one candidate against it.",
  },
  {
    term: "team_lead",
    label: "Team lead",
    category: "Jobs & requirements",
    definition:
      "The user who scopes a VPR's commercial terms. A role flag, not a separate account type — team leads and managers have full access and can also submit candidates.",
  },

  // ── Rates & money ───────────────────────────────────────────────────────
  {
    term: "client_rate",
    label: "Client rate",
    category: "Rates & money",
    definition:
      "What the end client releases — the top of the rate chain. Often undisclosed by the vendor, so it's optional context.",
  },
  {
    term: "bill_rate",
    label: "Bill rate (vendor rate)",
    category: "Rates & money",
    definition:
      "What the vendor releases to us — the amount we actually receive per hour. All revenue and margin math keys off this minus the pay rate.",
  },
  {
    term: "pay_rate",
    label: "Pay rate",
    category: "Rates & money",
    definition:
      "What we pay the consultant per hour. The binding profit constraint is Pay ≤ Bill.",
  },
  {
    term: "margin",
    label: "Margin",
    category: "Rates & money",
    definition:
      "Bill rate − Pay rate: the profit we keep per hour. The rate chain must hold: Client ≥ Bill ≥ Pay.",
  },
  {
    term: "rate_chain",
    label: "Rate chain",
    category: "Rates & money",
    definition:
      "Money flows downhill, each rung keeping a margin: Client rate ≥ Bill rate ≥ Pay rate. A broken chain (e.g. Pay > Bill) shows an advisory warning but never blocks a save.",
  },

  // ── Bench & marketing ───────────────────────────────────────────────────
  {
    term: "bench",
    label: "Bench",
    category: "Bench & marketing",
    definition:
      "The consultants we're actively marketing right now. Every bench person is a candidate (the source of truth); the bench row is a marketing overlay of that candidate.",
  },
  {
    term: "marketing_status",
    label: "Marketing status",
    category: "Bench & marketing",
    definition:
      "The single bench status: On bench (being marketed), Paused, Placed, or Off bench. It's independent of the candidate's engagement status and of any placement.",
  },
  {
    term: "priority",
    label: "Bench priority",
    category: "Bench & marketing",
    definition:
      "How aggressively we're marketing a consultant — High priority or Second priority. Groups the bench roster.",
  },
  {
    term: "remarket",
    label: "Re-market",
    category: "Bench & marketing",
    definition:
      "Manually put a placed consultant whose project is ending back on the active bench. They stay in both the placement and the bench.",
  },
  {
    term: "working_now",
    label: "Working now?",
    category: "Bench & marketing",
    definition:
      "Whether a candidate is currently working anywhere — including another org, not through us. Independent of Placements, which track only engagements through us.",
  },
  {
    term: "reference",
    label: "Reference",
    category: "Bench & marketing",
    definition:
      "How the candidate came to us (the origin). Previously labelled \"Source\" on the candidate form.",
  },

  // ── Visas & work authorization ──────────────────────────────────────────
  {
    term: "a_visa",
    label: "A Visa",
    category: "Visas & work authorization",
    definition:
      "The consultant's actual work authorization — pulled from the candidate's work-authorization field.",
  },
  {
    term: "m_visa",
    label: "M Visa",
    category: "Visas & work authorization",
    definition:
      "The visa used when marketing the consultant on the bench. Can differ from the A Visa — double-check before submitting.",
  },
  {
    term: "work_auth",
    label: "Work authorization",
    category: "Visas & work authorization",
    definition:
      "The candidate's right to work in the US (US Citizen, Green Card, GC-EAD, H-1B, H-4 EAD, OPT, STEM OPT, TN, etc.). A learn-as-you-type dropdown — new values are remembered.",
  },
  {
    term: "c2c_w2",
    label: "C2C / W2",
    category: "Visas & work authorization",
    definition:
      "Engagement types. C2C (Corp-to-Corp) = we contract with the consultant's company; W2 = the consultant is on payroll. Full-time is also possible for \"working now\".",
  },

  // ── Statuses ────────────────────────────────────────────────────────────
  {
    term: "candidate_status",
    label: "Candidate status",
    category: "Statuses",
    definition:
      "The person's engagement with us: Available, Placed, Not interested, or Do not contact. Separate from whether they're active or on the bench.",
  },
  {
    term: "selected",
    label: "Selected",
    category: "Statuses",
    definition:
      "The client picked the candidate at the Decision stage — the fork before an offer is released.",
  },
  {
    term: "joined",
    label: "Joined",
    category: "Statuses",
    definition:
      "The candidate started the assignment. Marking Joined creates a placement and flips the candidate to Placed.",
  },
  {
    term: "backed_out",
    label: "Backed out",
    category: "Statuses",
    definition:
      "The candidate withdrew after being selected or offered — distinct from Rejected, which is the client saying no.",
  },
  {
    term: "on_hold",
    label: "On hold",
    category: "Statuses",
    definition:
      "The submission is paused (awaiting a decision, a rate re-check, etc.) but not closed. It can be resumed to the client-interview stage.",
  },
];
