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
  page.tsx                        → redirect to /login
  login/page.tsx                  → LoginScreen
  contractor/page.tsx             → ContractorMenu (หน้าเมนู 2 การ์ด)
  contractor/workers/page.tsx     → ContractorFlow (ฟอร์มลงทะเบียนแรงงาน)
  contractor/vehicle/page.tsx     → VehicleFlow (ฟอร์มขอนำรถเข้า)
  admin/page.tsx                  → AdminFlow
  api/
    auth/login/route.ts           → POST — validate creds, set JWT cookie
    auth/logout/route.ts          → POST — clear cookie
    records/route.ts              → GET (admin, ?company=) / POST (contractor batch)
    records/[id]/route.ts         → PATCH — action-based state machine + accident flag
    records/confirm/route.ts      → POST — bulk confirm
    vehicle-requests/route.ts     → GET (admin, ?company=) / POST (contractor, single object)
    vehicle-requests/[id]/route.ts→ PATCH — action-based state machine (no accident flag)
    users/route.ts                → POST — admin creates contractor account
    companies/route.ts            → GET — company name list (any authenticated role)
    integration/claim/route.ts    → POST — RPA claims one worker work order
    integration/report/route.ts   → POST — RPA reports the outcome
    integration/vehicle-claim/route.ts  → POST — RPA claims one vehicle request
    integration/vehicle-report/route.ts → POST — RPA reports the outcome
components/
  atoms.tsx                  → gDS tokens + shared components (Combobox, TxtBox, BackLink, …)
  SyncCell.tsx               → คอลัมน์ "สถานะ EPRO" ใช้ร่วมกันสองตาราง
  LoginScreen.tsx
  ContractorMenu.tsx
  ContractorFlow.tsx
  VehicleFlow.tsx
  AdminFlow.tsx
  VehicleRequests.tsx        → GCard คำขอนำรถบนหน้า admin (fetch เอง)
  ManagerSummary.tsx
lib/
  db.ts                      → Prisma client singleton
  auth.ts                    → getSession(), signToken(), verifyToken()
  constants.ts               → gDS, calcMD(), span helpers, matchesCompanyFilter()
  companies.ts               → ensureCompanyExists() — auto-adds new company names
  sync.ts                    → SYNC_LABELS, logTransition, claim/report policy helpers
  vehicle.ts                 → ค่าคงที่ที่ถอดจากฟอร์ม EPRO + helper เวลาไทย
  vehicle-validate.ts        → validateVehicleInput() ใช้ร่วมกัน client/server
  integration-auth.ts        → requireApiKey() for server-to-server endpoints
prisma/
  schema.prisma
  seed.ts                    → default admin user + 8 initial companies
middleware.ts                → protect /contractor and /admin routes by role
automation/
  epro-sync.mjs              → RPA ฝั่งลงทะเบียนแรงงาน (FrmWorker.aspx)
  epro-sync-vehicle.mjs      → RPA ฝั่งคำขอนำรถ (FrmOperation.aspx)
  capture-page.mjs           → เก็บ selector จากหน้า EPRO ใหม่
  selectors.mjs              → selector ของทั้งสองฟอร์ม
```

---

## Database schema

See `prisma/schema.prisma`. Four models + one enum:

**User** — `id`, `credential` (phone or email, unique), `password` (bcrypt), `role` (contractor | admin), `contactName?`, `createdAt`

**Record** — `id`, `name`, `idCard`, `company`, `job?`, `zone?`, `startDate`, `endDate`, `manDays`, `accident` (bool, default false), `createdAt`, `createdBy` (→ User.id) + sync block

**VehicleRequest** — คำขอนำรถยนต์เข้ามาปฏิบัติงานภายในโรงงาน · `plant`, `company`, `driverName`, `plateNumber`, `plateProvince`, `location`, `reason`, `contactTel?`, `startDate`/`startTime`/`endDate`/`endTime`, `createdAt`, `createdBy` (→ User.id) + sync block

**Company** — `id`, `name` (unique), `createdAt`. Lookup table for the company-name autocomplete and the admin filter — **not** a foreign key of `Record.company` / `VehicleRequest.company` (both stay plain strings). New names typed on either contractor form are auto-inserted via `ensureCompanyExists()` (`lib/companies.ts`) — no admin approval step.

- **SyncStatus enum + SyncLog model** — state machine for EPRO sync (see `docs/sync-state-machine.md`)
- **`SyncLog.kind`** — `'record'` (default) หรือ `'vehicle'` บอกว่า `recordId` มาจากตารางไหน `recordId` ไม่มี FK อยู่แล้วจึงเก็บ id ของทั้งสองตารางได้
- **Business logic moved to backend:** `groupKey()` (record grouping) is in `lib/sync.ts` — RPA no longer groups records
- **API pattern:** claim/report with compare-and-set to prevent duplicate submissions. `lib/integration-auth.ts` provides shared API key auth

### ทำไม `VehicleRequest` เป็นตารางแยก ไม่ใช่ `formType` บน `Record`

query ใน `app/api/integration/claim/route.ts` เลือกแถวโดย**ไม่มีเงื่อนไขชนิดฟอร์ม** ถ้าใบขอรถอยู่ในตาราง `Record` query นั้นจะหยิบไปกรอกลงฟอร์มคนงาน แล้วรายงานสำเร็จ → **ทะเบียนรถถูกบันทึกเข้า EPRO ในชื่อพนักงานจริงโดยไม่มีใครรู้** ตารางแยกทำให้บั๊กคลาสนี้เป็นไปไม่ได้ และทำให้ version skew ทุกแบบกลายเป็น 404 ที่เห็นชัดใน log แทน 200 ที่แนบ payload ผิดแบบเงียบ

**ห้ามเพิ่มค่าใน `SyncStatus` enum** — ทั้ง 7 สถานะและป้ายไทยใน `SYNC_LABELS` ใช้กับทั้งสองตารางได้ตรงๆ และห้ามสร้าง enum แยกสำหรับรถ

⚠️ **`_prisma_migrations` ของ Neon branch `dev` มี 2 แถวที่ `finished_at` เป็น NULL** (`20260612000000_init` ที่ไม่มีในโฟลเดอร์ local และ `add_sync_state_machine` ที่ซ้ำ) ทำให้ **`prisma migrate dev` เรียกร้องให้ reset ฐานข้อมูล = ข้อมูลหาย** ให้ใช้ **`prisma migrate deploy`** เท่านั้น ซึ่งไม่สะดุดกับแถวพวกนี้และเป็นคำสั่งเดียวกับที่ Vercel รัน ถ้าต้องสร้าง migration ใหม่ให้ใช้ `prisma migrate diff` (อ่านอย่างเดียว) แล้วเขียนโฟลเดอร์ migration เอง

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
- **ช่วงวันที่**: `spanDays` 1–6 (= `calcMD` 2–7 วัน) **ห้ามวันเดียวกัน** — ใช้กฎเดียวกันทั้งฟอร์มคนงานและฟอร์มรถ

### คำขอนำรถเข้าโรงงาน

ทุกค่าถอดมาจากฟอร์มจริง EPRO `reg/FrmOperation.aspx` (เมนู ยานพาหนะ → ปฏิบัติงานในโรงงาน) เก็บด้วย `automation/capture-page.mjs` — **เก็บเฉพาะฟิลด์ที่ EPRO มี** จึงไม่มี ประเภทรถ / เลขบัตรคนขับ / ชื่อโครงการ

- **1 คำขอ = 1 คัน** ไม่มีปุ่ม "เพิ่ม" ในฟอร์ม EPRO เพราะห้ามมีผู้โดยสาร → ไม่ต้องจัดกลุ่ม `batchKey` = id ของแถว
- **เวลาเริ่มต้องห่างจากปัจจุบันอย่างน้อย 1 ชั่วโมง** (`VEHICLE_LEAD_MINUTES`) — กฎของ EPRO ที่วัดตอน **RPA กด Save** ไม่ใช่ตอนผู้รับเหมากรอก ดังนั้นใบที่ขอชิดขั้นต่ำจะถูก EPRO ปฏิเสธได้เพราะ admin ยืนยัน + cron 15 นาทีกินเวลาเกิน กันไว้ 3 ชั้น: pre-flight ใน RPA (ไม่ส่งเลย รายงาน `permanent` เพราะ retry ยิ่งแย่) · ดัก dialog หลัง Save · แถบเตือนใบใกล้หมดเวลาบนการ์ด admin
- **นาทีเลือกได้แค่ `00`/`15`/`30`/`45`** (`TIME_MINUTES`) — dropdown นาทีของ EPRO มี 59 ตัวเลือกไม่ใช่ 60 **ขาดค่า `10`** ถ้าปล่อยให้เลือก 10 แล้ว `selectOption` จะ throw ทุกครั้ง
- **จังหวัด**: DB เก็บชื่อสะอาด แต่ value ของ `ddlProvience` ห่อด้วย **non-breaking space (U+00A0)** ทั้ง 77 ตัว RPA ห่อกลับด้วย `eproProvinceValue()` ใน `selectors.mjs`
- **วันที่เป็น ค.ศ.** ยืนยันจากฟอร์มจริงแล้ว (`14/08/2026`) `toDMY()` ใช้ได้
- **`plant`/`ผู้อนุมัติ` เหมือนฟอร์มคนงาน** (4911/4931/4951, 6/10/200/317) จึงใช้ `EPRO_PLANT`/`EPRO_APPROVER` เดิม
- **`txtRTM_VST_REQNAME` ถูก pre-fill เป็นชื่อบัญชี EPRO ที่ใช้ login** ทุกใบจะขึ้นชื่อคนเดียวไม่ว่าผู้รับเหมาไหนยื่น → `contactTel` ที่ผู้รับเหมากรอกจึงสำคัญ ให้โรงงานติดต่อคนจริงได้
- **ระบบไม่รู้ผลอนุมัติจาก EPRO** — `SYNCED` = "ส่งเข้า EPRO แล้ว" **ไม่ใช่ "อนุมัติแล้ว"** EPRO ไม่มี API ให้อ่านผลกลับ **ห้ามเขียน UI ที่ทำให้ผู้ใช้เข้าใจว่าเห็นผลอนุมัติ** และเป็นเหตุผลที่ยังไม่ทำหน้าให้ผู้รับเหมาดูสถานะตัวเอง

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

# RPA (ต้องอยู่ในเครือข่ายบริษัท/VPN — ดู automation/README.md)
cd automation
npm run sync:dry            # ฝั่งคนงาน กรอกให้ดู ไม่กด Save
npm run sync:vehicle:dry    # ฝั่งรถ อ่านค่ากลับจากฟอร์มมาแสดง + เซฟภาพ
npm run capture:menu        # dump เมนูซ้ายของ EPRO
```

⚠️ **อย่ารัน `prisma migrate dev` กับฐาน dev นี้** — จะเรียกร้องให้ reset (ดูหัวข้อ Database schema)

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

⚠️ **ก่อนรันอะไรที่เขียนฐานข้อมูล ให้ยืนยัน host ก่อนว่าเป็น `dev` จริง** — เอกสารบอกว่า `.env.local` ชี้ `dev` ไม่ได้รับประกันว่าไฟล์จริงชี้อย่างนั้น (2026-08-13 มันชี้ **production** อยู่ และเพิ่งแก้เป็น `dev` วันที่ 14) ทั้ง migration และข้อมูลทดสอบจึงลงไปที่ production โดยไม่มีใครรู้ตัว

```bash
# เช็ค host ที่ .env.local ชี้อยู่จริง (ไม่พิมพ์รหัสผ่าน)
node -e "const l=require('fs').readFileSync('.env.local','utf8').split(/\r?\n/).find(x=>x.startsWith('DATABASE_URL='));console.log(new URL(l.slice(l.indexOf('=')+1).replace(/^\"|\"$/g,'')).hostname)"
```

⚠️ **`vercel.json` รัน `prisma migrate deploy` ตอน preview build ด้วย ไม่ใช่แค่ production** — ถ้า `DATABASE_URL` ตั้งเป็นค่าเดียวกันทุก environment การ push feature branch จะ **apply migration ลง production ทันทีทั้งที่ยังไม่ merge** ต้องตั้ง `DATABASE_URL` ของ scope **Preview** ให้ชี้ Neon branch `dev`

**เครื่องที่รัน RPA มี `.env` ของตัวเอง** (`automation/.env` — gitignored) `INTEGRATION_API_KEY` ในไฟล์นั้นต้องตรงกับที่ตั้งใน Vercel/`.env.local` ของ server ที่ `GATEPASS_URL` ชี้ไป ไม่ตรงจะได้ 401 ตอน claim

**Legacy:** `Dockerfile`, `docker-compose.yml`, `Caddyfile`, `deploy.ps1` เป็นของแผน self-host เดิม (Docker + SQLite) — ใช้ไม่ได้แล้วหลัง schema เปลี่ยนเป็น PostgreSQL; เก็บไว้อ้างอิงเท่านั้น

---

## Do not

- Do not copy the prototype's internal structure — match visual output only
- Do not use `localStorage` or `sessionStorage` in production code
- Do not add Tailwind — keep inline styles migrated from `gDS`
- Do not change Thai copy without being asked
- Do not allow self-registration — admin creates all accounts
- Do not commit `.env.production` — it contains the JWT secret
