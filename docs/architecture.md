# System Architecture — SYS Gate Pass

ระบบบันทึกใบผ่านเข้าโรงงานและนับ man-day ของผู้รับเหมา พร้อมส่งรายชื่อเข้าระบบ eprocurement (EPRO) อัตโนมัติ

| | |
|---|---|
| สถานะเอกสาร | สะท้อนโค้ดจริง ณ 2026-07-25 · ส่วนที่ยังไม่ได้ทำกำกับด้วย 🔶 **(แผน)** |
| ผู้ใช้ | ผู้รับเหมา + Admin ความปลอดภัย ของโรงงานอุตสาหกรรมไทย |
| ภาษา UI | ไทยทั้งหมด |
| เอกสารที่เกี่ยวข้อง | [`sync-state-machine.md`](./sync-state-machine.md) · [`eprocurement-integration.md`](./eprocurement-integration.md) |

---

## 1. บริบทของระบบ (System Context)

```mermaid
graph TB
    C["👷 ผู้รับเหมา<br/>(contractor)"]
    A["🛡️ Admin<br/>(เจ้าหน้าที่ความปลอดภัย)"]
    GP["<b>SYS Gate Pass</b><br/>Next.js บน Vercel"]
    DB[("Neon PostgreSQL<br/>branch: main / dev")]
    RPA["🤖 RPA Worker<br/>Playwright บนเครื่อง WSL ในโรงงาน"]
    EPRO["🏭 EPRO<br/>eprocurement.syssteel.com<br/>(ASP.NET · ระบบภายนอก)"]

    C -->|"ลงทะเบียนคนงาน<br/>HTTPS + JWT cookie"| GP
    A -->|"ดูสรุป · ยืนยัน · export Excel"| GP
    GP <-->|"Prisma / TLS"| DB
    RPA -->|"claim / report<br/>HTTPS + x-api-key"| GP
    RPA -->|"กรอกฟอร์มแทนคน<br/>Playwright (ไม่มี API)"| EPRO

    style GP fill:#0a1628,color:#fff
    style EPRO fill:#fef2f2,stroke:#dc2626
    style RPA fill:#fffbeb,stroke:#e8a020
```

**ข้อจำกัดที่กำหนดสถาปัตยกรรมทั้งหมด:** EPRO **ไม่มี API** ต้องเข้าผ่านการกรอกฟอร์มเว็บเท่านั้น จึงไม่มี idempotency key ไม่มี transaction ไม่มีทางถามย้อนว่า "ส่งไปแล้วหรือยัง" ทุกการตัดสินใจเรื่อง reliability ในเอกสารนี้เกิดจากข้อจำกัดนี้

---

## 2. Container Diagram

```mermaid
graph LR
    subgraph browser["เบราว์เซอร์"]
        UI["React 19 Client Components<br/>ContractorFlow · AdminFlow · LoginScreen<br/>inline styles (gDS) · xlsx export"]
    end

    subgraph vercel["Vercel — Fluid Compute"]
        MW["middleware.ts<br/>ตรวจ JWT + role"]
        PAGES["App Router pages<br/>/login /contractor /admin"]
        API1["API: ผู้ใช้<br/>auth · records · users"]
        API2["API: เครื่องต่อเครื่อง<br/>/api/integration/*"]
        LIB["lib/ — auth · db · constants<br/>🔶 sync · integration-auth"]
    end

    subgraph neon["Neon PostgreSQL"]
        T1[("User")]
        T2[("Record")]
        T3[("🔶 SyncLog")]
        T4[("Company")]
    end

    subgraph plant["เครื่องในโรงงาน (WSL)"]
        CRON["cron ทุก 15 นาที<br/>run-sync.sh + flock"]
        SYNC["epro-sync.mjs<br/>Playwright chromium (headless)"]
        SEL["selectors.mjs"]
    end

    EPRO["EPRO FrmWorker.aspx"]

    UI --> MW --> PAGES
    UI -->|fetch| API1
    API1 --> LIB --> T1 & T2 & T3 & T4
    API2 --> LIB
    CRON --> SYNC --> SEL
    SYNC -->|x-api-key| API2
    SYNC -->|browser| EPRO
```

### ทำไมแยก RPA ออกจาก Vercel

Playwright ต้องรันเบราว์เซอร์จริง กินเวลาต่อใบงานเป็นนาที และ EPRO อาจอยู่หลัง network ของโรงงาน — ไม่เหมาะกับ serverless function ที่มี timeout จำกัด RPA จึงเป็น **process แยกที่โรงงาน** และคุยกับระบบหลักผ่าน HTTP API เท่านั้น ทำให้ Vercel ไม่ต้องรู้จัก EPRO เลย

---

## 3. Layers ภายในแอป

| Layer | ไฟล์ | หน้าที่ | กฎ |
|---|---|---|---|
| **Presentation** | `components/*.tsx` | UI ทั้งหมด (client components) | inline style จาก `gDS` เท่านั้น · ห้าม Tailwind · ห้าม `localStorage` |
| **Routing / Guard** | `middleware.ts` | กัน `/contractor/*`, `/admin/*` ตาม role | ไม่มี session → redirect `/login` · ผิด role → 403 |
| **API — ผู้ใช้** | `app/api/{auth,records,users,companies}` | รับคำสั่งจากเบราว์เซอร์ · ตรวจสิทธิ์ด้วย cookie | ทุก route ต้องเรียก `getSession()` ก่อนเสมอ |
| **API — เครื่องต่อเครื่อง** | `app/api/integration/*` | ให้ RPA เรียก · ตรวจสิทธิ์ด้วย `x-api-key` | แยก namespace ชัดเจน ไม่ปนกับ API ผู้ใช้ |
| **Domain** | `lib/constants.ts` · `lib/companies.ts` · 🔶 `lib/sync.ts` | `calcMD()`, `gDS` · `ensureCompanyExists()` (auto-add บริษัทใหม่) · 🔶 `groupKey()`, transition rules | business rule ทั้งหมดอยู่ที่นี่ ห้ามอยู่ใน RPA หรือ UI |
| **Data** | `lib/db.ts` · `prisma/schema.prisma` | Prisma client singleton | เข้าถึง DB ผ่าน Prisma เท่านั้น |

**หลักที่ยึด:** ผู้รับเหมาและ RPA ไม่เคยตัดสินใจเชิงธุรกิจ — server เป็นคนตัดสินทั้งหมด (คำนวณ man-day, จัดกลุ่มใบงาน, อนุญาต transition)

---

## 4. Data Model

```mermaid
erDiagram
    User ||--o{ Record : "createdBy"
    Record ||..o{ SyncLog : "recordId (ไม่มี FK)"
    Record ||..o{ Company : "company (ชื่อ string เดียวกัน ไม่มี FK)"

    User {
        string id PK "cuid"
        string credential UK "เบอร์โทรหรืออีเมล"
        string password "bcrypt hash"
        string role "contractor | admin"
        datetime createdAt
    }
    Record {
        string id PK "cuid"
        string name "ชื่อ-นามสกุล (ไทย)"
        string idCard "เลขบัตร 13 หลัก"
        string company
        string job "nullable"
        string zone "nullable"
        string startDate "YYYY-MM-DD"
        string endDate "YYYY-MM-DD"
        int manDays "calcMD()"
        bool accident "admin toggle ภายหลัง"
        string createdAt "YYYY-MM-DD"
        string createdBy FK
        enum syncStatus "🔶 PENDING..CANCELLED"
        int syncAttempt "🔶"
        datetime claimedAt "🔶 หา job ที่ค้าง"
        string claimedBy "🔶 runId"
        string batchKey "🔶 คีย์กลุ่มใบงาน"
        datetime syncedAt "🔶"
    }
    SyncLog {
        string id PK "🔶 audit ห้ามลบ"
        string recordId
        string fromStatus
        string toStatus
        string actor "admin: | rpa: | system:"
        string error
        datetime createdAt
    }
    Company {
        string id PK "cuid"
        string name UK "case-sensitive unique · เทียบ insensitive ก่อน insert"
        datetime createdAt
    }
```

**`Company`** เป็น lookup table สำหรับ autocomplete เท่านั้น ไม่มี FK กับ `Record.company` — ผู้รับเหมาพิมพ์ชื่อบริษัทใหม่ที่ไม่มีใน list ได้เสมอ (`POST /api/records` จะ upsert ชื่อนั้นเข้า `Company` อัตโนมัติผ่าน `ensureCompanyExists()`)

**ข้อสังเกตเรื่องชนิดข้อมูล:** วันที่เชิงธุรกิจ (`startDate`, `endDate`, `createdAt`) เก็บเป็น `String` รูปแบบ `YYYY-MM-DD` เพราะเป็นวันที่ล้วนและเรียง/เทียบแบบ string ได้ถูกต้อง ส่วน timestamp ของระบบ sync (🔶 `claimedAt`, `syncedAt`) ใช้ `DateTime` เพราะต้องการความละเอียดระดับวินาทีเพื่อคำนวณ timeout/backoff

**Man-day** คำนวณที่ server ตอนสร้างเท่านั้น (`calcMD()` — นับหัวท้าย, ขั้นต่ำ 1 วัน) แล้วเก็บเป็นค่าคงที่ ไม่คำนวณซ้ำตอนอ่าน เพื่อให้ประวัติย้อนหลังไม่เปลี่ยนตามโค้ด

---

## 5. Flow หลัก

### 5.1 Login

```mermaid
sequenceDiagram
    participant B as เบราว์เซอร์
    participant API as POST /api/auth/login
    participant DB as Neon

    B->>API: { credential, password }
    API->>DB: findUnique(credential)
    API->>API: bcrypt.compare
    Note over API: ผิด → 401 ข้อความกลางๆ<br/>ไม่บอกว่าผิดที่ user หรือ password
    API->>API: signToken (jose HS256, 7d, iss/aud=gate-pass-app)
    API-->>B: Set-Cookie gp_token (HttpOnly, Secure, SameSite)
    B->>B: redirect ตาม role → /contractor หรือ /admin
```

ไม่มีการสมัครเอง — Admin สร้างบัญชีผ่าน `POST /api/users` เท่านั้น

### 5.2 ผู้รับเหมาลงทะเบียนคนงาน (batch)

ฟอร์ม 3 ขั้น (ข้อมูลงาน → รายชื่อคน → ยืนยัน) ส่งครั้งเดียวเป็น array → `POST /api/records`
- validate **ทุกคน** ก่อน แล้วจึงเขียน — ผิดคนเดียว = ไม่เขียนเลย (`prisma.$transaction`)
- 1 การส่งฟอร์ม = N records ที่แชร์ข้อมูลงานเดียวกัน
- ทุก record เริ่มที่ 🔶 `syncStatus = PENDING`

### 5.3 Admin ยืนยัน + RPA ส่งเข้า EPRO 🔶

```mermaid
sequenceDiagram
    autonumber
    participant A as Admin
    participant GP as Gate Pass API
    participant DB as Neon
    participant R as RPA (runId)
    participant E as EPRO

    A->>GP: PATCH /api/records/[id] {action:'confirm'}
    GP->>DB: PENDING → CONFIRMED (guard สถานะต้นทาง) + SyncLog

    Note over R: cron ทุก 15 นาที · flock กัน browser ซ้อน
    R->>GP: POST /api/integration/claim {runId}
    GP->>DB: reap SYNCING ที่ค้าง > 30 นาที → NEEDS_REVIEW
    GP->>DB: updateMany WHERE status IN (CONFIRMED,FAILED)<br/>SET SYNCING (compare-and-set)
    GP-->>R: ใบงาน 1 ใบ (จัดกลุ่มโดย server)

    R->>E: login → กรอก header → เพิ่มคนงานทีละคน
    R->>E: กดบันทึก
    Note over R,E: ⚠️ ตั้งแต่จุดนี้ผลลัพธ์ไม่แน่นอน<br/>EPRO ไม่มีทางให้ถามย้อน

    alt สำเร็จ
        R->>GP: POST /report {result:'ok'} → SYNCED
    else พังก่อนกดบันทึก
        R->>GP: POST /report {result:'failed'} → FAILED (retry ได้)
    else พังหลังกดบันทึก / report ไม่ถึง
        R--xGP: (เงียบ)
        Note over GP: reaper รอบถัดไป → NEEDS_REVIEW<br/>คนต้องเปิด EPRO ไปดูแล้วตัดสิน
    end
```

รายละเอียดสถานะทั้ง 7 และ transition table อยู่ใน [`sync-state-machine.md`](./sync-state-machine.md)

---

## 6. Trust boundary & ความปลอดภัย

```
เบราว์เซอร์ ──HTTPS──▶ [ middleware ]──▶ API ผู้ใช้      ← ตรวจ JWT cookie + role
RPA        ──HTTPS──▶ [ x-api-key  ]──▶ API integration ← ตรวจ shared key แบบ timing-safe
Vercel     ──TLS────▶ Neon (pooled connection)
RPA        ──HTTPS──▶ EPRO (บัญชีพนักงานจริง 1 บัญชี)
```

| ประเด็น | วิธีที่ใช้ |
|---|---|
| Session | JWT HS256 (`jose`) ใน cookie `gp_token` — **HttpOnly** JS อ่านไม่ได้ · อายุ 7 วัน · ตรวจ `iss`/`aud` |
| รหัสผ่าน | bcrypt hash เท่านั้น · ไม่เคยเก็บ/log plaintext · error ตอน login เป็นข้อความกลางๆ ไม่บอกว่าผิดตรงไหน |
| แบ่งสิทธิ์ | บังคับ 2 ชั้น — `middleware.ts` กันระดับหน้า และทุก API route เรียก `getSession()` ซ้ำเอง (ห้ามพึ่ง middleware อย่างเดียว) |
| API เครื่องต่อเครื่อง | `x-api-key` เทียบด้วย `timingSafeEqual` · ถ้าไม่ได้ตั้ง `INTEGRATION_API_KEY` ระบบ **fail closed** (503) ไม่ใช่เปิดโล่ง |
| ความลับ | `JWT_SECRET`, `DATABASE_URL`, `INTEGRATION_API_KEY` อยู่ใน Vercel env · `EPRO_USERNAME/PASSWORD` อยู่ใน `automation/.env` บนเครื่องโรงงานเท่านั้น ไม่เคยขึ้น cloud · `.env*` ทั้งหมดถูก gitignore |
| ข้อมูลอ่อนไหว | เลขบัตรประชาชน 13 หลัก เก็บ plaintext (จำเป็นต่อการกรอก EPRO) — เข้าถึงได้เฉพาะ Admin ที่ล็อกอินและ RPA ที่ถือ key |
| Audit | 🔶 `SyncLog` บันทึกทุก state transition พร้อม actor — ห้ามลบ |

**ยังไม่มี (ความเสี่ยงที่รับทราบ):** rate limit ที่หน้า login · การหมุน `INTEGRATION_API_KEY` · การเข้ารหัสเลขบัตรที่ระดับ column

---

## 7. Deployment

```mermaid
graph LR
    GH["GitHub<br/>Prachya-8bit/Gate-pass-system<br/>branch: main"]
    V["Vercel<br/>project: gate-pass-system"]
    NP[("Neon branch หลัก<br/>= production")]
    ND[("Neon branch dev")]
    LOCAL["เครื่อง dev<br/>npm run dev :4009"]
    WSL["เครื่องโรงงาน (WSL)<br/>crontab ทุก 15 นาที"]

    GH -->|push = deploy| V
    V -->|"buildCommand:<br/>prisma generate → migrate deploy → next build"| NP
    LOCAL --> ND
    WSL -->|HTTPS| V
```

| สภาพแวดล้อม | แอป | ฐานข้อมูล | RPA |
|---|---|---|---|
| **dev** | `npm run dev` (port 4009) | Neon branch `dev` ผ่าน `.env.local` | รันมือ `npm run sync:dry` |
| **production** | Vercel (auto-deploy จาก `main`) | Neon branch หลัก (pooled connection) | cron บนเครื่องโรงงาน ชี้ `GATEPASS_URL` ไป prod |

- **Migration** ถูก apply อัตโนมัติทุก deploy ผ่าน `vercel.json` → deploy ที่ migration พังจะไม่ขึ้น production
- **Seed admin** รันมือครั้งเดียวจากเครื่อง dev ชี้ Neon direct connection พร้อม `SEED_ADMIN_PASSWORD`
- **Legacy:** `Dockerfile`, `docker-compose.yml`, `Caddyfile`, `deploy.ps1` เป็นของแผน self-host เดิม (Docker + SQLite) — ใช้ไม่ได้แล้วหลังย้ายเป็น PostgreSQL เก็บไว้อ้างอิงเท่านั้น

---

## 8. โมเดลความล้มเหลว (Failure Model)

หลักการ: **ยอมให้ตกหล่นแล้วมีคนมาเช็ค ดีกว่าส่งซ้ำเงียบๆ** เพราะข้อมูลซ้ำใน EPRO แก้ยากกว่าข้อมูลตกหล่นมาก

| สิ่งที่พัง | ระบบทำอะไร | ต้องมีคนทำอะไร |
|---|---|---|
| Vercel function ล่ม | RPA claim ไม่ได้ → รอบถัดไปลองใหม่ | — |
| Neon ไม่ตอบ | request พัง · ไม่มีอะไรเปลี่ยนสถานะ | — |
| RPA ตายก่อนกดบันทึก | 🔶 `FAILED` → claim ซ้ำอัตโนมัติหลัง backoff 5 นาที (สูงสุด 3 ครั้ง) | — |
| **RPA ตายหลังกดบันทึก** | 🔶 ค้าง `SYNCING` → reaper 30 นาที → `NEEDS_REVIEW` | ✅ เปิด EPRO ดูว่ามีใบงานไหม แล้วกด "ส่งแล้ว"/"ยังไม่ส่ง" |
| EPRO เปลี่ยนหน้า/selector หาย | 🔶 `FAILED` + `errorClass: permanent` → ไม่ retry | ✅ แก้ `selectors.mjs` |
| รหัสผ่าน EPRO หมดอายุ | login พัง · ยังไม่ได้ claim อะไร → ไม่มีสถานะเสียหาย | ✅ แก้ `automation/.env` |
| เครื่อง WSL ดับ | ไม่มีอะไรถูกส่ง · ข้อมูลอยู่ครบใน DB | ✅ เปิดเครื่อง — cron ทำงานต่อเอง |
| sync รอบก่อนยังไม่จบ | `flock` ข้ามรอบนี้ ไม่เปิด browser ซ้อน | — |
| RPA 2 ตัวแย่ง job | compare-and-set ที่ DB — ตัวที่ช้ากว่าได้ `null` | — |

**การกู้คืนทั้งหมดมาจาก database** ไม่มีสถานะสำคัญอยู่ในหน่วยความจำหรือไฟล์บนเครื่อง RPA (🔶 หลังเลิกใช้ `submitted.json`)

---

## 9. Observability

| ชั้น | ปัจจุบัน | 🔶 แผน |
|---|---|---|
| แอป | Vercel runtime logs | — |
| ธุรกิจ | KPI บนหน้า Admin (จำนวนรายการ · man-day · อุบัติเหตุ) | + ตัวนับ 5 สถานะ sync |
| Sync | `automation/logs/sync.log` (text บนเครื่องเดียว ค้นยาก) | `SyncLog` ใน DB ค้นได้ + แถบเตือนแดงบนหน้า Admin |
| Alert | ❌ ไม่มีเลย | แถบแดงบนหน้า Admin (โปรเจกต์ไม่มี email/LINE — ต้องยอมรับว่า alert ต้องมีคนเปิดหน้าดู) |

---

## 10. ข้อจำกัดที่ทราบและทิศทางต่อไป

| ข้อจำกัด | ผลกระทบตอนนี้ | เส้นทางแก้ |
|---|---|---|
| `GET /api/records` ดึงทุกแถวไม่มี pagination | ไม่มีปัญหาที่ระดับหลักร้อยแถว | เพิ่ม pagination + server-side filter เมื่อเกิน ~5,000 แถว |
| KPI คำนวณฝั่ง client จากทุกแถว | เหมือนกัน | ย้ายไป aggregate query |
| RPA มีเครื่องเดียว ไม่มี failover | เครื่องดับ = sync หยุด (ข้อมูลไม่หาย) | สถาปัตยกรรม claim/report รองรับ worker หลายตัวอยู่แล้ว — เพิ่มเครื่องได้ทันทีโดยไม่แก้โค้ด |
| ไม่มี message queue | ไม่จำเป็นที่ scale ปัจจุบัน (โรงงานเดียว · หลักสิบรายการ) | polling API + state machine ย้ายไปเป็น queue consumer ได้โดยไม่แตะ business logic |
| ไม่มี rate limit ที่ login | เสี่ยง brute force | เพิ่ม throttle ต่อ IP/credential |

---

## 11. บันทึกการตัดสินใจเชิงสถาปัตยกรรม

| # | ตัดสินใจ | เหตุผล | ทางเลือกที่ไม่เลือก |
|---|---|---|---|
| 1 | RPA (Playwright) แทน API integration | EPRO ไม่เปิด API ให้ | รอ vendor ทำ API — ไม่มีกำหนด |
| 2 | RPA แยกออกจาก Vercel | เบราว์เซอร์จริงกินเวลาเป็นนาที เกินวิสัย serverless และ EPRO อาจอยู่ใน network โรงงาน | รัน Playwright ใน function |
| 3 | JWT ใน HttpOnly cookie ทำเอง | ระบบเล็ก ผู้ใช้ปิด ไม่ต้องการ SSO/social login | NextAuth / Clerk — เกินความจำเป็น |
| 4 | 🔶 State machine + claim-before-submit | EPRO ไม่มี idempotency — ต้องกันซ้ำที่ฝั่งเรา 100% | boolean flags (แผนเดิม — มีช่องส่งซ้ำ) |
| 5 | 🔶 `NEEDS_REVIEW` ให้คนตัดสิน ไม่ retry อัตโนมัติ | retry เคสที่ไม่รู้ผล = สร้างใบงานซ้ำ | auto-retry ทุกกรณี |
| 6 | เก็บ sync state per-record แต่เปลี่ยนทั้งกลุ่มพร้อมกัน | EPRO รับเป็นใบงาน (หลายคน/ใบ) แต่ธุรกิจนับเป็นรายคน | สร้าง entity `SyncBatch` — ถูกกว่าเชิงทฤษฎีแต่งานเยอะเกินคุ้ม |
| 7 | Inline style จาก `gDS` ไม่ใช้ Tailwind | ต้องตรงกับ prototype จาก Claude Design แบบ pixel-for-pixel | Tailwind |
| 8 | Export Excel ฝั่ง client (`xlsx`) | ไม่ต้องมี endpoint สร้างไฟล์ · ข้อมูลอยู่ในเบราว์เซอร์อยู่แล้ว | สร้างไฟล์ที่ server |
