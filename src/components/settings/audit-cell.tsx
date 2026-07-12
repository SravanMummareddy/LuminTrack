import { formatDate } from "@/lib/format";

export type AuditFields = {
  createdBy: { fullName: string } | null;
  createdAt: Date | string;
  updatedBy: { fullName: string } | null;
  updatedAt: Date | string;
};

/** "Added by X · date / Updated by Y · date" for the Settings admin lists.
 *  Names are absent on rows created before who-added tracking (nullable FKs). */
export function AuditCell({ createdBy, createdAt, updatedBy, updatedAt }: AuditFields) {
  return (
    <div className="text-xs leading-5 text-slate-500">
      <div>
        Added{createdBy ? ` by ${createdBy.fullName}` : ""} · {formatDate(createdAt)}
      </div>
      <div>
        Updated{updatedBy ? ` by ${updatedBy.fullName}` : ""} · {formatDate(updatedAt)}
      </div>
    </div>
  );
}
