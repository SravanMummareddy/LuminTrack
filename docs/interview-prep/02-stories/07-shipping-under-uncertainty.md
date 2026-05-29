# Story 07 — The tolerant iLabor envelope adapter

## Question this answers

- "A time you shipped something with incomplete information."
- "How do you handle external systems that change?"
- "A time you delivered ahead of a dependency being ready."

## Situation

The iLabor portal is a third-party system the recruiting team
copies requisitions from. The plan was: the team would install a
browser extension, click a button to grab JSON, and upload it to
LuminTrack. The extension was scoped as Phase 8b — a separate
repo, several weeks out. But the importer (Phases 4–8a) needed to
ship *now*, before any extension existed.

The team's stopgap was to capture the raw network responses from
the iLabor portal manually (DevTools → Network → save as JSON)
and upload that. But the raw envelope wasn't stable — fields
moved between versions, the wrapper shape was different at
different endpoints.

## Task

Ship the importer in a way that:

- Works *today* with hand-captured raw network captures.
- Will work *tomorrow* with the extension's cleaner output.
- Doesn't lock the schema to one envelope.

## Action

1. **Surveyed the variation.** Captured three sample JSONs from
   different days. Two had the requisitions under
   `data.searchResults.results`. One had them under
   `searchResults.results`. One had an extra `metadata.scrapedAt`
   field; another didn't.
2. **Designed a tolerant envelope adapter.** Wrote
   `src/lib/import/ilabor-format.ts` — a normaliser that:
   - Sniffs which key path the rows live under, walking common
     candidates.
   - Drops missing optional metadata.
   - Returns a normalised shape the rest of the importer
     expects.
3. **Strict per-row validation.** The envelope is forgiving; the
   rows are validated with Zod against `ilaborRowSchema`.
   Permissive at the seam, strict inside.
4. **Phased ship.** Wrote a `previewRequisitions` action first
   (read-only, no DB writes). Verified it on real captures from
   three sources. Only then wrote `importRequisitions`.
5. **Made errors actionable.** The preview surfaces per-row error
   reasons + hints (req id + title) so admins can locate the
   bad row in iLabor and fix it.
6. **Wrote it knowing the extension will replace the input.** The
   extension's cleaner JSON will still flow through the
   adapter — it just won't need any sniffing. Zero work to
   integrate.

## Result

- Importer shipped with Phases 4–8a; team is using it daily on
  manual captures.
- The Phase 8b extension can be built in a separate repo on its
  own schedule. Whenever it lands, the adapter will accept its
  cleaner JSON unchanged.
- The audit log captures every import event (`REQUISITIONS_IMPORTED`,
  plus per-job `JOB_IMPORTED`) for full traceability.

## Variant phrasings

- **"A time you decoupled from a future dependency":** The
  adapter is the seam that decouples the importer from whichever
  source produced the JSON.
- **"A time you shipped iteratively":** Preview action first.
  Verified. Then mutation action.
- **"A time you accepted imperfection":** The tolerant adapter
  isn't elegant — it's a series of "try this key path, then
  this one." It's pragmatic.

## Honest caveats

- The adapter has no automated tests today. It has been verified
  against the captures we have; new shapes might require new
  fallback branches. I'd add tests as the extension lands so
  there's a regression net.
- The per-row Zod schema accumulated optional fields ahead of
  knowing what we'd actually use. Lean toward "drop columns
  later, easier to add now."
