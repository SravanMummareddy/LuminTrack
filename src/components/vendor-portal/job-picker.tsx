"use client";

import { useState } from "react";
import { SearchSelect } from "@/components/ui/search-select";

/**
 * The "pick a job" step of the New-requirement flow. Replaces a raw native
 * `<select>` (which dumped every job with no search) with the searchable
 * SearchSelect. Stays a plain GET form — SearchSelect emits a hidden
 * `name="jobId"` input, so the page still receives `?jobId=…` on submit.
 */
export function JobPicker({
  jobs,
}: {
  jobs: { value: string; label: string }[];
}) {
  const [jobId, setJobId] = useState("");
  return (
    <form
      method="get"
      className="rounded-lg border border-slate-200 bg-white p-6 space-y-4"
    >
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">Job</span>
        <SearchSelect
          name="jobId"
          value={jobId}
          onChange={setJobId}
          options={jobs}
          placeholder="Search a job by title, client, or ID…"
        />
      </label>
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={!jobId}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Continue
        </button>
      </div>
    </form>
  );
}
