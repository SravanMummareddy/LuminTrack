/** Client-safe global-search types — kept out of the Prisma-importing query. */

export type SearchResultType =
  | "candidate"
  | "job"
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
  client: "Client",
  vendor: "Vendor",
  source: "Source",
  recruiter: "Recruiter",
};
