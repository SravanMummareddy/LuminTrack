import { runDigest } from "@/server/digest";

/**
 * Weekday-morning action-item digest (Wave 7). Wired to a Vercel Cron (see
 * vercel.json). Auth mirrors the other crons: Vercel sends
 * `Authorization: Bearer $CRON_SECRET`; anything else is rejected so the
 * endpoint isn't publicly triggerable. With CRON_SECRET unset it fails closed.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const summary = await runDigest();
  return Response.json({ ok: true, ...summary });
}
