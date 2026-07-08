import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ExternalLink,
  Pencil,
  Send,
  Archive,
  ArchiveRestore,
} from "lucide-react";
import { LinkButton, buttonClass } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, Th, Td } from "@/components/ui/table";
import { ActivityTimeline } from "@/components/timeline/activity-timeline";
import { NotesSection } from "@/components/notes/notes-section";
import { ResumeSection } from "@/components/candidates/resume-section";
import { DocumentsManager } from "@/components/candidates/documents-manager";
import {
  getCandidateDetail,
  getCandidateDocuments,
} from "@/server/queries/candidates";
import { requireUser } from "@/lib/session";
import { canManageSensitiveDocs, hasFullAccess } from "@/lib/permissions";
import { CandidateDangerZone } from "@/components/candidates/candidate-danger-zone";
import { CandidateTrashBanner } from "@/components/candidates/candidate-trash-banner";
import { setCandidateArchived } from "@/server/actions/candidates";
import { CANDIDATE_TRASH_RETENTION_DAYS } from "@/server/candidate-erase";
import { getCandidateSubmissions } from "@/server/queries/submissions";
import {
  getActivePlacementForCandidate,
  getCandidatePlacements,
} from "@/server/queries/placements";
import { getCandidateInterviewsGroupedByJob } from "@/server/queries/interviews";
import { CandidateInterviewsGrouped } from "@/components/candidates/candidate-interviews-grouped";
import { getTimelineFor } from "@/server/queries/timeline";
import { getNotesFor } from "@/server/queries/notes";
import { Pagination } from "@/components/ui/pagination";
import { SUB_PAGE_SIZE as PAGE_SIZE, parsePage } from "@/lib/filters";
import {
  SUBMISSION_STATUS_LABEL,
  SUBMISSION_STATUS_TONE,
  CANDIDATE_STATUS_LABEL,
  CANDIDATE_STATUS_TONE,
  PLACEMENT_STATUS_LABEL,
  PLACEMENT_STATUS_TONE,
  DISCIPLINE_LABEL,
  jobSourceLabel,
} from "@/lib/labels";
import { MarkContactedButton } from "@/components/candidates/mark-contacted-button";
import {
  formatDate,
  formatExperience,
  formatCandidateDisplayId,
  formatPlacementDisplayId,
  formatSubmissionDisplayId,
} from "@/lib/format";
import { RecentlyViewedTracker } from "@/components/layout/recently-viewed";

function DescItem({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-slate-800">{children}</dd>
    </div>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="mb-3 text-sm font-semibold text-slate-700">{title}</h2>
      {children}
    </section>
  );
}

export default async function CandidateDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const subsPage = parsePage(
    Array.isArray(sp.subs) ? sp.subs[0] : sp.subs,
  );
  const intsPage = parsePage(
    Array.isArray(sp.ints) ? sp.ints[0] : sp.ints,
  );
  const placementsPage = parsePage(
    Array.isArray(sp.placements) ? sp.placements[0] : sp.placements,
  );
  const user = await requireUser();
  const [
    candidate,
    {
      rows: submissions,
      total: submissionsTotal,
      page: submissionsPage,
    },
    {
      rows: interviews,
      total: interviewsTotal,
      page: interviewsPage,
    },
    timeline,
    notes,
    documents,
    activePlacement,
    {
      rows: placements,
      total: placementsTotal,
      page: placementsPageNum,
    },
  ] = await Promise.all([
    getCandidateDetail(id),
    getCandidateSubmissions(id, { page: subsPage }),
    getCandidateInterviewsGroupedByJob(id, { page: intsPage }),
    getTimelineFor("CANDIDATE", id),
    getNotesFor("CANDIDATE", id),
    getCandidateDocuments(id, user),
    getActivePlacementForCandidate(id),
    getCandidatePlacements(id, { page: placementsPage }),
  ]);
  if (!candidate) notFound();
  const isAdmin = hasFullAccess(user);
  const isErased = Boolean(candidate.erasedAt);
  const isTrashed = Boolean(candidate.deletedAt) && !isErased;
  const submissionsTotalPages = Math.max(
    1,
    Math.ceil(submissionsTotal / PAGE_SIZE),
  );
  const interviewsTotalPages = Math.max(
    1,
    Math.ceil(interviewsTotal / PAGE_SIZE),
  );
  const placementsTotalPages = Math.max(
    1,
    Math.ceil(placementsTotal / PAGE_SIZE),
  );

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <RecentlyViewedTracker
        kind="candidate"
        id={candidate.id}
        label={candidate.fullName}
        sub={candidate.email ?? candidate.phone ?? undefined}
      />
      <Link
        href="/candidates"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to candidates
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-slate-900">
              {candidate.fullName}
            </h1>
            {/* One clear lifecycle badge: the trash/inactive state wins when the
                candidate isn't Live; only a Live candidate shows the engagement
                status pill (Active + Available would otherwise read as redundant). */}
            {isErased ? (
              <Badge tone="red">Erased</Badge>
            ) : isTrashed ? (
              <Badge tone="amber">In trash</Badge>
            ) : !candidate.isActive ? (
              <Badge tone="slate">Inactive</Badge>
            ) : (
              <Badge tone={CANDIDATE_STATUS_TONE[candidate.status]}>
                {CANDIDATE_STATUS_LABEL[candidate.status]}
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-500">
            <span className="font-mono text-xs text-slate-400">
              {formatCandidateDisplayId(candidate)}
            </span>
            <span className="mx-1.5 text-slate-300">·</span>
            {candidate.currentCompany || "Company not set"}
          </p>
        </div>
        {!isErased && !isTrashed && (
          <div className="flex shrink-0 items-center gap-2">
            <LinkButton href="/vendor-portal">
              <Send className="h-4 w-4" />
              Submit to a requirement
            </LinkButton>
            <LinkButton
              href={`/candidates/${candidate.id}/edit`}
              variant="secondary"
            >
              <Pencil className="h-4 w-4" />
              Edit candidate
            </LinkButton>
            <form action={setCandidateArchived}>
              <input type="hidden" name="id" value={candidate.id} />
              <input
                type="hidden"
                name="archived"
                value={candidate.isActive ? "1" : "0"}
              />
              <button type="submit" className={buttonClass("secondary")}>
                {candidate.isActive ? (
                  <>
                    <Archive className="h-4 w-4" />
                    Deactivate
                  </>
                ) : (
                  <>
                    <ArchiveRestore className="h-4 w-4" />
                    Reactivate
                  </>
                )}
              </button>
            </form>
          </div>
        )}
      </div>

      {isTrashed && candidate.deletedAt && (
        <CandidateTrashBanner
          candidateId={candidate.id}
          candidateName={candidate.fullName}
          deletedAt={candidate.deletedAt.toISOString()}
          retentionDays={CANDIDATE_TRASH_RETENTION_DAYS}
          canManage={isAdmin}
        />
      )}

      {activePlacement && (
        <section className="rounded-lg border border-indigo-200 bg-indigo-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-indigo-700">
                Currently placed
              </p>
              <p className="mt-1 text-sm text-slate-800">
                <Link
                  href={`/placements/${activePlacement.id}`}
                  className="font-medium text-indigo-700 hover:underline"
                >
                  {formatPlacementDisplayId(activePlacement)}
                </Link>{" "}
                — {activePlacement.job.title} · {activePlacement.job.client.name}
              </p>
              <p className="mt-0.5 text-xs text-slate-600">
                Since {formatDate(activePlacement.startDate)}
                {activePlacement.endDate
                  ? ` · through ${formatDate(activePlacement.endDate)}`
                  : " · open-ended"}
              </p>
            </div>
            <Badge tone={PLACEMENT_STATUS_TONE[activePlacement.status]}>
              {PLACEMENT_STATUS_LABEL[activePlacement.status]}
            </Badge>
          </div>
        </section>
      )}

      <Card title="Candidate profile">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <DescItem label="Email">
            {candidate.email ? (
              <a
                href={`mailto:${candidate.email}`}
                className="text-indigo-600 hover:underline"
              >
                {candidate.email}
              </a>
            ) : (
              "—"
            )}
          </DescItem>
          <DescItem label="Phone">{candidate.phone || "—"}</DescItem>
          <DescItem label="Current location">
            {candidate.currentLocation || "—"}
          </DescItem>
          <DescItem label="Work authorization">
            {candidate.workAuthorization || "—"}
          </DescItem>
          <DescItem label="Experience">
            {formatExperience(candidate.totalExperienceYears)}
          </DescItem>
          <DescItem label="Current company">
            {candidate.currentCompany || "—"}
          </DescItem>
          <DescItem label="Discipline">
            {candidate.discipline ? DISCIPLINE_LABEL[candidate.discipline] : "—"}
          </DescItem>
          <DescItem label="LinkedIn">
            {candidate.linkedinUrl ? (
              <a
                href={candidate.linkedinUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-indigo-600 hover:underline"
              >
                Profile
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : (
              "—"
            )}
          </DescItem>
          <DescItem label="Added by">{candidate.createdBy.fullName}</DescItem>
          <DescItem label="Last updated">
            {formatDate(candidate.updatedAt)}
          </DescItem>
          <DescItem label="Source">{candidate.source || "—"}</DescItem>
          <DescItem label="Last contacted">
            <div className="flex flex-wrap items-center gap-2">
              <span>
                {candidate.lastContactedAt
                  ? formatDate(candidate.lastContactedAt)
                  : "—"}
              </span>
              <MarkContactedButton candidateId={candidate.id} />
            </div>
          </DescItem>
        </dl>

        {(candidate.tags ?? []).length > 0 && (
          <div className="mt-5">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Tags
            </dt>
            <dd className="mt-1.5 flex flex-wrap gap-1.5">
              {candidate.tags.map((t) => (
                <Badge key={t} tone="slate">
                  {t}
                </Badge>
              ))}
            </dd>
          </div>
        )}

        <div className="mt-5">
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Skills
          </dt>
          <dd className="mt-1.5 flex flex-wrap gap-1.5">
            {(candidate.skills ?? []).length === 0 ? (
              <span className="text-sm text-slate-500">No skills listed</span>
            ) : (
              // Starred skills lead, with a ★ glyph. Falls back to the natural
              // skills order when nothing is starred.
              [
                ...(candidate.featuredSkills ?? []),
                ...(candidate.skills ?? []).filter(
                  (s) => !(candidate.featuredSkills ?? []).includes(s),
                ),
              ].map((s) => {
                const starred = (candidate.featuredSkills ?? []).includes(s);
                return (
                  <Badge key={s} tone={starred ? "amber" : "indigo"}>
                    {starred ? "★ " : ""}
                    {s}
                  </Badge>
                );
              })
            )}
          </dd>
        </div>

        <div className="mt-5">
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Notes
          </dt>
          <dd className="mt-0.5 whitespace-pre-wrap text-sm text-slate-800">
            {candidate.notes || "—"}
          </dd>
        </div>
      </Card>

      <ResumeSection
        candidateId={candidate.id}
        resumes={candidate.resumes.map((r) => ({
          id: r.id,
          label: r.label,
          hasFile: r.blobPathname != null,
          contentType: r.contentType,
          isActive: r.isActive,
          submissionCount: r._count.submissions,
        }))}
      />

      <DocumentsManager
        candidateId={candidate.id}
        canManageSensitive={canManageSensitiveDocs(user)}
        documents={documents.map((d) => ({
          id: d.id,
          category: d.category,
          label: d.label,
          issuedAt: d.issuedAt,
          expiresAt: d.expiresAt,
          notes: d.notes,
          uploadedBy: d.uploadedBy,
        }))}
      />

      <Card title={`Job submissions (${submissionsTotal})`}>
        {submissionsTotal === 0 ? (
          <p className="rounded-md border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-400">
            This candidate has not been submitted to any jobs yet.
          </p>
        ) : (
          <Table>
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <Th>Sub ID</Th>
                <Th>Job</Th>
                <Th>Client</Th>
                <Th>Vendor</Th>
                <Th>Source</Th>
                <Th>Submitted by</Th>
                <Th>Submitted</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {submissions.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <Td label="Sub ID" secondary className="font-mono text-xs">
                    {formatSubmissionDisplayId(s)}
                  </Td>
                  <Td label="Job">
                    <Link
                      href={`/jobs/${s.job.id}`}
                      className="font-medium text-indigo-600 hover:underline"
                    >
                      {s.job.title}
                    </Link>
                  </Td>
                  <Td label="Client">{s.job.client.name}</Td>
                  <Td label="Vendor">{s.job.vendor.name}</Td>
                  <Td label="Source">{jobSourceLabel(s.job)}</Td>
                  <Td label="Submitted by">{s.submittedBy.fullName}</Td>
                  <Td label="Submitted" className="whitespace-nowrap">
                    {formatDate(s.submittedAt)}
                  </Td>
                  <Td label="Status">
                    <Badge tone={SUBMISSION_STATUS_TONE[s.status]}>
                      {SUBMISSION_STATUS_LABEL[s.status]}
                    </Badge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {submissionsTotal > PAGE_SIZE && (
          <div className="mt-3">
            <Pagination
              page={submissionsPage}
              totalPages={submissionsTotalPages}
              total={submissionsTotal}
              paramKey="subs"
              pageSize={PAGE_SIZE}
            />
          </div>
        )}
      </Card>

      {placementsTotal > 0 && (
        <Card title={`Placement history (${placementsTotal})`}>
          <Table>
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <Th>ID</Th>
                <Th>Job</Th>
                <Th>Client</Th>
                <Th>Start</Th>
                <Th>End</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {placements.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <Td label="ID" secondary className="font-mono text-xs">
                    <Link
                      href={`/placements/${p.id}`}
                      className="text-indigo-600 hover:underline"
                    >
                      {formatPlacementDisplayId(p)}
                    </Link>
                  </Td>
                  <Td label="Job">{p.job.title}</Td>
                  <Td label="Client">{p.job.client.name}</Td>
                  <Td label="Start" className="whitespace-nowrap">
                    {formatDate(p.startDate)}
                  </Td>
                  <Td label="End" className="whitespace-nowrap">
                    {p.endDate ? formatDate(p.endDate) : "—"}
                  </Td>
                  <Td label="Status">
                    <Badge tone={PLACEMENT_STATUS_TONE[p.status]}>
                      {PLACEMENT_STATUS_LABEL[p.status]}
                    </Badge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {placementsTotal > PAGE_SIZE && (
            <div className="mt-3">
              <Pagination
                page={placementsPageNum}
                totalPages={placementsTotalPages}
                total={placementsTotal}
                paramKey="placements"
                pageSize={PAGE_SIZE}
              />
            </div>
          )}
        </Card>
      )}

      <Card title={`Interview history (${interviewsTotal})`}>
        {interviewsTotal === 0 ? (
          <p className="rounded-md border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-400">
            No interviews recorded for this candidate yet.
          </p>
        ) : (
          <CandidateInterviewsGrouped rows={interviews} />
        )}
        {interviewsTotal > PAGE_SIZE && (
          <div className="mt-3">
            <Pagination
              page={interviewsPage}
              totalPages={interviewsTotalPages}
              total={interviewsTotal}
              paramKey="ints"
              pageSize={PAGE_SIZE}
            />
          </div>
        )}
      </Card>

      <NotesSection
        entityType="CANDIDATE"
        entityId={candidate.id}
        notes={notes}
      />

      <ActivityTimeline entries={timeline} />

      {isAdmin && !isErased && !isTrashed && (
        <CandidateDangerZone
          candidateId={candidate.id}
          candidateName={candidate.fullName}
          retentionDays={CANDIDATE_TRASH_RETENTION_DAYS}
          isActive={candidate.isActive}
        />
      )}
    </div>
  );
}
