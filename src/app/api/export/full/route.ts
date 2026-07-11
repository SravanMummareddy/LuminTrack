import { getCurrentUser, getScopedPrisma } from "@/lib/session";
import { hasFullAccess } from "@/lib/permissions";
import { logActivity } from "@/server/activity";
import { buildBackupJson } from "@/server/exporters/build-backup-json";

export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!hasFullAccess(user)) return new Response("Forbidden", { status: 403 });

  const db = await getScopedPrisma();

  const backup = await buildBackupJson(db);
  const json = JSON.stringify(backup, null, 2);
  const filename = `lumintrack-backup-${new Date().toISOString().slice(0, 10)}.json`;

  await db.$transaction(async (tx) => {
    await logActivity(tx, {
      entityType: "JOB",
      action: "DATA_EXPORTED",
      description: `Full JSON backup exported (${Math.round(json.length / 1024)} KB)`,
      note: `mode=full;format=json;bytes=${json.length}`,
      performedById: user.id,
    });
  });

  return new Response(json, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
