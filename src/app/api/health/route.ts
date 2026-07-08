import { prisma } from "@/server/db";

/**
 * Liveness/readiness probe for uptime monitors. Public (no auth) so an external
 * checker can hit it. Verifies the app is up AND can reach the database; returns
 * 503 if the DB round-trip fails so a monitor flags a hard outage, not just a
 * slow page.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok", db: "up" });
  } catch {
    return Response.json({ status: "error", db: "down" }, { status: 503 });
  }
}
