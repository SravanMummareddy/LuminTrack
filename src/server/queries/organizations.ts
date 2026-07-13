import { prisma } from "@/server/db";
import { DEFAULT_ORG_ID } from "@/lib/default-org";

export type OrganizationRow = {
  id: string;
  seq: number;
  name: string;
  slug: string;
  isActive: boolean;
  userCount: number;
  /** The foundation default org that all pre-tenancy data was backfilled into. */
  isDefault: boolean;
};

/** Every organization for the Settings → Organizations tab (platform-admin only).
 *  Uses the UNSCOPED base client on purpose — Organization is a global table and
 *  managing tenants is a cross-tenant, super-admin operation. */
export async function listOrganizationsAdmin(): Promise<OrganizationRow[]> {
  const orgs = await prisma.organization.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      seq: true,
      name: true,
      slug: true,
      isActive: true,
      _count: { select: { users: true } },
    },
  });
  return orgs.map((o) => ({
    id: o.id,
    seq: o.seq,
    name: o.name,
    slug: o.slug,
    isActive: o.isActive,
    userCount: o._count.users,
    isDefault: o.id === DEFAULT_ORG_ID,
  }));
}
