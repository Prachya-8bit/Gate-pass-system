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
| Database | PostgreSQL (Neon) via Prisma — dev ใช้ Neon branch "dev", prod ใช้ branch หลัก |
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
    companies/route.ts       → GET — company name list for autocomplete (any authenticated role)
components/
  atoms.tsx                  → migrated gDS tokens + all shared components (incl. Combobox)
  LoginScreen.tsx
  ContractorFlow.tsx
  AdminFlow.tsx
lib/
  db.ts                      → Prisma client singleton
  auth.ts                    → getSession(), signToken(), verifyToken()
  constants.ts               → calcMD()
  companies.ts                → ensureCompanyExists() — auto-adds new company names on record submit
  lib/sync.ts                 → groupKey, SYNC_LABELS, logTransition, constants
  lib/integration-auth.ts     → requireApiKey() for server-to-server endpoints
prisma/
  schema.prisma
  seed.ts                    → 7 demo records + default admin user
middleware.ts                → protect /contractor and /admin routes by role
```

---

## Database schema

See `prisma/schema.prisma`. Three models:

**User** — `id`, `credential` (phone or email, unique), `password` (bcrypt), `role` (contractor | admin), `createdAt`

**Record** — `id`, `name`, `idCard`, `company`, `job?`, `zone?`, `startDate`, `endDate`, `manDays`, `accident` (bool, default false), `createdAt`, `createdBy` (→ User.id)

**Company** — `id`, `name` (unique), `createdAt`. Lookup table for the company-name autocomplete on the contractor form and the admin filter — **not** a foreign key of `Record.company` (which stays a plain string). New names typed on the contractor form are auto-inserted via `ensureCompanyExists()` (`lib/companies.ts`) when a batch is submitted — no admin approval step.

- **SyncStatus enum + SyncLog model** — state machine for EPRO sync (see `docs/sync-state-machine.md`)
- **Business logic moved to backend:** `groupKey()` (record grouping) is in `lib/sync.ts` — RPA no longer groups records
- **API pattern:** claim/report with compare-and-set to prevent duplicate submissions. `lib/integration-auth.ts` provides shared API key auth

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
# First-time setup — สร้าง .env.local ก่อน (ดู .env.local.example) ชี้ DATABASE_URL ไป Neon branch "dev"
npm install
npx prisma migrate deploy
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

Default admin + 8 initial companies (the former `COMPANIES` hardcode list): credential `admin`, password from `SEED_ADMIN_PASSWORD` env var (falls back to `admin123` for local dev — production must set it).
Demo records were removed (2026-07-15) — records now come from real form submissions, and contractor accounts are created by the admin via the dashboard. New companies beyond the initial 8 are added automatically as contractors submit them — no re-seeding needed.

---

## Production deployment

**Stack:** Vercel (auto-deploy จาก GitHub `main`) + Neon PostgreSQL

- Repo: `github.com/Prachya-8bit/Gate-pass-system` — push `main` = deploy
- `vercel.json` — buildCommand รัน `prisma generate && prisma migrate deploy && next build` (migration ถูก apply อัตโนมัติทุก deploy)
- Environment variables ตั้งใน Vercel dashboard (เช็คลิสต์อยู่ใน `.env.production.example`): `DATABASE_URL` (Neon **pooled** connection), `JWT_SECRET`, `INTEGRATION_API_KEY`
- Seed admin ครั้งแรก: รันจากเครื่อง dev — `DATABASE_URL=<Neon direct> SEED_ADMIN_PASSWORD=<รหัสจริง> npx prisma db seed`
- Neon มี 2 branches: หลัก (production) + `dev` (เครื่องพัฒนาใช้ผ่าน `.env.local`)

**Legacy:** `Dockerfile`, `docker-compose.yml`, `Caddyfile`, `deploy.ps1` เป็นของแผน self-host เดิม (Docker + SQLite) — ใช้ไม่ได้แล้วหลัง schema เปลี่ยนเป็น PostgreSQL; เก็บไว้อ้างอิงเท่านั้น

---

## Do not

- Do not copy the prototype's internal structure — match visual output only
- Do not use `localStorage` or `sessionStorage` in production code
- Do not add Tailwind — keep inline styles migrated from `gDS`
- Do not change Thai copy without being asked
- Do not allow self-registration — admin creates all accounts
- Do not commit `.env.production` — it contains the JWT secret
