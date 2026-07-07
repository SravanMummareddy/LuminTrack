import Link from "next/link";
import { CircleCheck, Circle } from "lucide-react";
import type { OnboardingStatus } from "@/server/queries/dashboard";

type Step = {
  done: boolean;
  title: string;
  description: string;
  href: string;
  cta: string;
};

/**
 * Getting-started checklist for a team migrating off Excel. Shown on the
 * Dashboard only until the first submission exists (the core loop is complete),
 * then it disappears. Steps mark themselves done from cheap existence checks
 * (`getOnboardingStatus`) and link straight to the relevant entry point.
 */
export function OnboardingChecklist({
  status,
  isAdmin,
}: {
  status: OnboardingStatus;
  isAdmin: boolean;
}) {
  const steps: Step[] = [
    {
      done: status.hasJobs,
      title: "Add your first job",
      description: isAdmin
        ? "Create one manually, or bulk-import requisitions from iLabor."
        : "Create the requirement you're recruiting for.",
      href: isAdmin ? "/jobs/import" : "/jobs/new",
      cta: isAdmin ? "Import or add a job" : "Add a job",
    },
    {
      done: status.hasCandidates,
      title: "Add a candidate",
      description: "Build your candidate list with résumés and contact details.",
      href: "/candidates/new",
      cta: "Add a candidate",
    },
    {
      done: status.hasAssignments,
      title: "Assign a job to a recruiter",
      description: isAdmin
        ? "Assign jobs from the Jobs list so recruiters own their pipeline."
        : "Claim a job from its page so you can submit candidates to it.",
      href: "/jobs",
      cta: isAdmin ? "Open Jobs" : "Find a job to claim",
    },
    {
      done: status.hasSubmissions,
      title: "Submit a candidate",
      description: "Submit a candidate against a vendor requirement — the core daily action.",
      href: "/vendor-portal",
      cta: "Open requirements",
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;

  return (
    <section className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-800">
          Getting started
        </h2>
        <span className="text-xs font-medium text-slate-500">
          {doneCount} of {steps.length} done
        </span>
      </div>
      <p className="mb-4 text-xs text-slate-500">
        A quick tour of the workflow LuminTrack replaces your spreadsheet with.
        This disappears once you&apos;ve made your first submission.
      </p>
      <ol className="space-y-2">
        {steps.map((step, i) => (
          <li
            key={i}
            className="flex items-start gap-3 rounded-md border border-slate-200 bg-white px-3 py-2.5"
          >
            {step.done ? (
              <CircleCheck
                className="mt-0.5 h-5 w-5 shrink-0 text-green-600"
                aria-label="Done"
              />
            ) : (
              <Circle
                className="mt-0.5 h-5 w-5 shrink-0 text-slate-300"
                aria-hidden
              />
            )}
            <div className="min-w-0 flex-1">
              <p
                className={`text-sm font-medium ${
                  step.done ? "text-slate-400 line-through" : "text-slate-800"
                }`}
              >
                {step.title}
              </p>
              {!step.done && (
                <p className="mt-0.5 text-xs text-slate-500">
                  {step.description}
                </p>
              )}
            </div>
            {!step.done && (
              <Link
                href={step.href}
                className="shrink-0 self-center rounded-md border border-indigo-200 bg-white px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-50"
              >
                {step.cta}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
