# Gate Pass

Factory gate pass and man-day tracking system for a Thai industrial site. Contractors register workers on arrival; an admin dashboard tracks man-days per company and accident history. The UI is in Thai.

## Stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Database | PostgreSQL (Neon) via Prisma |
| Auth | bcrypt password hash + HTTP-only JWT cookie (`jose`) |
| Styling | Inline styles (design tokens in `components/atoms.tsx`) |
| Export | `xlsx` (client-side) |
| EPRO sync | Playwright RPA on a Windows host (`automation/`) |

## Getting started

Requires Node.js 20+ and a PostgreSQL database. Point `DATABASE_URL` at the Neon
`dev` branch — see `.env.local.example`.

```bash
npm install
cp .env.local.example .env.local      # then edit DATABASE_URL + JWT_SECRET
npx prisma migrate deploy             # apply migrations
npx prisma db seed                    # admin account + 8 initial companies
npm run dev                           # http://localhost:4009
```

> ⚠️ **Use `prisma migrate deploy`, never `prisma migrate dev`.** The Neon `dev`
> branch has rows in `_prisma_migrations` with `finished_at = NULL`, which makes
> `migrate dev` demand a database reset — that wipes the data. `migrate deploy`
> ignores those rows and is the same command Vercel runs. To author a new
> migration, use `prisma migrate diff` (read-only) and write the migration folder
> by hand.

> ⚠️ **Confirm which host `.env.local` actually points at before running anything
> that writes.** On 2026-08-13 it pointed at production while the docs said `dev`.
> ```bash
> node -e "const l=require('fs').readFileSync('.env.local','utf8').split(/\r?\n/).find(x=>x.startsWith('DATABASE_URL='));console.log(new URL(l.slice(l.indexOf('=')+1).replace(/^\"|\"$/g,'')).hostname)"
> ```

Default admin login — credential `admin`. The password comes from
`SEED_ADMIN_PASSWORD`; it falls back to `admin123` for local development only, so
production must set it explicitly. The seed creates no demo records — records come
from real form submissions.

> Run `npm install` separately on each OS you develop on (WSL2 / Windows). The
> Next.js SWC and Prisma engine binaries are platform-specific, so a single
> `node_modules` cannot be shared across the WSL2/Windows boundary.

## Scripts

```bash
npm run dev          # dev server on port 4009
npm run build        # production build
npm run start        # serve the production build on port 4009
npm run lint         # eslint
npm run check:docs   # verify the docs still match the code
npx prisma studio    # browse the database
npx tsc --noEmit     # type-check
```

## Project layout

```
app/             App Router pages + API routes (auth, records, vehicle-requests, users, integration)
components/      atoms.tsx (design tokens) + LoginScreen / ContractorFlow / VehicleFlow / AdminFlow
lib/             db.ts (Prisma client), auth.ts (JWT session), constants.ts, sync.ts, vehicle.ts
prisma/          schema.prisma, migrations, seed.ts
middleware.ts    protects /contractor and /admin routes by role
automation/      Playwright RPA that fills the EPRO forms + the scheduled-task runner
scripts/         check-docs.mjs, check-rpa-env.mjs (verification tools, run by hand)
docs/            architecture, sync state machine, error reference, runbook
UI/              original design prototypes (visual spec — not production code)
```

## Auth model

No self-registration. The admin creates contractor accounts from the dashboard.
Login validates a bcrypt hash and sets a 7-day `gp_token` HTTP-only JWT cookie;
`middleware.ts` redirects unauthenticated users to `/login` and blocks the wrong role.

## Deployment

Vercel (auto-deploy from GitHub `main`) + Neon PostgreSQL. Pushing to `main`
deploys; there is nothing to run by hand.

`vercel.json` sets the build command to
`npx prisma generate && npx prisma migrate deploy && next build`, so **migrations
are applied automatically on every deploy**.

Environment variables are set in the Vercel dashboard — see
`.env.production.example` for the checklist: `DATABASE_URL` (Neon **pooled**
connection), `JWT_SECRET`, `INTEGRATION_API_KEY`.

Seed the first admin once, from a dev machine pointed at the production database:

```bash
DATABASE_URL=<Neon direct> SEED_ADMIN_PASSWORD=<real password> npx prisma db seed
```

> ⚠️ That build command runs on **preview** builds too, not just production. If
> `DATABASE_URL` is the same across all Vercel environments, pushing a feature
> branch applies its migrations straight to production before the PR is merged.
> Set the **Preview** scope's `DATABASE_URL` to the Neon `dev` branch.

Never commit `.env.production` — it holds the JWT secret.

### EPRO sync host

The Playwright RPA runs on a separate Windows machine inside the plant network,
driven by Task Scheduler. See [`automation/README.md`](./automation/README.md) for
setup and [`docs/runbook-vehicle-sync.md`](./docs/runbook-vehicle-sync.md) for
troubleshooting.

**Legacy:** `Dockerfile`, `docker-compose.yml`, `Caddyfile`, and `deploy.ps1` are
from an earlier self-hosted plan (Docker + SQLite) and no longer work. They are
kept for reference only — see `CLAUDE.md`.
