"use client";

import { Input, Select } from "@/components/ui/field";

/** Status filter value shared by the Settings list sections. */
export type StatusFilter = "all" | "active" | "inactive";

const labelClass = "mb-1 block text-xs font-medium text-slate-500";

/**
 * Lightweight client-side filter row shared by the Settings list sections.
 * Record counts here are small, so filtering happens in memory rather than
 * through the URL-driven FilterBar used on the main list pages.
 */
export function SettingsListFilter({
  search,
  onSearchChange,
  status,
  onStatusChange,
  searchPlaceholder,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  status: StatusFilter;
  onStatusChange: (value: StatusFilter) => void;
  searchPlaceholder?: string;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
      <div className="min-w-[12rem] flex-1">
        <label className={labelClass} htmlFor="settings-search">
          Search
        </label>
        <Input
          id="settings-search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder ?? "Search by name…"}
        />
      </div>
      <div className="sm:w-44">
        <label className={labelClass} htmlFor="settings-status">
          Status
        </label>
        <Select
          id="settings-status"
          value={status}
          onChange={(e) => onStatusChange(e.target.value as StatusFilter)}
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </Select>
      </div>
    </div>
  );
}
