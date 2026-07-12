/** Client-safe global-search types — kept out of the Prisma-importing query. */

export type SearchResultType =
  | "candidate"
  | "job"
  | "requirement"
  | "submission"
  | "placement"
  | "client"
  | "vendor"
  | "source"
  | "recruiter";

export type SearchResult = {
  type: SearchResultType;
  label: string;
  sublabel?: string;
  href: string;
};

export const SEARCH_TYPE_LABEL: Record<SearchResultType, string> = {
  candidate: "Candidate",
  job: "Job",
  requirement: "Requirement",
  submission: "Submission",
  placement: "Placement",
  client: "Client",
  vendor: "Vendor",
  source: "Source",
  recruiter: "Recruiter",
};
