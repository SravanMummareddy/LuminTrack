import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Pencil } from "lucide-react";
import { LinkButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, Th, Td } from "@/components/ui/table";
import { ActivityTimeline } from "@/components/timeline/activity-timeline";
import { NotesSection } from "@/components/notes/notes-section";
import { getCandidateDetail } from "@/server/queries/candidates";
import { getCandidateSubmissions } from "@/server/queries/submissions";
import { getCandidateInterviewRounds } from "@/server/queries/interviews";
import { getTimelineFor } from "@/server/queries/timeline";
import { getNotesFor } from "@/server/queries/notes";
import { toDrivePreviewUrl } from "@/lib/resume";
import {
  SUBMISSION_STATUS_LABEL,
  SUBMISSION_STATUS_TONE,
  INTERVIEW_TYPE_LABEL,
  INTERVIEW_RESULT_LABEL,
  INTERVIEW_RESULT_TONE,
} from "@/lib/labels";
import { formatDate, formatDateTime, formatExperience } from "@/lib/format";

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
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [candidate, submissions, interviews, timeline, notes] =
    await Promise.all([
      getCandidateDetail(id),
      getCandidateSubmissions(id),
      getCandidateInterviewRounds(id),
      getTimelineFor("CANDIDATE", id),
      getNotesFor("CANDIDATE", id),
    ]);
  if (!candidate) notFound();

  const previewUrl = candidate.resumeDriveLink
    ? toDrivePreviewUrl(candidate.resumeDriveLink)
    : null;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Link
        href="/candidates"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to candidates
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-slate-900">
            {candidate.fullName}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {candidate.currentCompany || "Company not set"}
          </p>
        </div>
        <LinkButton href={`/candidates/${candidate.id}/edit`} variant="secondary">
          <Pencil className="h-4 w-4" />
          Edit candidate
        </LinkButton>
      </div>

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
          <DescItem label="LinkedIn">
            {candidate.linkedinUrl ? (
              <a
                href={candidate.linkedinUrl}
                target="_blank"
                rel="noreferrer"
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
        </dl>

        <div className="mt-5">
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Skills
          </dt>
          <dd className="mt-1.5 flex flex-wrap gap-1.5">
            {candidate.skills.length === 0 ? (
              <span className="text-sm text-slate-500">No skills listed</span>
            ) : (
              candidate.skills.map((s) => (
                <Badge key={s} tone="indigo">
                  {s}
                </Badge>
              ))
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

      <Card title="Resume">
        {!candidate.resumeDriveLink ? (
          <p className="text-sm text-slate-400">No resume link added.</p>
        ) : (
          <div className="space-y-3">
            <a
              href={candidate.resumeDriveLink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:underline"
            >
              Open resume in a new tab
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
            {previewUrl ? (
              <iframe
                src={previewUrl}
                title="Resume preview"
                className="h-[600px] w-full rounded-md border border-slate-200"
              />
            ) : (
              <p className="text-xs text-slate-500">
                Inline preview is available for Google Drive links only — use
                the link above to open this resume.
              </p>
            )}
          </div>
        )}
      </Card>

      <Card title={`Job submissions (${submissions.length})`}>
        {submissions.length === 0 ? (
          <p className="rounded-md border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-400">
            This candidate has not been submitted to any jobs yet.
          </p>
        ) : (
          <Table>
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
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
                  <Td>
                    <Link
                      href={`/submissions/${s.id}`}
                      className="font-medium text-indigo-600 hover:underline"
                    >
                      {s.job.title}
                    </Link>
                  </Td>
                  <Td>{s.job.client.name}</Td>
                  <Td>{s.job.vendor.name}</Td>
                  <Td>{s.job.sisterCompanySource.name}</Td>
                  <Td>{s.submittedBy.fullName}</Td>
                  <Td className="whitespace-nowrap">
                    {formatDate(s.submittedAt)}
                  </Td>
                  <Td>
                    <Badge tone={SUBMISSION_STATUS_TONE[s.status]}>
                      {SUBMISSION_STATUS_LABEL[s.status]}
                    </Badge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card title={`Interview history (${interviews.length})`}>
        {interviews.length === 0 ? (
          <p className="rounded-md border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-400">
            No interviews recorded for this candidate yet.
          </p>
        ) : (
          <Table>
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <Th>Job</Th>
                <Th>Round</Th>
                <Th>Type</Th>
                <Th>Interviewer</Th>
                <Th>Date &amp; time</Th>
                <Th>Result</Th>
                <Th>Feedback</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {interviews.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <Td>
                    <Link
                      href={`/submissions/${r.submission.id}`}
                      className="font-medium text-indigo-600 hover:underline"
                    >
                      {r.submission.job.title}
                    </Link>
                  </Td>
                  <Td>
                    Round {r.roundOrder} · {r.roundName}
                  </Td>
                  <Td>{INTERVIEW_TYPE_LABEL[r.interviewType]}</Td>
                  <Td>{r.interviewerName || "—"}</Td>
                  <Td className="whitespace-nowrap">
                    {r.scheduledAt ? formatDateTime(r.scheduledAt) : "—"}
                  </Td>
                  <Td>
                    <Badge tone={INTERVIEW_RESULT_TONE[r.result]}>
                      {INTERVIEW_RESULT_LABEL[r.result]}
                    </Badge>
                  </Td>
                  <Td>
                    <span className="block max-w-xs whitespace-pre-wrap">
                      {r.feedback || "—"}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <NotesSection
        entityType="CANDIDATE"
        entityId={candidate.id}
        notes={notes}
      />

      <ActivityTimeline entries={timeline} />
    </div>
  );
}
