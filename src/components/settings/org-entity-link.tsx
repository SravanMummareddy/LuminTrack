import Link from "next/link";
import type { OrgEntityKind } from "@/server/queries/org";

/**
 * Renders a Client/Vendor/Source/Referrer name as a link to its manager-only
 * detail page — but ONLY for managers. Recruiters (and any missing id) get plain
 * text, so nobody is sent to a page they can't view. Used across the app wherever
 * one of these names is displayed.
 */
export function OrgEntityLink({
  kind,
  id,
  name,
  isManager,
  className,
}: {
  kind: OrgEntityKind;
  id: string | null | undefined;
  name: string;
  isManager: boolean;
  className?: string;
}) {
  if (!isManager || !id) return <>{name}</>;
  return (
    <Link href={`/settings/${kind}/${id}`} className={className ?? "text-indigo-600 hover:underline"}>
      {name}
    </Link>
  );
}
