# The Worker as a port of backend/ (FastAPI + MongoDB)

The Worker is a line-by-line port of `backend/app/`, which stays the reference for *why* things work as they do.
**Compatibility rule:** every route keeps the same requests and returns the same JSON (same keys, values, status
codes and `detail` strings), because Apple/Google Wallet passes and the rollback React app call it. Loyalty data
(members, stamps, tiers, wallet tokens) must behave exactly as before, and the D1 documents keep the Mongo shapes.

## Where things are

| Python | TypeScript |
|---|---|
| `app/routers/x.py` | `src/routers/x.ts`, exporting `register(api: Router)` |
| `app/services/x.py` | `src/services/x.ts` |
| `app/wallet/x.py` | `src/wallet/x.ts` |
| `app/game/runner.py` | `src/game/runner.ts` (must match `site/jatek/runnerSim.js`) |
| `app/config.py` | `src/config.ts` (`settings(env)`) |
| `app/security.py` | `src/security.ts` |
| `app/db.py` | `src/db.ts` (Mongo-shaped collections on D1), `schema.sql` |

Names are the Python ones in camelCase (`find_by_scan` → `findByScan`); module constants keep their names.
After Hours, Delivery, Stripe and Számlázz.hu (`services/bookings.ts` and friends) were written for the Worker; they
answer errors as `{"error": code}` and use raw D1 tables (`migrations/`).

## Conventions

- **Context:** services take `app: App` (`env`, `db`, `later`) first; route handlers get `c: Ctx`, which is an `App`.
- **Database:** `app.db.<collection>` has `find(filter, {projection, sort, limit})`, `findOne`, `countDocuments`,
  `insertOne`, `updateOne(filter, {$set,$unset,$inc}, {upsert})`, `updateMany`, `replaceOne`, `deleteOne`,
  `deleteMany`. Filters: equality, `$ne`, `$exists`, `$gt/$gte/$lt/$lte`, `$in/$nin`, `$or`, `$and`, dotted fields.
  Aggregations are SQL with `json_extract(doc, '$.field')` on `app.db.d1` (see `Collection.where`).
- **Dates:** every stored timestamp comes from `nowIso()` / `isoAt(date)` (`src/util.ts`), the string Python wrote,
  and comparisons use the same strings. Never store a `Date` or `toISOString()` directly.
- **Errors and validation:** `throw new HttpError(status, detail)`. Bodies are validated with the helpers in
  `src/http.ts` (`Invalid`, `email`, `str`, `int`, `oneOf`...), mirroring the Pydantic models, so bad input still
  answers 422 in FastAPI's shape.
- **Auth:** `getCurrentUser(c)`, `requireAdmin(c)`, `getCurrentCustomer(c)` (`src/security.ts`).
- **Background work:** `app.later(promise)`. **Client IP:** `CF-Connecting-IP`.
- **Checking:** `npx tsc --noEmit`, and the local server (`wrangler dev --env preview`) against the local D1. No test
  files in the repo.
