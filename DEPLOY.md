# Deploying Bros Cafe

One environment: production, deployed by pushing to `main`.

| Branch | URL                   | Database        |
| ------ | --------------------- | --------------- |
| `main` | `https://broscafe.hu` | `broscafe_prod` |

There is no staging site, so **a push to `main` goes straight to customers.**
Check a change locally first (`yarn start` against a local API — see
CLAUDE.md), then push.

---

## The one rule that cannot be broken

**`FRONTEND_URL` is permanent.**

Every Apple Wallet pass has `<FRONTEND_URL>/api/wallet` written inside it, and
Apple's servers call back on exactly that host. Change it after you've issued
passes and every pass already on a customer's phone silently stops updating.
It is `https://broscafe.hu` — no `www`, no trailing slash.

This is also why the site and API share one origin: nginx serves the site and
proxies `/api` to the backend in the same container network. Splitting them
across two hostnames breaks Wallet.

If a staging site is ever added, it gets its own database, its own
`JWT_SECRET`, and `APPLE_PASS_CONFIGURED=false` — real passes are only ever
issued from production.

---

## Deploying with Coolify (the recommended path)

Use `docker-compose.coolify.yml`, not `docker-compose.yml`. The only difference
is that it publishes no ports: Coolify's proxy joins the stack's network and
reaches `web` on port 80 directly, so published ports are redundant and a way
to accidentally expose the API or database.

| Setting                 | Value                        |
| ----------------------- | ---------------------------- |
| Repository              | `Danielgergely/BrosCafe-website` |
| Branch                  | `main`                       |
| Build pack              | Docker Compose               |
| Compose file            | `docker-compose.coolify.yml` |
| Domain (on `web`)       | `https://broscafe.hu`        |
| `DB_NAME`               | `broscafe_prod`              |
| `FRONTEND_URL`          | `https://broscafe.hu`        |
| `JWT_SECRET`            | `openssl rand -hex 32`       |
| `APPLE_PASS_CONFIGURED` | `true` once the certs verify |

`FRONTEND_URL` must exactly match the domain assigned to `web`. Set secrets in
Coolify's Environment Variables tab, never in the compose file.

Apple Wallet keys go in `/srv/broscafe/certs` on the server — the compose file
mounts that read-only. Create it before setting `APPLE_PASS_CONFIGURED=true`.

The full click-through, including VPS ordering and server hardening, is in the
server-setup document.

---

## First deploy without Coolify (plain Docker on a VPS)

Assumes a Linux server with Docker, and DNS for broscafe.hu under your control.

### 1. Point DNS at the server

```
A    broscafe.hu    → <server IP>
```

### 2. Get the code onto the server

```bash
ssh you@server
sudo mkdir -p /srv/broscafe && sudo chown $USER /srv/broscafe
cd /srv/broscafe
git clone https://github.com/Danielgergely/BrosCafe-website.git prod
```

### 3. Configure

```bash
cp prod/.env.deploy.example prod/.env.prod
openssl rand -hex 32     # for JWT_SECRET
```

Edit `.env.prod`:

| Variable                | Value                          |
| ----------------------- | ------------------------------ |
| `DB_NAME`               | `broscafe_prod`                |
| `HOST_PORT`             | `8080`                         |
| `FRONTEND_URL`          | `https://broscafe.hu`          |
| `JWT_SECRET`            | the secret from above          |
| `APPLE_PASS_CONFIGURED` | `true` once the certs verify   |

### 4. Bring it up

```bash
cd /srv/broscafe/prod
docker compose --env-file .env.prod -p broscafe-prod up -d --build
```

The stack binds nginx to `127.0.0.1:8080` only. Nothing is reachable from the
internet until you put a TLS-terminating proxy in front.

### 5. Terminate TLS

Whatever your platform provides (Coolify, Caddy, nginx, Traefik), route:

```
https://broscafe.hu  → 127.0.0.1:8080
```

The proxy must forward `X-Forwarded-Proto` and `X-Forwarded-For`; the
containers already trust and use them.

### 6. Verify

```bash
curl -s https://broscafe.hu/api/            # {"message":"Bros Cafe API"}
curl -s https://broscafe.hu/api/products | jq length     # active products on the menu
curl -s https://broscafe.hu/api/cafe | jq .apple_wallet_configured
```

---

## Deploying a change

With Coolify this is automatic: a push to `main` triggers the rebuild.

Without it:

```bash
cd /srv/broscafe/prod
git pull
docker compose --env-file .env.prod -p broscafe-prod up -d --build
```

Then open broscafe.hu on a phone and check what you changed. To undo a bad
deploy, `git revert` the commit and push — the rebuild puts the previous
version back. Database changes (seeded content, prices) are not undone by a
revert; re-run the seeder after it.

### Zero downtime

`up -d --build` rebuilds before swapping containers, so the outage is the few
seconds a container takes to restart. Fine for a café. If you want none, run
two backend replicas behind the proxy.

---

## Live sales widget

The backend can poll Fruitsys for today's takings and serve them to an iPhone
widget (`widget/bros-live-sales.js`, run by the free Scriptable app). It is off
until three environment variables are set in Coolify:

| Variable            | Value                                                    |
| ------------------- | -------------------------------------------------------- |
| `FRUITSYS_USER`     | `broscafe.readonly` — never the main back-office login   |
| `FRUITSYS_PASSWORD` | that user's password                                     |
| `LIVE_SALES_KEY`    | `openssl rand -hex 24` — the same value goes in the widget |

Every 15 minutes, Monday to Saturday 06:00–20:00, the API logs in to Fruitsys
and fetches today's hourly takings: a few kilobytes and under a second. The
first run also stores every earlier day once, for the comparison.
`GET /api/live-sales` with `Authorization: Bearer <LIVE_SALES_KEY>` returns the
latest summary; any other request gets a 404. Check it's running with:

```bash
docker compose -p broscafe-prod logs backend | grep "live sales"
```

Figures are gross (VAT included), as on the till. The comparison is against
earlier weeks' same weekday up to the same minute.

The widget's "glass" fills towards the day's break-even. Set it as the margin
analysis states it — net, VAT excluded — and the server scales it to gross:

| Variable            | Default | Meaning                                                    |
| ------------------- | ------- | ---------------------------------------------------------- |
| `BREAK_EVEN_NET_FT` | `61000` | break-even per open day, net (the analysis's "Fedezeti pont") |
| `GROSS_PER_NET`     | `1.072` | the café's gross/net ratio (Fruitsys, opening to mid-October) |

`0` for the break-even hides the glass, the "still missing" line and the ETA.

---

## Changing content: images, prices, product copy

Product and journal content lives in MongoDB, seeded from two files:

```
backend/data/catalog.json      products: names, descriptions, prices, images
backend/data/whats_new.json    the On tap & in rotation posts
```

`SEED_ON_STARTUP=true` (the compose default) re-seeds from those files on every
boot, so **editing them and deploying is all it takes** — no database surgery.
The seeder upserts by `id` and archives anything no longer listed, so it is
safe to run repeatedly and never deletes a member's history.

```bash
# swap a product photo
vim backend/data/catalog.json     # edit images[0]
git commit -am "New espresso photo" && git push
# deploy → the new photo is live
```

Prices are integers in **forint**. There is no separate EUR field; the euro
figure shown next to some prices is calculated from HUF.

### Editing through `/admin` as well

The dashboard and the JSON files can both own content, item by item. Anything
saved, added or archived in `/admin` is marked as edited, and from then on the
seeder leaves it alone: a deploy never reverts a price fixed in the browser,
and a product added in the dashboard is not archived for missing from
`catalog.json`. Everything else keeps following the files.

The flip side: once an item has been edited in `/admin`, changing it in the
JSON file does nothing until you hand it back. Either

- press **Revert to the file version** on that item in the dashboard, which restores the file
  version and returns it to the seeder, or
- re-seed with `--force`, which does that for every item at once and discards
  all dashboard edits:

  ```bash
  docker compose -p broscafe-prod exec backend python -m app.seed --force
  ```

When only the **prices** in `catalog.json` should win — say the till's price
list changed — use `--prices`. It sets every product's price from the file,
edited or not, and leaves photos, copy and the edited mark alone:

```bash
docker compose -p broscafe-prod exec backend python -m app.seed --prices
```

It prints each price it changed; running it again changes nothing.

Each seed run logs how many items it left alone as edited in `/admin`.
`SEED_ON_STARTUP=false` is only needed if you want deploys to stop touching
content entirely.

---

## Sizing

Measured, not estimated — the whole stack with the Mongo cache capped:

| Container | Memory |
| --------- | ------ |
| MongoDB   | ~89 MiB |
| API       | ~51 MiB |
| nginx     | ~10 MiB |
| **Total per environment** | **~150 MiB** |

The heaviest thing on the server is the frontend build, which peaks at
**~1.5 GiB**. Coolify itself uses 750 MB–1.2 GB.

- **4 GB is enough for production alone** (~500 MB–1.1 GB spare at peak).
- **8 GB if you ever add a staging site on the same box**, or if you'd rather not
  think about it.

On a 4 GB server, add swap so a build spike can never OOM-kill anything:

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

`MONGO_CACHE_GB` (default `0.5`) caps MongoDB's cache. Without it Mongo claims
half of (RAM − 1 GB) and competes with the build. Raise it if the member list
reaches the tens of thousands.

---

## MongoDB and AVX

MongoDB 5.0+ requires a CPU exposing the AVX instruction set. Some VPS hosts run
KVM with the generic `qemu64` CPU model, which masks AVX (and SSE4.2) even when
the physical host supports them. Mongo 5+ then crash-loops on boot with:

```
WARNING: MongoDB 5.0+ requires a CPU with AVX support,
and your current system does not appear to have that!
```

Check with:

```bash
grep -w avx /proc/cpuinfo || echo "no AVX"
lscpu | grep "Model name"     # "QEMU Virtual CPU version 2.5+" means masked
```

If AVX is missing, ask the provider to switch the VM's CPU model to
`host-passthrough` (or a modern named model). It costs nothing and also
restores SSE4.2 and AES-NI, which matter for TLS throughput.

Until then, pin the last version that works:

```
MONGO_IMAGE=mongo:4.4
```

Verified: the full API suite passes on 4.4. It is end-of-life though, so treat
it as temporary. When AVX becomes available, upgrade by dumping and restoring
rather than in place — 4.4 to 7 needs stepwise binary upgrades, and the dataset
is small enough that dump/restore is simpler:

```bash
docker compose -p broscafe-prod exec mongo mongodump --archive --gzip --db=broscafe_prod > pre-upgrade.gz
# set MONGO_IMAGE=mongo:7, redeploy, then:
docker compose -p broscafe-prod exec -T mongo mongorestore --archive --gzip --drop < pre-upgrade.gz
```

---

## Backups

The database is the loyalty programme. Nightly, off the server:

```bash
docker exec broscafe-prod-mongo-1 \
  mongodump --archive --db=broscafe_prod --gzip \
  > /srv/broscafe/backups/broscafe-$(date +%F).gz
```

Copy those off the machine — a backup on the same disk is not a backup.
Restore:

```bash
docker exec -i broscafe-prod-mongo-1 \
  mongorestore --archive --gzip --drop < broscafe-2026-09-02.gz
```

---

## Reference

| Task                      | Command                                                                  |
| ------------------------- | ------------------------------------------------------------------------ |
| Logs                      | `docker compose -p broscafe-prod logs -f backend`                        |
| Restart the API only      | `docker compose --env-file .env.prod -p broscafe-prod restart backend`   |
| Re-seed content by hand   | `docker compose -p broscafe-prod exec backend python -m app.seed`         |
| Mongo shell               | `docker compose -p broscafe-prod exec mongo mongosh broscafe_prod`        |
| Stop the site             | `docker compose --env-file .env.prod -p broscafe-prod down`               |

`down -v` deletes the database volume. Never run it against prod.

---

## Still outstanding before customers use this

1. **Transactional email.** Magic-link sign-in needs a provider (Resend,
   Postmark, Mailgun) plus SPF, DKIM and DMARC on broscafe.hu. Without it
   nobody can sign in — the links only appear in the container log.
2. **Rotate the admin password.** It is in plaintext in five old commit
   messages in this repository's history.
3. **Real photography.** Every product image is stock.
4. **Confirm prices.** The HUF figures were converted from placeholder euros.
