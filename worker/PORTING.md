# Porting backend/ (FastAPI + MongoDB) to this Worker

The Python code in `backend/app/` is the specification. Port it **line by line**; do not redesign, simplify or
"improve" behaviour. Every route must accept the same requests and return the same JSON (same keys, same
values, same status codes, same `detail` strings), because the unchanged React app and Apple/Google Wallet talk to
it. Loyalty data (members, stamps, tiers, wallet tokens) must behave exactly as before.

## Layout

| Python | TypeScript |
|---|---|
| `app/routers/x.py` | `src/routers/x.ts`, exporting `register(api: Router)` |
| `app/services/x.py` | `src/services/x.ts` |
| `app/wallet/x.py` | `src/wallet/x.ts` |
| `app/game/runner.py` | `src/game/runner.ts` |
| `app/config.py` | `src/config.ts` (`settings(env)`) |
| `app/security.py` | `src/security.ts` |
| `app/db.py` | `src/db.ts` (Mongo-shaped collections on D1), `schema.sql` |

## Rules

- **Names:** Python names in camelCase (`find_by_scan` → `findByScan`, `public` → `publicView` where the name is a
  reserved word). Module-level constants keep their names.
- **Context:** functions that need the database or environment take `app: App` (from `src/http.ts`: `env`, `db`,
  `later`) as their first argument. Route handlers get `c: Ctx`, which is an `App`. Settings: `settings(app.env)`.
- **Database:** `app.db.<collection>` has `find`, `findOne`, `countDocuments`, `insertOne`, `insertMany`,
  `updateOne(filter, {$set,$unset,$inc}, {upsert})`, `updateMany`, `replaceOne`, `deleteOne`, `deleteMany`.
  `find(filter, {projection, sort, skip, limit})` replaces `.find(...).sort(...).to_list(n)` (`to_list(n)` →
  `limit: n`). Supported filter operators: equality, `$ne`, `$exists`, `$gt/$gte/$lt/$lte`, `$in/$nin`, `$or`,
  `$and`, dotted fields. For `aggregate` write SQL with `json_extract(doc, '$.field')` on `app.db.d1` (see
  `Collection.where`). Documents never carry `_id`.
- **Dates:** the Python code stores timestamps as `datetime.now(timezone.utc).isoformat()` strings, and some
  fields as BSON datetimes. Here every stored timestamp is a string from `nowIso()` / `isoAt(date)` (`src/util.ts`),
  and comparisons use the same strings (`since = isoAt(new Date(Date.now() - 3600_000))`). Never store a `Date`
  object or `toISOString()` directly. When the Python code returned a BSON datetime in JSON (FastAPI renders it as
  `"2026-09-24T07:31:02.123000"`, no offset), keep the stored string as is; note it in your report.
- **Errors:** `raise HTTPException(status, detail)` → `throw new HttpError(status, detail)`. Request bodies are
  validated with the helpers in `src/http.ts` (`Invalid`, `email`, `str`, `int`, `bool`, `oneOf`, `strList`...),
  mirroring the Pydantic model in `app/models.py` field by field, so invalid input still answers 422.
- **Auth dependencies:** `Depends(get_current_user)` → `await getCurrentUser(c)`, `require_admin` →
  `requireAdmin(c)`, `get_current_customer` → `getCurrentCustomer(c)` (`src/security.ts`).
- **Background work:** `BackgroundTasks` / `asyncio.create_task` → `app.later(promise)`.
- **Client IP:** `request.client.host` / `X-Forwarded-For` → `c.req.headers.get('CF-Connecting-IP')`.
- **Responses:** return a plain object for JSON; return a `Response` for files, images, empty bodies and custom
  status codes (e.g. `new Response(null, {status: 201})`).
- **No new dependencies** without saying why in your report (already there: `bcryptjs`). Pure-JS libraries that
  run on Workers are fine when the Python used a library for the same job (zip, PKCS#7).
- **No test files in the repo.** Check your work with `npm run check` (TypeScript) and, where useful, scratch
  scripts outside the repo or `npm run dev` with the local database (`npm run db:local` creates it).
- **Shared files** (`src/db.ts`, `src/http.ts`, `src/security.ts`, `src/config.ts`, `src/env.ts`, `src/util.ts`,
  `src/index.ts`, `src/routes.ts`, `schema.sql`, `wrangler.jsonc`): do not edit them; say in your report what you
  need changed and why.
