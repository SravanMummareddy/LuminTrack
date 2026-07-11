// The single default organization every existing row was backfilled into by the
// Phase C multi-tenancy migration (20260711170000_multi_tenancy). The id is a
// fixed sentinel (not a cuid) so migrations, seeds, and provisioning all agree.
// Foundation runs single-tenant under this org; more orgs are added on top.
export const DEFAULT_ORG_ID = "org_lumintrack_default";
export const DEFAULT_ORG_SLUG = "lumintrack";
export const DEFAULT_ORG_NAME = "LuminTrack";
