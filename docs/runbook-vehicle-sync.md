# Runbook — RPA ฝั่ง "คำขอนำรถเข้าโรงงาน" ไม่ส่งงาน

เปิดเอกสารนี้เมื่อ **ฝั่งลงทะเบียนแรงงานทำงานปกติ แต่ฝั่งคำขอนำรถไม่ส่ง**

อาการแบบนั้นตัดสาเหตุร่วมออกไปแล้วเกือบหมด — ถ้าฝั่งแรงงานส่งได้ แปลว่า login EPRO,
เครือข่าย/VPN, Playwright, Node/npm, `flock`, Task Scheduler, `GATEPASS_URL` และ
`INTEGRATION_API_KEY` ใช้งานได้ทั้งหมด เหลือเฉพาะสิ่งที่เป็นของเส้นทางรถเท่านั้น

| | |
|---|---|
| ทำที่ | **เครื่อง server ที่รัน Task Scheduler** (ไม่ใช่เครื่องพัฒนา) |
| ต้องมี | สิทธิ์เปิด `automation/logs/sync.log` และเข้า `/admin` บน production ได้ |
| shell | PowerShell |

> ⚠️ **`npm run sync:vehicle` ส่งคำขอเข้า EPRO จริงและลบจากฝั่งเราไม่ได้** ระหว่าง
> ไล่ปัญหาให้ใช้ `npm run sync:vehicle:dry` ซึ่งกรอกฟอร์มให้ดูแต่ไม่กดบันทึก

---

## ขั้น 0 — มีงานให้ทำจริงไหม (เช็คก่อนทุกอย่าง)

นี่คือสาเหตุที่พบบ่อยที่สุด และไม่ใช่บั๊ก

เปิด `/admin` บน production → เลื่อนไปการ์ด **🚗 คำขอนำรถเข้าโรงงาน**

- **ไม่มีใบสถานะ `ยืนยันแล้ว`** (ว่าง หรือมีแต่ `รอยืนยัน`) → **RPA ทำงานถูกแล้ว** มันจะพิมพ์
  `ไม่มีคำขอนำรถเข้าที่ต้องส่ง — จบการทำงาน` แล้วจบ เพราะไม่มีงาน **จบการไล่ปัญหาที่นี่**
- มีใบ `รอยืนยัน` แต่ยังไม่ `ยืนยันแล้ว` → ต้องให้ admin กด **ยืนยัน** ก่อน RPA จึงจะหยิบไปส่ง
  (เป็นพฤติกรรมที่ออกแบบไว้ — RPA ไม่ส่งอะไรที่ยังไม่ผ่านการยืนยัน)
- มีใบ `ยืนยันแล้ว` แต่ไม่ถูกส่ง → **ไปขั้น 1**

---

## ขั้น 1 — server pull โค้ดใหม่มาแล้วจริงไหม

Task Scheduler จะรันฝั่งรถได้ก็ต่อเมื่อ `run-sync.ps1` เป็นเวอร์ชันที่เรียก `sync:vehicle`
ซึ่งเข้า `main` ตอน PR #4 (merge 2026-08-14 09:14 UTC)

```powershell
cd <checkout บน server>
git log --oneline -3
git show HEAD:automation/run-sync.ps1 | Select-String "npm run sync"
```

ต้องเห็น **สองบรรทัด**: `npm run sync` และ `npm run sync:vehicle`
ถ้าเห็นบรรทัดเดียว → `git pull` แล้วเช็คซ้ำ

```powershell
cd automation
npm run                      # ต้องมี sync:vehicle และ sync:vehicle:dry ในรายการ
Test-Path .\epro-sync-vehicle.mjs    # ต้องเป็น True
```

---

## ขั้น 2 — อ่าน log บล็อกล่าสุด

```powershell
cd <checkout บน server>\automation
Get-Content logs\sync.log -Tail 80
```

> ถ้าสั่ง `npm run sync:vehicle` ด้วยมือ **ผลจะออกหน้าจอ ไม่ลง `sync.log`** — ให้ก๊อปข้อความบนจอมาดูแทน
> `sync.log` มีแค่รอบที่ Task Scheduler รัน

### บรรทัดปิดของบล็อกบอกอะไร

| บรรทัดปิด | แปลว่า |
|---|---|
| `จบ sync (exit N)` | **สคริปต์เก่า** — pull ก่อน PR #4 ฝั่งรถไม่เคยถูกเรียก → กลับไปขั้น 1 |
| `จบ sync (แรงงาน exit X, รถ exit Y)` | สคริปต์ใหม่ทำงานแล้ว → ดูตารางถัดไป |

### ข้อความในบล็อก → สาเหตุ → วิธีแก้

| ข้อความที่เห็น | สาเหตุ | ทำอะไร |
|---|---|---|
| `ไม่มีคำขอนำรถเข้าที่ต้องส่ง — จบการทำงาน` | ไม่มีใบ `ยืนยันแล้ว` | ไม่ใช่บั๊ก — ให้ admin ยืนยันใบก่อน |
| `Missing script: "sync:vehicle"` | pull ไม่ครบ หรือ pull ผิด checkout | `git pull` ใน checkout ที่ Task Scheduler ใช้จริง |
| `ยังไม่ได้ตั้งค่า <NAME> ใน .env` | env ขาด | เติมใน `automation/.env` (ดูขั้น 4) |
| `claim ล้มเหลว HTTP 401 — ตรวจ API key / GATEPASS_URL` | `INTEGRATION_API_KEY` ไม่ตรงกับที่ตั้งใน Vercel | ดูขั้น 4 |
| `claim ล้มเหลว HTTP 404` / `ยังไม่มี endpoint vehicle-claim` | `GATEPASS_URL` ผิด หรือชี้ไปที่ยังไม่ deploy | ดูขั้น 4 · ยืนยัน 2026-08-14 แล้วว่า production มี endpoint นี้ |
| `claim ล้มเหลว HTTP 5xx — ข้ามรอบนี้` | DB ไม่พร้อมชั่วคราว (Neon cold start) | ไม่ต้องทำอะไร รอบถัดไปเอาต่อเอง ถ้าขึ้นถี่ดู `error-reference.md` หัวข้อ 6 |
| `เวลาเริ่มเหลือ N นาที (น้อยกว่า 60 นาที)` | **EPRO บังคับให้เวลาเริ่มห่างจากตอนกดบันทึกอย่างน้อย 1 ชม.** ใบขอเวลาชิดเกินไป | ให้ผู้รับเหมายื่นใบใหม่โดยเผื่อเวลามากกว่านี้ · ใบเดิมถูกตัด auto-retry แล้วเพราะ retry ยิ่งแย่ (เวลาเดินหน้า) |
| `epro validation ไม่ผ่าน: <ข้อความ>` | EPRO เด้ง alert หลังกดบันทึก = **ไม่ได้บันทึก** | อ่านข้อความ dialog แล้วแก้ต้นเหตุ ใบจะเป็น `ต้องตรวจสอบ` |
| `vehicle form selector not found — เปิดหน้าฟอร์มรถยนต์ไม่ได้` | EPRO เปลี่ยนหน้าเว็บ | เก็บ selector ใหม่ (ขั้น 5) |
| `selectors.mjs: vehicleForm ยังมีช่องที่เป็น #TODO` | selector ไม่ครบ | เก็บ selector ใหม่ (ขั้น 5) |
| `✗ ไม่ทราบผล: <msg>` | พัง **หลัง** กดบันทึก ผลไม่แน่นอน | **เปิด EPRO เช็คด้วยตาว่าเข้าไปหรือยัง** แล้วกด `ส่งแล้ว` หรือ `ยังไม่ส่ง` บนหน้า admin ตามความจริง |
| `⚠️ report ไม่สำเร็จหลังจากลอง 3 ครั้ง` | ส่ง EPRO แล้วแต่รายงานกลับไม่ได้ | ใบค้าง `กำลังส่ง` → reaper เปลี่ยนเป็น `ต้องตรวจสอบ` ใน 30 นาที แล้วเช็คใน EPRO เอง |

### หน้าตาของรอบที่สำเร็จ

```
login สำเร็จ

[คำขอ 1] 1กก 1234 ระยอง | 2026-08-15 09:00 → 2026-08-16 17:00
  บันทึกคำขอแล้ว
ไม่มีคำขอนำรถเข้าที่ต้องส่ง — จบการทำงาน

เสร็จสิ้น — ส่ง 1 คำขอ
```

---

## ขั้น 3 — ภาพหน้าจอตอนพัง

ทุกครั้งที่ล้มเหลว สคริปต์เซฟภาพเต็มหน้าไว้

```powershell
Get-ChildItem screenshots\vehicle-* | Sort-Object LastWriteTime -Descending | Select-Object -First 5 Name, LastWriteTime
```

เปิดภาพล่าสุดดู — มักเห็นสาเหตุทันที (ช่องบังคับว่าง, ข้อความเตือนของ EPRO, หลุด login)

---

## ขั้น 4 — ตรวจ env บนเครื่อง server

`automation/.env` เป็น gitignored — `git pull` ไม่แตะ ต้องตรวจเอง

```powershell
cd <checkout บน server>
node scripts\check-rpa-env.mjs
```

สคริปต์จะแสดงค่าที่ไม่เป็นความลับตรงๆ ส่วนรหัสผ่านและ API key แสดงแค่ความยาวกับ
`sha256` 10 ตัวแรก แล้วเตือนจุดที่มักผิด

| ตัวแปร | ต้องเป็น |
|---|---|
| `GATEPASS_URL` | **URL ของ production** — ถ้าเป็น `http://localhost:4009` cron จะไปหยิบงานจากฐานเครื่องพัฒนา (สคริปต์จะเตือนให้) |
| `EPRO_APPROVER` | ต้องมีค่า (ว่าง = สคริปต์ออกทันที) |
| `EPRO_PLANT` | `4911` / `4931` / `4951` |
| `INTEGRATION_API_KEY` | ต้องตรงกับที่ตั้งใน Vercel · ห้ามเป็นค่า placeholder `copy-from-project-.env.local` |

เทียบ API key กับ Vercel: เอา `sha256(10)` ที่สคริปต์พิมพ์ออกมา ไปเทียบกับค่าใน Vercel
โดยรันสคริปต์เดียวกันบนเครื่องที่มีค่านั้น — ต้องเท่ากัน

> ห้ามเช็คด้วย `node -e "..."` ที่มี regex/quote ซ้อนกันใน PowerShell — มันแปลงค่าเสียหาย
> แบบเงียบ เคยทำให้ hash ออกมาผิดและเกือบสรุปว่า key ไม่ตรงทั้งที่ตรง จึงใช้ไฟล์สคริปต์แทน

---

## ขั้น 5 — ทดสอบด้วยมือ (ไม่ส่งจริง)

ต้องมีใบ `ยืนยันแล้ว` บน production อยู่ 1 ใบ

```powershell
cd <checkout บน server>\automation
npm run sync:vehicle:dry
```

จะ login EPRO → กรอกฟอร์มให้ครบ → **อ่านค่ากลับจากหน้าเว็บมาแสดง** → เซฟภาพ → **ไม่กดบันทึก**

ตรวจในผลลัพธ์:
- `✅ ทุกช่องมีค่าครบ ไม่มี dropdown ที่เลือกไม่ติด` — ถ้าขึ้น `⚠️ ช่องที่ยังว่าง` ให้ดูว่าช่องไหน
- `ปีในช่องวันที่ = 2026 ... ค.ศ. ถูกต้อง` — ถ้าเป็น 2569 คือ EPRO เปลี่ยนเป็น พ.ศ. ต้องแก้ `toDMY()`
- `ปุ่ม Save: ✅ กดได้ ไม่มีอะไรทับ`

> **หลัง dry-run ใบจะค้างสถานะ `กำลังส่ง`** — ต้องกด **`ยังไม่ส่ง`** บนหน้า admin เพื่อคืนใบ
> ไม่งั้นต้องรอ reaper 30 นาที ใบจึงกลับมาส่งได้

ถ้า dry-run ผ่านหมดแล้วค่อยส่งจริง (เฝ้าดูหน้าจอ):

```powershell
npm run sync:vehicle
```

แล้วเปิดเมนู **รายการขออนุญาต** ใน EPRO ยืนยันว่าใบเข้าไปจริง

### เก็บ selector ใหม่ (เมื่อ EPRO เปลี่ยนหน้าเว็บ)

```powershell
npm run capture:menu
npm run capture -- --menu "นำรถยนต์" --name FrmVehicle
```

ได้ `pages/FrmVehicle.controls.json` ซึ่งมี element id และ option ของทุก dropdown
เอาไปเทียบ/เติมใน `selectors.mjs`

> ⚠️ ไฟล์ใน `pages/` มีชื่อและเลขบัตรจริง — gitignored ไว้แล้ว **ห้าม commit ห้ามส่งออกนอกองค์กร**

---

## ถ้ายังไม่หาย — ส่งข้อมูลชุดนี้มา

```powershell
cd <checkout บน server>
git log --oneline -3
git show HEAD:automation/run-sync.ps1 | Select-String "npm run sync"
node scripts\check-rpa-env.mjs
Get-Content automation\logs\sync.log -Tail 80
Get-ChildItem automation\screenshots\vehicle-* -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending | Select-Object -First 3 Name, LastWriteTime
```

พร้อมบอกว่า **รันแบบไหน** — Task Scheduler รันเอง หรือสั่งด้วยมือ

**อย่าส่ง** `automation/.env` (มีรหัสผ่าน EPRO) และ **อย่าส่ง** ไฟล์ใน `pages/`

---

## สิ่งที่ตัดออกไปแล้ว (ตรวจเมื่อ 2026-08-14)

ไม่ต้องเสียเวลาไล่ซ้ำ

- **endpoint บน production มีครบ** — `claim`, `vehicle-claim`, `report`, `vehicle-report`
  ตอบ 401 เหมือนกันทั้งสี่ตัว (401 = route มีอยู่ แต่ไม่ได้ส่ง api key)
- **migration ลง production แล้ว** ตาราง `VehicleRequest` และคอลัมน์ `SyncLog.kind` มีอยู่จริง
- **RPA ส่งเข้า EPRO ได้จริง** ทดสอบจากเครื่องพัฒนายิงเข้าฐาน dev สำเร็จ 1 ใบ ยืนยันในเมนู
  รายการขออนุญาตของ EPRO แล้ว (วันที่เก็บเป็น ค.ศ. ถูกต้อง)
- **แต่ยังไม่เคยพิสูจน์เส้นทาง production** คือ `GATEPASS_URL` ชี้ production แล้ว claim + ส่ง

## เอกสารที่เกี่ยวข้อง

- [`error-reference.md`](./error-reference.md) — ความหมายของทุก error และ HTTP code
- [`sync-state-machine.md`](./sync-state-machine.md) — สถานะทั้ง 7 และภาคผนวก 2 (ฝั่งรถ)
- [`../automation/README.md`](../automation/README.md) — วิธีใช้ RPA และเช็คลิสต์เครื่อง cron
