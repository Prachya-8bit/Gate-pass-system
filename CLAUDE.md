# SYS Gate Pass — Project Context

## What this is

Factory gate pass and man-day tracking system for a Thai industrial site. Contractors register workers when they arrive; an admin dashboard tracks man-days per company and accident history.

UI language: **Thai**. All copy, labels, and error messages stay in Thai.

---

## Current state

`project/` contains a **fully working HTML/JSX prototype** exported from Claude Design. It runs in-browser with React via CDN + Babel. Data lives in `localStorage`. Auth is fake (any credentials pass).

Do **not** treat these as production source files — they are the design spec. Match their visual output pixel-for-pixel when implementing.

Key prototype files:
- `project/Gate Pass App.html` — app shell and entry point
- `project/gp-atoms.jsx` — design tokens (`gDS`), shared components, localStorage utilities
- `project/gp-auth.jsx` — login screen
- `project/gp-form.jsx` — 3-step contractor registration form
- `project/gp-admin.jsx` — admin dashboard with KPIs, company breakdown, records table, export

---

## Target stack (next phase)

| Layer | Choice |
|-------|--------|
| Framework | Next.js 14+ (App Router) |
| Language | TypeScript |
| Database | SQLite via Prisma |
| Auth | Custom: bcrypt password hash + HTTP-only JWT cookie |
| Styling | Inline styles (migrated from prototype — do not convert to Tailwind) |
| Export | `xlsx` npm package (client-side) |

---

## Planned folder structure

```
app/
  page.tsx                   → redirect to /login
  login/page.tsx             → LoginScreen
  contractor/page.tsx        → ContractorFlow
  admin/page.tsx             → AdminFlow
  api/
    auth/login/route.ts      → POST — validate creds, set JWT cookie
    auth/logout/route.ts     → POST — clear cookie
    records/route.ts         → GET (admin, ?company= filter) / POST (contractor batch)
    records/[id]/route.ts    → PATCH — toggle accident flag
    users/route.ts           → POST — admin creates contractor account
components/
  atoms.tsx                  → migrated gDS tokens + all shared components
  LoginScreen.tsx
  ContractorFlow.tsx
  AdminFlow.tsx
lib/
  db.ts                      → Prisma client singleton
  auth.ts                    → getSession(), signToken(), verifyToken()
  constants.ts               → COMPANIES list, calcMD()
prisma/
  schema.prisma
  seed.ts                    → 7 demo records + default admin user
middleware.ts                → protect /contractor and /admin routes by role
```

---

## Database schema

See `prisma/schema.prisma`. Two models:

**User** — `id`, `credential` (phone or email, unique), `password` (bcrypt), `role` (contractor | admin), `createdAt`

**Record** — `id`, `name`, `idCard`, `company`, `job?`, `zone?`, `startDate`, `endDate`, `manDays`, `accident` (bool, default false), `createdAt`, `createdBy` (→ User.id)

---

## Auth flow

- Login: `POST /api/auth/login` → verify bcrypt → set `gp_token` HTTP-only cookie (JWT, 7d)
- `lib/auth.ts` exports `getSession(request)` — reads cookie, verifies JWT, returns `{id, credential, role}` or `null`
- `middleware.ts` — unauthenticated → redirect `/login`; wrong role → 403
- No self-registration. Admin creates contractor accounts via the dashboard.

---

## Design system (from gp-atoms.jsx)

```ts
const gDS = {
  primary: '#0a1628', accent: '#e8a020', bg: '#f0f4f8',
  text: '#1a2332', muted: '#64748b', ok: '#16a34a', okBg: '#f0fdf4',
  err: '#dc2626', errBg: '#fef2f2', border: '#e2e8f0',
  font: "'Prompt', 'Noto Sans Thai', sans-serif",
  r: { s: 6, m: 10, l: 16 },
  sh: '0 2px 8px rgba(0,0,0,0.08)',
};
```

Components to migrate (keep props identical to prototype): `Logo`, `TopBar`, `Btn` (variants: primary/accent/secondary/ghost/ok/danger), `InpBox`, `SelBox`, `DatePick`, `GCard`, `Badge` (colors: green/red/blue/gray/amber), `StepBar`.

Shell widths: contractor = `max-width: 520px`, admin = `max-width: 880px`.

---

## Key business logic

- **Man-day calc**: `Math.max(1, Math.ceil((endDate - startDate) / 86400000) + 1)` — inclusive of both endpoints
- **Batch submit**: one form submission creates N records (one per person), all sharing the same job details
- **Accident flag**: starts `false`; admin can toggle it per record after the fact
- **ID card**: exactly 13 digits, digits only, no hyphens

---

## Commands

```bash
# First-time setup
npm install
npx prisma migrate dev --name init
npx prisma db seed

# Dev
npm run dev

# DB studio
npx prisma studio

# Type-check
npx tsc --noEmit
```

---

## Seed data

Default admin: credential `admin`, password `admin123` (bcrypt hashed in seed).
Seven demo contractor records matching the prototype's `seedData()` function in `gp-atoms.jsx`.

---

## Production deployment

**Stack:** Docker (Linux containers on Windows Server) + Caddy reverse proxy + Let's Encrypt HTTPS

Key files:
- `Dockerfile` — multi-stage Next.js build (node:20-alpine)
- `docker-compose.yml` — `app` (Next.js) + `proxy` (Caddy) + `db-data` volume
- `Caddyfile` — set `your-domain.com` before first deploy; Caddy auto-fetches TLS cert
- `.env.production.example` — copy to `.env.production`, fill `JWT_SECRET` and `DATABASE_URL`
- `deploy.ps1` — run on Windows Server to pull, build, migrate, and restart

**Deploy flow:**
```powershell
# First time
cp .env.production.example .env.production   # edit JWT_SECRET
mkdir data                                    # SQLite volume bind mount
.\deploy.ps1

# Subsequent deploys
.\deploy.ps1
```

**Pre-launch checklist:**
1. Replace `your-domain.com` in `Caddyfile` with real domain
2. Point domain A record → server's public IP
3. Open TCP 80 + 443 in Windows Defender Firewall and any upstream firewall
4. Generate a 64-char `JWT_SECRET` (`node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`)
5. Back up `./data/gatepass.db` on a schedule (e.g. Windows Task Scheduler → robocopy)

---

## Do not

- Do not copy the prototype's internal structure — match visual output only
- Do not use `localStorage` or `sessionStorage` in production code
- Do not add Tailwind — keep inline styles migrated from `gDS`
- Do not change Thai copy without being asked
- Do not allow self-registration — admin creates all accounts
- Do not commit `.env.production` — it contains the JWT secret
