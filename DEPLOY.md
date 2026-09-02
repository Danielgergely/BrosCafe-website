# Deploying Bros Cafe

Two environments, one codebase, deployed by pushing to a branch.

| Branch  | Environment | URL                        | Database         |
| ------- | ----------- | -------------------------- | ---------------- |
| `stage` | staging     | `https://stage.broscafe.hu`| `broscafe_stage` |
| `main`  | production  | `https://broscafe.hu`      | `broscafe_prod`  |

Work on a feature branch → merge to `stage` → check it → merge `stage` into
`main`. Nothing reaches customers without passing through staging first.

---

## The one rule that cannot be broken

**`FRONTEND_URL` is permanent per environment.**

Every Apple Wallet pass has `<FRONTEND_URL>/api/wallet` written inside it, and
Apple's servers call back on exactly that host. Change it after you've issued
passes and every pass already on a customer's phone silently stops updating.

Two consequences:

- Decide production's URL once. `https://broscafe.hu` — no `www`, no trailing slash.
- **Never issue real passes from staging.** Keep `APPLE_PASS_CONFIGURED=false`
  on stage.

This is also why the site and API share one origin: nginx serves the site and
proxies `/api` to the backend in the same container network. Splitting them
across two hostnames breaks Wallet.

---

## Deploying with Coolify (the recommended path)

Use `docker-compose.coolify.yml`, not `docker-compose.yml`. The only difference
is that it publishes no ports: Coolify's proxy joins the stack's network and
reaches `web` on port 80 directly, so published ports are redundant and a way
to accidentally expose the API or database.

| Setting                 | Staging                       | Production            |
| ----------------------- | ----------------------------- | --------------------- |
| Branch                  | `stage`                       | `main`                |
| Build pack              | Docker Compose                | Docker Compose        |
| Compose file            | `docker-compose.coolify.yml`  | same                  |
| Domain (on `web`)       | `https://stage.broscafe.hu`   | `https://broscafe.hu` |
| `DB_NAME`               | `broscafe_stage`              | `broscafe_prod`       |
| `FRONTEND_URL`          | `https://stage.broscafe.hu`   | `https://broscafe.hu` |
| `JWT_SECRET`            | one value                     | a *different* value   |
| `APPLE_PASS_CONFIGURED` | `false` — always              | `true` once verified  |

`FRONTEND_URL` must exactly match the domain assigned to `web`. Set secrets in
Coolify's Environment Variables tab, never in the compose file. Put Basic
Authentication on the staging application (Advanced → Basic Authentication).

Apple Wallet keys go in `/srv/broscafe/certs` on the server — the compose file
mounts that read-only. Create it before setting `APPLE_PASS_CONFIGURED=true`.

The full click-through, including VPS ordering and server hardening, is in the
server-setup document.

---

## First deploy without Coolify (plain Docker on a VPS)


Assumes a Linux server with Docker, and DNS for broscafe.hu under your control.

### 1. Point DNS at the server

```
A    broscafe.hu          → <server IP>
A    stage.broscafe.hu    → <server IP>
```

### 2. Get the code onto the server

```bash
ssh you@server
sudo mkdir -p /srv/broscafe && sudo chown $USER /srv/broscafe
cd /srv/broscafe
git clone https://github.com/gbeng2005-crypto/BrosCafe-website.git prod
git clone https://github.com/gbeng2005-crypto/BrosCafe-website.git stage
cd stage && git checkout stage && cd ..
```

### 3. Configure both environments

```bash
cp prod/.env.deploy.example prod/.env.prod
cp prod/.env.deploy.example stage/.env.stage
openssl rand -hex 32     # a different secret for each
```

Edit each. The values that must differ:

| Variable          | prod                    | stage                        |
| ----------------- | ----------------------- | ---------------------------- |
| `DB_NAME`         | `broscafe_prod`         | `broscafe_stage`             |
| `HOST_PORT`       | `8080`                  | `8081`                       |
| `FRONTEND_URL`    | `https://broscafe.hu`   | `https://stage.broscafe.hu`  |
| `JWT_SECRET`      | one secret              | a *different* secret         |
| `APPLE_PASS_CONFIGURED` | `true` (once certs verify) | `false` — always      |

### 4. Bring them up

```bash
cd /srv/broscafe/prod
docker compose --env-file .env.prod  -p broscafe-prod  up -d --build

cd /srv/broscafe/stage
docker compose --env-file .env.stage -p broscafe-stage up -d --build
```

Each stack binds nginx to `127.0.0.1` only — 8080 and 8081. Nothing is
reachable from the internet until you put a TLS-terminating proxy in front.

### 5. Terminate TLS

Whatever your platform provides (Coolify, Caddy, nginx, Traefik), route:

```
https://broscafe.hu        → 127.0.0.1:8080
https://stage.broscafe.hu  → 127.0.0.1:8081
```

The proxy must forward `X-Forwarded-Proto` and `X-Forwarded-For`; the
containers already trust and use them.

Put HTTP Basic auth in front of `stage.broscafe.hu` — it should not be
indexed or found by customers.

### 6. Verify

```bash
curl -s https://broscafe.hu/api/            # {"message":"Bros Cafe API"}
curl -s https://broscafe.hu/api/products | jq length     # 18
curl -s https://broscafe.hu/api/cafe | jq .apple_wallet_configured
```

---

## Deploying a change

```bash
cd /srv/broscafe/stage
git pull
docker compose --env-file .env.stage -p broscafe-stage up -d --build
```

…check `stage.broscafe.hu`, then the same in `prod` with `.env.prod`.

With a platform like Coolify this is automatic: connect the repo, map `main`
to production and `stage` to staging, and a push triggers the rebuild.

### Zero downtime

`up -d --build` rebuilds before swapping containers, so the outage is the few
seconds a container takes to restart. Fine for a café. If you want none, run
two backend replicas behind the proxy.

---

## Changing content: images, prices, product copy

Product and journal content lives in MongoDB, seeded from two files:

```
backend/data/catalog.json      products: names, descriptions, prices, images
backend/data/whats_new.json    the On tap & in rotation posts
```

`SEED_ON_STARTUP=true` (the default) re-seeds from those files on every boot,
so **editing them and deploying is all it takes** — no database surgery. The
seeder upserts by `id` and archives anything no longer listed, so it is safe
to run repeatedly and never deletes a member's history.

```bash
# swap a product photo
vim backend/data/catalog.json     # edit images[0]
git commit -am "New espresso photo" && git push
# deploy → the new photo is live
```

Prices are integers in **forint**. There is no separate EUR field; the euro
figure shown next to some prices is calculated from HUF.

**When you start editing products through `/admin` instead, set
`SEED_ON_STARTUP=false`** — otherwise the next deploy overwrites those edits
with whatever is in the JSON files. Pick one source of truth, not both.

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
| Stop an environment       | `docker compose --env-file .env.prod -p broscafe-prod down`               |
| Wipe stage and start over | `docker compose --env-file .env.stage -p broscafe-stage down -v`          |

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
