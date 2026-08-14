# Sync State Machine — RPA → EPRO

แผน implement ที่มาแทน `feedback-user-reflective-crayon.md` หลังจาก `Feedback-edit.md` ชี้ปัญหาเชิงสถาปัตยกรรม

---

## Context

`Feedback-edit.md` เป็น architecture guideline ที่ user เขียนต่อยอดจากแผนเดิม และมันปฏิเสธแผนเดิมถูกต้อง 3 จุด:

1. แผนเดิมใช้ `confirmed: Boolean` + `eproSyncedAt: String?` = anti-pattern "Multiple Boolean Status" (มี combination ที่เป็นไปไม่ได้ คือ `confirmed=false` แต่ `eproSyncedAt≠null`)
2. ความจริงเรื่อง "ส่งเข้า EPRO แล้วหรือยัง" อยู่ใน `automation/state/submitted.json` บนเครื่อง WSL เครื่องเดียว — Admin มองไม่เห็น, เครื่องพัง = ประวัติหาย = ส่งซ้ำทั้งหมด
3. **บั๊กจริงที่มีอยู่ตอนนี้:** `automation/epro-sync.mjs:155-160` กด submit ก่อน แล้วค่อย `saveState()` — ถ้าตายระหว่างนั้น ใบงานเข้า EPRO แล้วแต่ระบบไม่รู้ → รอบหน้าส่งซ้ำ

ข้อจำกัดที่ guideline ไม่ได้ครอบคลุมและแผนนี้ต้องแก้: **EPRO เป็นฟอร์ม ASP.NET ที่เรากดผ่าน Playwright — ไม่มี idempotency key** กดสองครั้ง = ใบงานสองใบ ดังนั้น "Retry is a Feature" ใช้ไม่ได้กับเคสที่ผลลัพธ์ไม่แน่นอน ต้องเลือก **at-most-once + ให้คนตัดสิน** ไม่ใช่ at-least-once

**ผลลัพธ์ที่ต้องการ:** Admin กดยืนยันก่อน RPA ถึงจะดึงไปส่งได้ · DB เป็น source of truth เดียว · ส่งซ้ำเป็นไปไม่ได้ · ทุก transition ตรวจสอบย้อนหลังได้

**ขอบเขตที่ตกลงแล้ว:** state machine + claim + audit log (**ไม่ทำ** Message Queue, **ไม่ทำ** `SyncBatch` entity) · เคสไม่รู้ผล = `NEEDS_REVIEW` ให้คนตัดสิน · state เก็บ per-record แต่ transition ทั้งกลุ่มพร้อมกัน

---

## State diagram

```
                    ┌──────────────── cancel ─────────────┐
                    │                                     ▼
  [สร้างจากฟอร์ม] → PENDING ──confirm──→ CONFIRMED ──claim──→ SYNCING ──ok──→ SYNCED
                       ▲                    ▲   ▲              │
                       └──── unconfirm ─────┘   │              ├──failed──→ FAILED
                                                │              │              │
                                                └── retry ─────┼──────────────┘
                                                               │        (auto หลัง backoff,
                                                               │         สูงสุด 3 ครั้ง)
                                                               │
                                                    unknown / reaper timeout
                                                               │
                                                               ▼
                                                        NEEDS_REVIEW
                                                        │          │
                                          resolveSynced │          │ resolveNotSynced
                                                        ▼          ▼
                                                     SYNCED    CONFIRMED
```

`SYNCED` และ `CANCELLED` เป็น terminal · `NEEDS_REVIEW` **ห้าม auto-retry เด็ดขาด**

---

## 1. Schema — `prisma/schema.prisma` + migration `add_sync_state_machine`

```prisma
enum SyncStatus {
  PENDING       // ยังไม่ยืนยัน — ค่าเริ่มต้นตอนผู้รับเหมาส่งฟอร์ม
  CONFIRMED     // Admin ยืนยันแล้ว รอ RPA มา claim
  SYNCING       // RPA จองแล้ว กำลังกรอก/กดบันทึก
  SYNCED        // เข้า EPRO สำเร็จ (terminal)
  FAILED        // พลาดแบบ "รู้แน่ว่ายังไม่เข้า EPRO" → claim ซ้ำได้
  NEEDS_REVIEW  // ไม่รู้ผล → ห้าม auto-retry คนต้องเปิด EPRO ไปดู
  CANCELLED     // Admin ปัดออกจากคิวถาวร (terminal)
}
```

เพิ่มใน `model Record` (คง `accident`, `createdAt String` เดิมไว้ ห้ามแตะ):

```prisma
  syncStatus    SyncStatus @default(PENDING)
  syncAttempt   Int        @default(0)
  lastSyncError String?
  lastSyncAt    DateTime?    // ครั้งล่าสุดที่ "พยายาม" ไม่ว่าผลเป็นอะไร — ใช้คำนวณ backoff
  syncedAt      DateTime?    // ครั้งที่สำเร็จ (null ถ้ายังไม่เคยสำเร็จ)
  claimedAt     DateTime?    // เวลาที่เข้า SYNCING — ใช้หาที่ค้าง
  claimedBy     String?      // runId ของ RPA ที่จองไว้
  batchKey      String?      // company|startDate|endDate|zone ตอน claim
  confirmedAt   DateTime?
  confirmedBy   String?      // User.id
  updatedAt     DateTime   @default(now()) @updatedAt

  @@index([syncStatus])
```

> ใช้ `DateTime?` ไม่ใช่ `String?` — timestamp ของ sync ต้องมีเวลาระดับวินาที ต่างจาก `createdAt/startDate/endDate` ที่เป็นวันที่ล้วน (แผนเดิมผิดตรงนี้)

```prisma
model SyncLog {
  id         String   @id @default(cuid())
  recordId   String
  fromStatus String?
  toStatus   String
  actor      String   // "admin:<userId>" | "rpa:<runId>" | "system:reaper" | "system:backfill"
  machine    String?
  error      String?
  createdAt  DateTime @default(now())

  @@index([recordId, createdAt])
  @@index([createdAt])
}
```

ไม่ผูก FK เพื่อให้ log อยู่รอดแม้ record ถูกลบ (audit log ห้ามหาย)

สร้างด้วย `npx prisma migrate dev --name add_sync_state_machine` (ชี้ `.env.local` → Neon branch `dev`) · prod apply อัตโนมัติผ่าน `vercel.json`

---

## 2. `lib/sync.ts` (ใหม่) — logic กลาง ห้ามกระจาย

- `groupKey(r)` → `[company, startDate, endDate, zone ?? ''].join('|')` — **ย้ายมาจาก `automation/epro-sync.mjs:84`** เพราะการจัดกลุ่มใบงานคือ business rule ต้องอยู่ backend
- `MAX_ATTEMPTS = 3` · `RETRY_BACKOFF_MS = 5 * 60_000` · `CLAIM_TIMEOUT_MS = 30 * 60_000`
- `logTransition(tx, { recordIds, from, to, actor, machine?, error? })` → `syncLog.createMany`
- `SYNC_LABELS: Record<SyncStatus, string>` — copy ไทยที่ UI และ Excel export ใช้ร่วมกัน

## 3. `lib/integration-auth.ts` (ใหม่)

ย้าย `keyMatches()` + guard 503/401 ออกจาก `app/api/integration/records/route.ts:9-29` มาเป็น `requireApiKey(request): NextResponse | null` แล้วให้ 3 route ใช้ร่วมกัน (records / claim / report)

---

## 4. `POST /api/integration/claim` (ใหม่) — หัวใจของงานนี้

body `{ runId: string }` · auth `x-api-key`

1. **Reap ก่อนเสมอ** (ไม่ต้องมี cron แยก): `SYNCING` ที่ `claimedAt < now - CLAIM_TIMEOUT_MS` → `NEEDS_REVIEW` + SyncLog actor `system:reaper`
2. หา record ที่ claim ได้: `syncStatus = CONFIRMED` **หรือ** (`FAILED` และ `syncAttempt < MAX_ATTEMPTS` และ `lastSyncAt < now - RETRY_BACKOFF_MS`) — retry policy ฝังอยู่ใน query นี้ ไม่ต้องมี retry job แยก
3. จัดกลุ่มด้วย `groupKey()` เลือก **กลุ่มเดียว** ที่เก่าที่สุด
4. **Compare-and-set** — จุดที่กันส่งซ้ำ:
   ```ts
   const claimed = await prisma.record.updateMany({
     where: { id: { in: ids }, syncStatus: { in: ['CONFIRMED', 'FAILED'] } },
     data: { syncStatus: 'SYNCING', claimedAt: now, claimedBy: runId,
             batchKey: key, lastSyncAt: now, syncAttempt: { increment: 1 } },
   });
   ```
   ถ้า `claimed.count !== ids.length` → มีคนแย่งไปแล้ว ตอบ `{ workOrder: null }` ให้ RPA ไปรอบหน้า (ไม่ต้อง rollback — ตัวที่ claim ติดจะถูก reaper กวาดเอง)
5. SyncLog ทุกใบ actor `rpa:<runId>`
6. ตอบ **ใบงานที่จัดกลุ่มมาแล้ว**:
   ```json
   {
     "batchKey": "บริษัท ก|2026-07-20|2026-07-25|Zone A",
     "workOrder": { "company": "...", "startDate": "...", "endDate": "...", "zone": "..." },
     "workers": [{ "id": "...", "name": "...", "idCard": "...", "job": "..." }]
   }
   ```

## 5. `POST /api/integration/report` (ใหม่)

body `{ runId, batchKey, result: 'ok' | 'failed' | 'unknown', error?, errorClass?: 'retryable' | 'permanent' }`

guard ทุก update ด้วย `where: { batchKey, claimedBy: runId, syncStatus: 'SYNCING' }` — report ที่มาช้าหรือมาจาก run เก่าจะเขียนทับไม่ได้

| result | ผลลัพธ์ |
|---|---|
| `ok` | `SYNCED`, `syncedAt = now` |
| `failed` + `retryable` | `FAILED`, `lastSyncError` — claim ซ้ำได้หลัง backoff |
| `failed` + `permanent` | `FAILED` + set `syncAttempt = MAX_ATTEMPTS` (ตัดสิทธิ์ auto-retry) → โผล่แถบแดงหน้า Admin |
| `unknown` | `NEEDS_REVIEW` |

## 6. `app/api/integration/records/route.ts` — เก็บไว้อ่านอย่างเดียว

ไม่ใช่ทางเข้าของ sync อีกต่อไป (RPA ย้ายไปใช้ claim) — เพิ่ม `?status=` filter และ select field ใหม่ ไว้ query เฉพาะกิจ/ตรวจสอบ

---

## 7. `PATCH /api/records/[id]` — เปลี่ยนเป็น action-based

ตอนนี้ (`app/api/records/[id]/route.ts:20-24`) ไม่อ่าน body และ flip `accident` อย่างเดียว → รับ body `{ action }` (ไม่มี body = `toggleAccident` เพื่อ back-compat), admin only ตาม `getSession` เดิม:

| action | จาก → ไป | หมายเหตุ |
|---|---|---|
| `toggleAccident` | — | เหมือนเดิม |
| `confirm` | `PENDING` → `CONFIRMED` | set `confirmedAt` / `confirmedBy` |
| `unconfirm` | `CONFIRMED` → `PENDING` | สถานะอื่น → 400 |
| `retry` | `FAILED` → `CONFIRMED` | reset `syncAttempt = 0` |
| `resolveSynced` | `NEEDS_REVIEW` → `SYNCED` | Admin เปิด EPRO เจอใบงานแล้ว |
| `resolveNotSynced` | `NEEDS_REVIEW` → `CONFIRMED` | ไม่เจอในใบงาน → ส่งใหม่ได้ |
| `cancel` | ทุกสถานะยกเว้น `SYNCED` / `SYNCING` → `CANCELLED` | |

ทุก transition ต้อง **guard สถานะต้นทางใน `where`** (ไม่ใช่ read-then-write) + เรียก `logTransition()` และข้อความ error เป็นไทย เช่น `"ส่งเข้า EPRO แล้ว ไม่สามารถยกเลิกการยืนยันได้"`

## 8. `POST /api/records/confirm` (ใหม่) — bulk

admin only · body `{ ids: string[] }` → `updateMany({ where: { id: { in: ids }, syncStatus: 'PENDING' }, ... })` + SyncLog → คืน `{ count }`

---

## 9. `components/AdminFlow.tsx`

ตาม pattern optimistic update ของปุ่มอุบัติเหตุเดิม (บรรทัด ~96-99) และ inline style + `gDS` เท่านั้น (ห้าม Tailwind):

- `RecordRow` += `syncStatus`, `syncedAt`, `lastSyncError`, `syncAttempt`
- **คอลัมน์ checkbox** + state `selected: Set<string>` — select-all เลือกเฉพาะ `PENDING`
- **คอลัมน์ "สถานะ EPRO"** ใช้ `Badge`:

  | สถานะ | Badge | คลิกได้ |
  |---|---|---|
  | รอยืนยัน | gray | → ยืนยัน |
  | ยืนยันแล้ว | amber | → ยกเลิกยืนยัน |
  | กำลังส่ง | blue | ล็อก |
  | ส่งแล้ว | green | ล็อก (`title` = วันเวลาที่ส่ง) |
  | ไม่สำเร็จ | red | ปุ่ม "ลองใหม่" (`title` = `lastSyncError`) |
  | ต้องตรวจสอบ | red | ปุ่ม "ส่งแล้ว" / "ยังไม่ส่ง" |
  | ยกเลิก | gray | — |

- **แถบ bulk** เหนือตาราง: เลือก ≥ 1 → ปุ่ม `ยืนยันที่เลือก (N)` → `POST /api/records/confirm`
- **แถบเตือนแดง** เมื่อมี `NEEDS_REVIEW` หรือ `FAILED` ที่ `syncAttempt >= 3` — นี่คือ "Alert Administrator" ตัวจริง (โปรเจกต์ไม่มี email/LINE)
- KPI row += ตัวนับ 5 สถานะ (`รอยืนยัน / ยืนยันแล้ว / กำลังส่ง / ส่งแล้ว / มีปัญหา`)
- `colSpan` แถว loading/empty 10 → 12 (บรรทัด 298, 305) + `<th>` 2 อัน
- Excel export (บรรทัด ~128-144) += คอลัมน์ `สถานะ EPRO` + `วันที่ส่ง EPRO`

---

## 10. `automation/epro-sync.mjs` — ทิ้ง `submitted.json`

โครงใหม่ (โค้ด login / กรอกฟอร์ม บรรทัด 104-157 ใช้เดิมทั้งหมด):

```
runId = `${hostname()}-${Date.now()}`
login EPRO  (พังตรงนี้ = ยังไม่ได้ claim อะไร → exit 1 เฉยๆ)
loop (สูงสุด 20 รอบ):
  POST /claim {runId} → ไม่มี workOrder = จบ exit 0
  ┌ กรอก header + เพิ่มคนงานทีละคน
  │   พังตรงนี้ = ยังไม่กด submit → report failed + errorClass
  ├ page.click(submitButton)     ← ตั้งแต่จุดนี้ผลลัพธ์ไม่แน่นอน
  └ พังหลังจากนี้ = report unknown → NEEDS_REVIEW
  POST /report ok
```

- **ลบ** `stateFile` / `submitted` / `saveState()` / การจัดกลุ่มบรรทัด 82-93 ทั้งหมด (ไฟล์ `submitted.json` ปล่อยคาไว้บนดิสก์ ใช้ backfill เสร็จแล้วค่อยเปลี่ยนชื่อเป็น `.bak`)
- **`report` ต้อง retry เอง 3 ครั้ง** ถ้ายังส่งไม่ได้ให้ log เสียงดังแล้วปล่อยค้าง `SYNCING` — reaper จะเปลี่ยนเป็น `NEEDS_REVIEW` ให้เอง (พฤติกรรมที่ถูกต้อง ห้ามเดา)
- **ห้าม abort ทั้งรอบเพราะใบงานเดียวพัง** (ต่างจากบรรทัด 165-172 ปัจจุบัน) — report แล้วไป claim ใบถัดไป
- error classification: selector หาย / login fail / validation ฟอร์ม = `permanent` · timeout / network = `retryable`
- `run-sync.sh`, `selectors.mjs` ไม่ต้องแก้ (`flock` ยังจำเป็น กัน browser ซ้อน)

## 11. `automation/backfill-synced.mjs` (one-off)

อ่าน 11 ids จาก `automation/state/submitted.json` → set `SYNCED` + `syncedAt` + `confirmedAt` + SyncLog actor `system:backfill`

> ⚠️ **ต้องเช็คก่อนรัน:** ids เหล่านั้นเกิดจาก `GATEPASS_URL` ที่ชี้ `localhost:4009` (Neon branch `dev`) — ถ้า prod เป็นคนละ DB ให้ query หาก่อนว่า id ไหนมีอยู่จริงใน DB ตัวไหน แล้วรัน backfill ทีละ DB ไม่งั้นข้อมูลจะไม่ตรงกัน

## 12. เอกสาร

- `docs/eprocurement-integration.md` — ลิงก์มาที่ไฟล์นี้ + อัปเดตสัญญา API (claim/report แทน records)
- `CLAUDE.md` — อัปเดต schema section + business logic (การจัดกลุ่มใบงานย้ายมา backend แล้ว)

---

## ลำดับการทำ

1. Schema + migration + `lib/sync.ts` + `lib/integration-auth.ts`
2. API: claim / report / confirm / PATCH actions
3. Admin UI
4. RPA + backfill + เอกสาร

---

## Verification

1. `npx tsc --noEmit` ผ่าน
2. `npm run dev` → login admin:
   - สร้าง record ผ่านฟอร์มผู้รับเหมา → Badge = `รอยืนยัน`
   - `curl -XPOST -H "x-api-key: ..." localhost:4009/api/integration/claim -d '{"runId":"t1"}'` → `workOrder: null` (ยังไม่ยืนยัน)
   - กดยืนยัน (เดี่ยว + bulk) → claim ซ้ำ → ได้ใบงาน **จัดกลุ่มมาแล้ว**, Badge เปลี่ยนเป็น `กำลังส่ง`
   - **claim ซ้ำทันทีด้วย `runId: "t2"`** → ต้องได้ `null` (compare-and-set ทำงาน)
   - report `ok` → `ส่งแล้ว`, กดยกเลิกยืนยันไม่ได้ (400 ข้อความไทย)
   - report ด้วย `runId` ผิด → ต้องไม่มีอะไรเปลี่ยน
   - claim ใหม่ → report `failed` + `retryable` → `ไม่สำเร็จ` → claim ทันทีต้องได้ `null` (ติด backoff) → กดปุ่ม "ลองใหม่" บน UI → claim ได้
   - report `unknown` → `ต้องตรวจสอบ` + แถบแดงโผล่ + ปุ่ม "ส่งแล้ว" / "ยังไม่ส่ง" ทำงาน
   - toggle อุบัติเหตุยังปกติ
3. **ทดสอบ reaper:** claim แล้วไม่ report → `UPDATE "Record" SET "claimedAt" = now() - interval '1 hour'` ผ่าน `npx prisma studio` / psql → เรียก claim อีกครั้ง → ต้องกลายเป็น `NEEDS_REVIEW`
4. `npx prisma studio` → เช็ค `SyncLog` มีครบทุก transition
5. `npm run sync:dry` ชี้ dev server (port 4009) — ดูว่า claim → กรอกฟอร์ม → ไม่ submit ครบวงจร
6. Excel export → มีคอลัมน์สถานะ EPRO ตรงกับตาราง

---

## ผลกระทบที่ต้องรู้

- หลัง deploy **ไม่มีรายการไหนถูกส่งเข้า EPRO จนกว่า Admin จะกดยืนยัน** (พฤติกรรมที่ต้องการ)
- เครื่องที่รัน cron ต้อง `git pull` — RPA เวอร์ชันเก่าจะเรียก endpoint ที่เปลี่ยนไปแล้ว
- ต้องรัน backfill **ก่อน** เปิด cron รอบแรก ไม่งั้น 11 รายการเก่าจะขึ้น `รอยืนยัน` ทั้งที่ส่งไปแล้ว

---

## ภาคผนวก — ข้อที่ `Feedback-edit.md` ต้องแก้

| หัวข้อใน guideline | ปัญหากับงานนี้ | ทางแก้ในแผนนี้ |
|---|---|---|
| "Every Operation Must Be Idempotent" | EPRO เป็นฟอร์ม ASP.NET ไม่มี idempotency key — ทำ idempotent ที่ปลายทางไม่ได้ | ทำ at-most-once ด้วย claim-before-submit + `NEEDS_REVIEW` |
| "Retry is a Feature" | retry สถานะที่ผลไม่แน่นอน = สร้างใบงานซ้ำ | retry เฉพาะ `FAILED` (รู้แน่ว่ายังไม่เข้า) · `NEEDS_REVIEW` ห้าม retry |
| entity `Project` มี state เดียว | ของเราคือ `Record` = 1 คน แต่ EPRO รับเป็นใบงาน = หลายคน | per-record state แต่ transition ทั้งกลุ่มพร้อมกันด้วย `batchKey` |
| "RPA should NEVER decide business rules" | การจัดกลุ่มใบงานอยู่ใน `epro-sync.mjs:84` | ย้ายไป `lib/sync.ts` · claim คืนใบงานที่จัดกลุ่มแล้ว |
| "Attempt 3 → Alert Administrator" | โปรเจกต์ไม่มี email / LINE / ช่องทางแจ้งเตือนใดๆ | แถบเตือนแดงบนหน้า Admin Dashboard คือ alert ตัวจริง |
| Scalability → Message Queue | scale จริง ~สิบกว่ารายการ · โรงงานเดียว · RPA เครื่องเดียว | ไม่ทำ — แต่ state machine + polling API ย้ายไป MQ ทีหลังได้โดยไม่แก้ business logic |
| ไม่มีสถานะ "ไม่ต้องส่ง" | ชื่อผิด/ยกเลิกงาน จะค้าง `PENDING` ตลอดกาล | เพิ่ม `CANCELLED` |

---

# ภาคผนวก 2 — ขยายไปใช้กับคำขอนำรถเข้าโรงงาน (2026-08-13)

`VehicleRequest` ใช้ state machine เดียวกันนี้ทั้งดุ้น **ไม่มีสถานะใหม่ ไม่มี enum ใหม่** ทั้ง 7 สถานะและป้ายไทยใน `SYNC_LABELS` ใช้ได้ตรงๆ เพราะเป็นเรื่อง "ส่งเข้า EPRO แล้วหรือยัง" แบบเดียวกัน

## ทำไมแยกตารางและแยก endpoint

ไม่ได้เพิ่ม `formType` บน `Record` และไม่ได้เพิ่ม discriminator เข้า `/claim` เดิม เหตุผลหลักคือความปลอดภัยของ query ที่มีอยู่:

`app/api/integration/claim/route.ts` เลือกแถวด้วย `OR: [{syncStatus:'CONFIRMED'}, {syncStatus:'FAILED',...}]` **โดยไม่มีเงื่อนไขชนิดฟอร์ม** วินาทีที่ใบขอรถไปอยู่ในตาราง `Record` query นี้จะหยิบมันไปด้วย และแม้จะเพิ่ม filter ใน commit เดียวกัน ก็ได้สร้าง **คลาสของบั๊ก** ที่ query ไหนลืมใส่ filter จะทำให้ใบขอรถหลุดไปโผล่ใน KPI man-day, `GET /api/records`, Excel export, การ group ด้วย `groupKey()`, และ `ManagerSummary`

กรณีที่แย่ที่สุดของคลาสนี้คือ query ใน claim เอง และผลของมันคือ **ทะเบียนรถถูกพิมพ์ลงช่อง `txtRTM_VST_NAME` บันทึกเข้า EPRO ในชื่อพนักงานจริง แล้ว report `ok` → แถวกลายเป็น `SYNCED` และไม่มีใครรู้เลย** ซึ่งเป็นสิ่งที่สถาปัตยกรรม at-most-once ทั้งหมดนี้สร้างมาเพื่อกัน

ตารางแยก **เฉื่อยต่อโค้ดเดิมทุกบรรทัด** RPA เก่ามองไม่เห็น และ "ลืมใส่ filter" เป็นไปไม่ได้เพราะไม่มีอะไรให้ filter

เรื่อง version skew: RPA บนเครื่องโรงงาน deploy แยกจาก Vercel ถ้าใช้ `formType` ผลของ skew ทุกกรณีคือ **200 ที่แนบ payload ผิดแบบเงียบ** แต่การแยก endpoint ทำให้ผลเดียวที่เป็นไปได้คือ **404** ซึ่ง grep เจอในครั้งเดียว และ RPA ฝั่งรถจัดการ 404 เป็น "ข้ามเงียบ exit 0"

## ต่างจากฝั่งคนงาน

| | คนงาน | รถ |
|---|---|---|
| หน่วยที่ส่ง | ใบงาน = หลาย record จัดกลุ่มด้วย `groupKey()` | **1 คำขอ = 1 คัน = 1 แถว** |
| `batchKey` | `company\|startDate\|endDate\|zone` | **`id` ของแถวนั้น** |
| เลือกแถว | `findMany` แล้ว filter ตาม groupKey | **`findFirst`** + `orderBy: [{createdAt:'asc'},{id:'asc'}]` |
| ปุ่ม "เพิ่ม" ในฟอร์ม EPRO | มี (`btnAddNewVisitor` + `dgVisitor`) ต้องนับแถว | **ไม่มี** (ห้ามมีผู้โดยสาร) กรอกครั้งเดียวจบ |
| SyncLog | `kind='record'` | `kind='vehicle'` |

⚠️ **`orderBy` ต้องมี tiebreak `{id:'asc'}`** — `createdAt` เป็น string วันที่ล้วน (`YYYY-MM-DD`) ทุกแถวที่ยื่นวันเดียวกันจึงเสมอกันหมด ฝั่งคนงานทนได้เพราะจัดกลุ่ม แต่การหยิบ **แถวเดียว** จะได้ผลไม่แน่นอนคนละรอบถ้าไม่มี tiebreak

## กันส่งซ้ำด้วยแถวเดียว

สิ่งที่กันไม่เคยเป็น array ของ ids แต่เป็น **predicate ใน `UPDATE`**:

```ts
const claimed = await tx.vehicleRequest.updateMany({
  where: { id: target.id, syncStatus: { in: ['CONFIRMED', 'FAILED'] } },
  data: claimData(runId, target.id, now),
});
if (claimed.count !== 1) return null;   // มี run อื่นชิงไปก่อน
```

`updateMany` จับ row-level lock ภายใต้ READ COMMITTED ของ PostgreSQL `UPDATE` ตัวที่สองบนแถวเดียวกันจะ block แล้ว**ประเมิน `WHERE` ใหม่กับ row version ที่ commit แล้ว** เห็น `SYNCING` จึงไม่ match อะไร คืน `count: 0` · `findFirst` ข้างบน**ไม่ใช่**ตัวกัน มันแค่เลือกผู้สมัคร ข้อมูลเก่าไปก็ไม่เป็นไร

## นโยบายที่แชร์กัน (`lib/sync.ts`)

`claimCutoffs()` · `claimableWhere()` · `claimData()` · `reportOutcome()` — ย้ายมาไว้ที่เดียวเพื่อให้การเปลี่ยนนโยบาย (อะไรหยิบได้, backoff แปลว่าอะไร, `unknown` ลงที่ไหน) แก้ที่เดียวไม่ใช่สองที่

**จงใจไม่ทำ** helper ที่รับ Prisma delegate เป็นพารามิเตอร์ — Prisma 6 ไม่มี base type ของ delegate ทางเลือกทั้งหมดพาไปที่ `any`/`as never` ซึ่งจะทำให้พิมพ์ชื่อสถานะผิด (เช่น `'SYNCNG'`) compile ผ่านแล้ว query ไม่ match อะไรเลยแบบเงียบ ก้อนข้อมูลธรรมดายังคง type-safe เพราะทั้งสองโมเดลประกาศชื่อและชนิดของ sync field เหมือนกันเป๊ะ

## กฎเฉพาะของฟอร์มรถที่กระทบ state machine

**EPRO บังคับว่าเวลาเริ่มต้องห่างจากตอนกด Save อย่างน้อย 1 ชั่วโมง** ซึ่งวัดตอน **RPA กด Save** ไม่ใช่ตอนผู้รับเหมากรอก ระหว่างนั้นมี admin ยืนยัน (นานเท่าไหร่ก็ได้) + cron 15 นาที ผลคือใบที่ขอชิดขั้นต่ำจะถูก EPRO ปฏิเสธได้ **และ retry ยิ่งแย่ลงเพราะเวลาเดินหน้า**

จึงมี 3 ชั้นที่ต้องคงไว้:

1. **pre-flight ใน RPA** — ถ้า `startDateTime < now + 60 นาที` **ไม่ส่งเลย** รายงาน `failed` + **`permanent`** เพื่อตัดสิทธิ์ auto-retry (retry ไม่มีทางสำเร็จ) แล้วโผล่แถบเตือนแดงให้คนจัดการ
2. **ดัก dialog หลังกด Save** — สคริปต์ accept dialog อัตโนมัติ ถ้าไม่เก็บข้อความไว้ตรวจ alert เตือน validation จะถูกกด OK แล้วรายงาน `ok` → **แถวกลายเป็น `SYNCED` ทั้งที่ EPRO ไม่ได้บันทึกอะไร = silent data loss**
3. **แถบเตือนใบใกล้หมดเวลาบนการ์ด admin** (< 90 นาที) ให้ยืนยันด่วนหรือยกเลิก

## error classification — เปลี่ยนจาก regex เป็นตำแหน่งที่พัง

`epro-sync.mjs` เดิมจัดประเภทด้วย regex `/selector|validation|login/i` บนข้อความ exception ซึ่งทำให้ข้อความไทยล้วนถูกจัดเป็น retryable → `unknown` → `NEEDS_REVIEW` ทั้งที่พัง**ก่อน**กด submit และรู้แน่ว่าไม่มีอะไรถูกบันทึก = เสียแรงคนเปล่า

`epro-sync-vehicle.mjs` ใช้ flag `submitClicked` แทน:

- **ก่อน submit พัง** = ไม่มีอะไรถูกบันทึก → `failed` (+ `permanent` ถ้าเป็น selector/validation/login ที่ลองใหม่ก็ไม่หาย)
- **หลังกด submit พัง** = ผลไม่แน่นอน → `unknown` → `NEEDS_REVIEW` **ห้ามเป็น `failed`** เพราะ `failed` retry ได้ = เสี่ยงส่งซ้ำ

ตั้ง `submitClicked = true` **ก่อน** `click()` เพราะ throw ใน click เอง (nav race) ก็ต้องนับว่าไม่แน่นอน

> แนะนำ retrofit ตรรกะนี้เข้า `epro-sync.mjs` ด้วย แต่ต้องเป็น **commit แยก** เพราะเปลี่ยนพฤติกรรมบนเส้นทางที่ใช้ production อยู่

## ข้อจำกัดที่ยังอยู่

- **reap เกิดขึ้นตอน claim เท่านั้น** ถ้าสคริปต์ฝั่งรถหยุดทำงาน แถวที่ค้าง `SYNCING` จะไม่ถูก reap (พฤติกรรมเดียวกับฝั่งคนงาน)
- **login EPRO 2 ครั้งต่อ tick** เพราะแยกสคริปต์ ถ้าเจอ lockout ให้รวมสองสคริปต์ให้แชร์ browser context เดียว
- **ระบบไม่รู้ผลอนุมัติจาก EPRO** `SYNCED` = "ส่งเข้า EPRO แล้ว" ไม่ใช่ "อนุมัติแล้ว" EPRO ไม่มี API ให้อ่านผลกลับ
