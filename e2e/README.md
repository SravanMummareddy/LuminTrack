# E2E tests (Playwright)

The top of the test pyramid: a real Chromium browser drives the running app
against the seeded database, exercising full user journeys the way a person
does. Below this sit the no-DB unit suite (`npm test`) and the
Dockerized-Postgres integration suite (`npm run test:integration`).

## Prerequisites (the contract)

1. **App running** on `http://localhost:3000` (`npm run dev`). The config will
   reuse an already-running server, or start one if none is up.
2. **DB seeded** with the demo dataset: `npx tsx prisma/seed-demo.ts`. The specs
   log in as the seeded **admin** (`sriman@lumintrack.com`) and **recruiter**
   (`hrishikesh@lumintrack.com`), both password `LuminTrack2026!`.
   `global-setup` logs both in once and fails with a clear message if the seed
   is missing.

## Run

```bash
npm run test:e2e            # headless, all specs
npm run test:e2e -- auth    # a single spec by name
npm run test:e2e:ui         # interactive UI mode (watch, time-travel)
npm run test:e2e:report     # open the last HTML report
```

## How it's wired

- **playwright.config.ts** — serial (`workers: 1`) because every spec shares one
  database, mirroring the integration suite. Default identity is the admin
  (`storageState: e2e/.auth/admin.json`); specs override per `describe` for the
  recruiter or an anonymous visitor.
- **global-setup.ts** — logs in as admin + recruiter through the real form and
  saves each session to `e2e/.auth/*.json` so specs start authenticated.
- **helpers.ts** — credentials, storage-state paths, a `login()` helper, and
  `uniqueSuffix()` for collision-free created records.
- **db.ts** — read-only raw-`pg` access used ONLY to *pick fixtures* (e.g. an
  OPEN vendor requirement), never to assert. All assertions go through the UI.

## What's covered

| Spec | Journey |
| --- | --- |
| `auth` | gate redirect, invalid creds, login, logout |
| `navigation` | every primary route renders its heading |
| `rbac` | recruiter fenced from audit/export/bulk; admin gets them |
| `submissions-bulk` | select → bulk Hold (real write) + confirm gate |
| `candidate-create` | new-candidate form → server action → DB → detail |
| `vendor-portal` | three-tier Job → VPR → submission navigation |
| `saved-views` | save/persist/re-apply a filter view (localStorage) |
| `keyboard-shortcuts` | `/`, `?`, `g j`, typing-suppression |
| `password-policy` | live checklist + server rejection of a weak password |
| `lists` | server-side sort (survives pagination), pagination, filter |
| `bulk-adversarial` | multi-select across MIXED states — bulk Hold then Reject move only eligible rows, terminals untouched, honest counts (asserted vs DB) |
| `enforcement` | server *enforces* auth: recruiter `POST /api/export/full` →403, admin →200, `GET /api/cron/backup` →401 without the secret |
| `cascade` | JOINED → placement ACTIVE + candidate PLACED; revert → placement TERMINATED + candidate AVAILABLE (asserted vs DB) |

## Notes

- **Creation/mutation specs** mint uniquely-named records and use `exact`
  locators so they never collide with seed data or each other, and stay green
  across reruns. `submissions-bulk` mutates a row to On Hold — reseed for a
  pristine dataset if needed.
- The suite runs against the **Neon dev/test DB** the app is configured for (the
  app is bound to the Neon adapter). Reseed (`npx tsx prisma/seed-demo.ts`) to
  restore a known state after a run.
