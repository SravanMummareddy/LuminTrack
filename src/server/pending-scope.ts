import type { getScopedPrisma, getCurrentUser } from "@/lib/session";
import { isManagerTier } from "@/lib/permissions";
import { leadsAnyTeam, ledTeamMemberIds } from "@/server/team-lead";

/** Dashboard / todo scope: your own queue, your team's, or the org. */
export type Scope = "me" | "team" | "org";

type Db = Awaited<ReturnType<typeof getScopedPrisma>>;
type Viewer = Awaited<ReturnType<typeof getCurrentUser>>;

export type ResolvedTodoScope = {
  scope: Scope;
  /** Scopes this viewer may switch to. */
  availableScopes: Scope[];
  /** The team's member ids in team scope (else empty). */
  memberIds: string[];
  /** Whose todos to load — the team's members, or just the viewer. */
  todoUserIds: string[];
  /** me / team drive the unified pending-todo view; org is the manager rollup. */
  isTaskScope: boolean;
  isManager: boolean;
  isLead: boolean;
};

/**
 * Resolve the effective dashboard/todo scope for a viewer + a requested `?scope=`.
 * Managers get me/org, team leads me/team, plain recruiters me only; a requested
 * scope is honoured only if the viewer is entitled to it, else it defaults
 * (managers→org, everyone else→me). Shared by the dashboard card and the full
 * `/todos` page so their "View all" links stay consistent.
 */
export async function resolveTodoScope(
  db: Db,
  user: Viewer,
  requested: string | undefined,
): Promise<ResolvedTodoScope> {
  const isManager = isManagerTier(user);
  const isLead = !isManager && user ? await leadsAnyTeam(db, user.id) : false;
  const availableScopes: Scope[] = isManager
    ? ["me", "org"]
    : isLead
      ? ["me", "team"]
      : ["me"];
  const scope: Scope =
    requested && availableScopes.includes(requested as Scope)
      ? (requested as Scope)
      : isManager
        ? "org"
        : "me";
  const memberIds =
    scope === "team" && user ? await ledTeamMemberIds(db, user.id) : [];
  const todoUserIds = scope === "team" ? memberIds : user ? [user.id] : [];
  const isTaskScope = scope === "me" || scope === "team";
  return {
    scope,
    availableScopes,
    memberIds,
    todoUserIds,
    isTaskScope,
    isManager,
    isLead,
  };
}
