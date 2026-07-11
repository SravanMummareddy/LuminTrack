import { Readable } from "node:stream";
import { z } from "zod";
import { getCurrentUser, getScopedPrisma } from "@/lib/session";
import { hasFullAccess } from "@/lib/permissions";
import { logActivity } from "@/server/activity";
import {
  streamBusinessExcel,
  EXCEL_ENTITIES,
  type ExcelEntity,
} from "@/server/exporters/build-business-excel";

export const dynamic = "force-dynamic";

const schema = z.object({
  mode: z.enum(["business", "full"]),
  entities: z.array(z.enum(EXCEL_ENTITIES)).min(1),
});

export async function POST(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!hasFullAccess(user)) return new Response("Forbidden", { status: 403 });

  const db = await getScopedPrisma();

  let body: unknown;
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    body = await req.json();
  } else {
    const form = await req.formData();
    body = {
      mode: form.get("mode"),
      entities: form.getAll("entities"),
    };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return new Response(`Invalid payload: ${parsed.error.message}`, { status: 400 });
  }

  const entities = parsed.data.entities as ExcelEntity[];
  const filename = `lumintrack-${parsed.data.mode}-${new Date().toISOString().slice(0, 10)}.xlsx`;

  // Audit-log eagerly. Bytes are unknown in streaming mode — the trail still
  // captures who/when/what, just not exact size.
  await db.$transaction(async (tx) => {
    await logActivity(tx, {
      entityType: "JOB",
      action: "DATA_EXPORTED",
      description: `Excel export (${parsed.data.mode}, ${entities.length} sheet${entities.length === 1 ? "" : "s"})`,
      note: `mode=${parsed.data.mode};format=xlsx;entities=${entities.join(",")};streamed=true`,
      performedById: user.id,
    });
  });

  const nodeStream = streamBusinessExcel({ mode: parsed.data.mode, entities });
  // Node Readable → Web ReadableStream so Next.js can pipe it to the client
  // without buffering. Chunked transfer is implied (no Content-Length).
  const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream<Uint8Array>;

  return new Response(webStream, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
