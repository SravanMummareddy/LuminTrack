/**
 * Clear ORPHANED résumé/document files from the Vercel Blob store — files no
 * current DB row points at. The DB wipe (seed-pilot.ts) drops the rows but
 * leaves the files behind; this clears the strays so the pilot starts clean.
 *
 *   set -a; . ./.env.neon-prod.bak; set +a     # prod DB + prod BLOB token together
 *   CONFIRM_WIPE_BLOB=yes npx tsx prisma/wipe-blob.ts
 *
 * SAFE ON A LIVE, SHARED STORE. dev + prod share ONE blob store, and prod is
 * live — a recruiter can upload at any moment. So we never blanket-delete by
 * prefix. Instead we read the CURRENT `blobPathname`s off candidateResume +
 * candidateDocument and delete only blobs NOT referenced by any row. A real
 * upload creates its row, so it is always preserved. Run it against whichever
 * env is sourced; run against PROD to clear prod-orphans.
 *
 * PRESERVES `backups/` (DB DR snapshots) and `archives/` (candidate-erase
 * bundles) unconditionally — those are recovery artifacts, tracked outside these
 * tables. DESTRUCTIVE + IRREVERSIBLE for the strays; dry-run by default.
 */
import "dotenv/config";
import { list, del } from "@vercel/blob";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const token = process.env.BLOB_READ_WRITE_TOKEN;
if (!token) {
  console.error("\n✗ BLOB_READ_WRITE_TOKEN is not set. Source the target env first.\n");
  process.exit(1);
}
const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error("\n✗ DIRECT_URL / DATABASE_URL is not set. Source the target env first.\n");
  process.exit(1);
}

// Never deleted — recovery artifacts written outside the resume/document tables.
const KEEP_PREFIXES = ["backups/", "archives/"];

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  // 1. Every blob key a current row still points at (the "keep" set).
  const [resumes, docs] = await Promise.all([
    db.candidateResume.findMany({ where: { blobPathname: { not: null } }, select: { blobPathname: true } }),
    db.candidateDocument.findMany({ where: { blobPathname: { not: null } }, select: { blobPathname: true } }),
  ]);
  const referenced = new Set<string>();
  for (const r of resumes) if (r.blobPathname) referenced.add(r.blobPathname);
  for (const d of docs) if (d.blobPathname) referenced.add(d.blobPathname);

  // 2. List the store; an orphan = not referenced and not a kept prefix.
  const orphans: { url: string; pathname: string }[] = [];
  let referencedKept = 0, prefixKept = 0, cursor: string | undefined;
  do {
    const page = await list({ token, cursor, limit: 1000 });
    for (const b of page.blobs) {
      if (KEEP_PREFIXES.some((p) => b.pathname.startsWith(p))) { prefixKept++; continue; }
      if (referenced.has(b.pathname)) { referencedKept++; continue; }
      orphans.push({ url: b.url, pathname: b.pathname });
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  console.log(`\nReferenced by a live row (kept): ${referencedKept}`);
  console.log(`Backups/archives (kept):         ${prefixKept}`);
  console.log(`Orphans to delete:               ${orphans.length}`);
  if (orphans.length === 0) { console.log("\nNothing to delete.\n"); return; }
  for (const o of orphans.slice(0, 20)) console.log(`  ${o.pathname}`);
  if (orphans.length > 20) console.log(`  … +${orphans.length - 20} more`);

  if (process.env.CONFIRM_WIPE_BLOB !== "yes") {
    console.log("\nDry run (set CONFIRM_WIPE_BLOB=yes to delete). Nothing deleted.\n");
    return;
  }

  const BATCH = 100;
  let done = 0;
  for (let i = 0; i < orphans.length; i += BATCH) {
    const batch = orphans.slice(i, i + BATCH);
    await del(batch.map((o) => o.url), { token });
    done += batch.length;
    console.log(`  deleted ${done}/${orphans.length}`);
  }
  console.log("\n✓ Orphaned blobs cleared.\n");
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => db.$disconnect());
