import { Prisma } from "@/generated/prisma/client";

// The org-scoping query extension — the single point that enforces the tenant
// boundary. Kept in its own module (no Prisma *client* construction) so it can be
// unit-tested and reused to wrap any base client: the app singleton
// (`scopedPrisma`), the demo seed's pg client, and the integration tests'.

// Only these two models are global (cross-tenant); every other model carries
// `organizationId` and is scoped. A model missing from this set is scoped by
// DEFAULT (fail closed).
const GLOBAL_MODELS = new Set(["Organization", "Permission"]);

// Operations whose `args.where` we filter by organizationId. Prisma 7's
// extendedWhereUnique (GA) lets us add a non-unique field to a unique `where`, so
// findUnique/update/delete accept `{ id, organizationId }` and return/affect
// nothing when the id belongs to another tenant.
const WHERE_OPS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "delete",
  "deleteMany",
]);

type AnyArgs = Record<string, unknown>;

function stampData(data: unknown, orgId: string): unknown {
  if (Array.isArray(data))
    return data.map((d) => ({ ...(d as AnyArgs), organizationId: orgId }));
  return { ...(data as AnyArgs), organizationId: orgId };
}

/**
 * The pure injection step: given (model, operation, args), return the args with
 * `organizationId` woven into the `where` (reads/updates/deletes) or `data`
 * (creates). Global models pass through untouched. Exposed for unit testing; the
 * extension below just runs the real query with the result.
 */
export function scopeArgs(
  orgId: string,
  model: string | undefined,
  operation: string,
  args: unknown,
): AnyArgs {
  if (model && GLOBAL_MODELS.has(model)) return (args ?? {}) as AnyArgs;
  const a = (args ?? {}) as AnyArgs;

  if (WHERE_OPS.has(operation)) {
    a.where = { ...((a.where as AnyArgs) ?? {}), organizationId: orgId };
  } else if (
    operation === "create" ||
    operation === "createMany" ||
    operation === "createManyAndReturn"
  ) {
    a.data = stampData(a.data, orgId);
  } else if (operation === "upsert") {
    a.where = { ...((a.where as AnyArgs) ?? {}), organizationId: orgId };
    a.create = stampData(a.create, orgId);
  }
  return a;
}

/**
 * The org-scoping query extension, usable by any base client. Injects
 * `organizationId` into every read `where` and every create `data`, so no query
 * can cross tenants. See src/server/db.ts (`scopedPrisma`) for the app wiring.
 */
export function orgScopeExtension(orgId: string) {
  return Prisma.defineExtension({
    name: "org-scope",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          return query(scopeArgs(orgId, model, operation, args));
        },
      },
    },
  });
}
