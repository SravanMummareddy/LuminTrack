import "dotenv/config";
import { Client } from "pg";

/**
 * Database access for the E2E suite. Two uses only:
 *   1. *Pick fixtures* — find seed rows to open in the browser (read-only).
 *   2. *Arrange preconditions* for adversarial tests — force a known mix of
 *      statuses that would be tedious/impossible to set up through the UI.
 * The ACTION under test always goes through the real UI; these helpers never
 * assert app behavior, only set up state and read back the ground truth.
 *
 * Uses the raw `pg` driver (not the generated Prisma client, which is ESM and
 * can't be imported by Playwright's transform) over the direct-TCP connection.
 */
const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DIRECT_URL / DATABASE_URL not set — E2E fixture DB access needs it.");
}

let client: Client | null = null;
async function db(): Promise<Client> {
  if (!client) {
    client = new Client({ connectionString });
    await client.connect();
  }
  return client;
}

export async function closeDb(): Promise<void> {
  if (client) {
    await client.end();
    client = null;
  }
}

/** An OPEN vendor requirement (the state the "Submit a candidate" flow needs). */
export async function pickOpenRequirement(): Promise<{
  id: string;
  jobTitle: string;
}> {
  const c = await db();
  const { rows } = await c.query<{ id: string; title: string }>(
    `SELECT vr.id, j.title
       FROM "VendorRequirement" vr
       JOIN "Job" j ON j.id = vr."jobId"
      WHERE vr.status = 'OPEN'
      ORDER BY vr."createdAt" DESC
      LIMIT 1`,
  );
  if (rows.length === 0) {
    throw new Error("No OPEN vendor requirement in the seed — reseed the DB.");
  }
  return { id: rows[0].id, jobTitle: rows[0].title };
}

// ── Adversarial arrangement ─────────────────────────────────────────────────

export type ArrangedRow = { subId: string; candidateName: string; status: string };

/** A manager user + a job to hang freshly-created test rows off of. */
async function seedRefs(): Promise<{ userId: string; jobId: string }> {
  const c = await db();
  const { rows } = await c.query<{ user_id: string; job_id: string }>(
    `SELECT (SELECT id FROM "User" WHERE role = 'MANAGER' ORDER BY "createdAt" LIMIT 1) AS user_id,
            (SELECT id FROM "Job" ORDER BY "createdAt" LIMIT 1) AS job_id`,
  );
  if (!rows[0]?.user_id || !rows[0]?.job_id) {
    throw new Error("Seed missing a manager user or a job — reseed the DB.");
  }
  return { userId: rows[0].user_id, jobId: rows[0].job_id };
}

/**
 * Insert ONE fresh candidate + ONE fresh submission in `status`, so each row is
 * fully isolated (the candidate has exactly this one submission). `id`s are
 * prefixed `e2e_` so they're easy to spot; `seq` is DB-assigned. Reseed to
 * clear them.
 */
async function insertArrangedRow(
  token: string,
  i: number,
  status: string,
): Promise<ArrangedRow> {
  const c = await db();
  const { userId, jobId } = await seedRefs();
  const candId = `e2e_${token}_c${i}`;
  const subId = `e2e_${token}_s${i}`;
  const name = `E2E ${token} #${i}`;
  await c.query(
    `INSERT INTO "Candidate" (id, "fullName", status, "createdById", "updatedAt")
     VALUES ($1, $2, 'AVAILABLE', $3, now())`,
    [candId, name, userId],
  );
  await c.query(
    `INSERT INTO "Submission" (id, status, "candidateId", "jobId", "submittedById", "submittedAt", "updatedAt")
     VALUES ($1, $2::"SubmissionStatus", $3, $4, $5, now(), now())`,
    [subId, status, candId, jobId, userId],
  );
  return { subId, candidateName: name, status };
}

/**
 * Create a set of freshly-isolated submissions in the given statuses, all tagged
 * with a shared unique token in their candidate names so a single name-search
 * (`?q=<token>`) returns exactly these rows on one page. Order is preserved.
 */
export async function arrangeSubmissionMix(statuses: string[]): Promise<{
  token: string;
  rows: ArrangedRow[];
}> {
  const token = `E2EMIX${Date.now().toString(36)}`;
  const rows: ArrangedRow[] = [];
  for (let i = 0; i < statuses.length; i++) {
    rows.push(await insertArrangedRow(token, i, statuses[i]));
  }
  return { token, rows };
}

/** Current statuses of the given submissions, as a { id: status } map. */
export async function getSubmissionStatuses(
  ids: string[],
): Promise<Record<string, string>> {
  const c = await db();
  const { rows } = await c.query<{ id: string; status: string }>(
    `SELECT id, status FROM "Submission" WHERE id = ANY($1)`,
    [ids],
  );
  return Object.fromEntries(rows.map((r) => [r.id, r.status]));
}

/**
 * Arrange one submission at OFFER_ACCEPTED with its candidate AVAILABLE and no
 * existing placement — the precondition for the JOINED → placement cascade.
 */
export async function arrangeOfferAccepted(): Promise<{
  subId: string;
  candidateId: string;
  candidateName: string;
}> {
  const c = await db();
  const { userId, jobId } = await seedRefs();
  const token = `E2EJOIN${Date.now().toString(36)}`;
  const candId = `e2e_${token}_c`;
  const subId = `e2e_${token}_s`;
  const name = `E2E ${token}`;
  await c.query(
    `INSERT INTO "Candidate" (id, "fullName", status, "createdById", "updatedAt")
     VALUES ($1, $2, 'AVAILABLE', $3, now())`,
    [candId, name, userId],
  );
  await c.query(
    `INSERT INTO "Submission" (id, status, "candidateId", "jobId", "submittedById", "submittedAt", "updatedAt")
     VALUES ($1, 'OFFER_ACCEPTED', $2, $3, $4, now(), now())`,
    [subId, candId, jobId, userId],
  );
  return { subId, candidateId: candId, candidateName: name };
}

/** The placement status for a submission, or null if none exists. */
export async function getPlacementStatusForSubmission(
  subId: string,
): Promise<string | null> {
  const c = await db();
  const { rows } = await c.query<{ status: string }>(
    `SELECT status FROM "Placement" WHERE "submissionId" = $1 LIMIT 1`,
    [subId],
  );
  return rows[0]?.status ?? null;
}

/** A candidate's lifecycle status. */
export async function getCandidateStatus(candidateId: string): Promise<string> {
  const c = await db();
  const { rows } = await c.query<{ status: string }>(
    `SELECT status FROM "Candidate" WHERE id = $1`,
    [candidateId],
  );
  return rows[0]?.status ?? "";
}
