import { z } from "zod";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/server/db";
import { logActivity } from "@/server/activity";
import {
  buildBusinessExcel,
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
  if (user.role !== "ADMIN") return new Response("Forbidden", { status: 403 });

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
  const buf = await buildBusinessExcel({ mode: parsed.data.mode, entities });
  const filename = `lumintrack-${parsed.data.mode}-${new Date().toISOString().slice(0, 10)}.xlsx`;

  await prisma.$transaction(async (tx) => {
    await logActivity(tx, {
      entityType: "JOB",
      action: "DATA_EXPORTED",
      description: `Excel export (${parsed.data.mode}, ${entities.length} sheet${entities.length === 1 ? "" : "s"}, ${Math.round(buf.length / 1024)} KB)`,
      note: `mode=${parsed.data.mode};format=xlsx;entities=${entities.join(",")};bytes=${buf.length}`,
      performedById: user.id,
    });
  });

  return new Response(buf as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buf.length),
    },
  });
}
