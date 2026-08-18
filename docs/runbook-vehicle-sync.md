# Runbook — RPA ฝั่ง "คำขอนำรถเข้าโรงงาน" ไม่ส่งงาน

เปิดเอกสารนี้เมื่อ **ฝั่งลงทะเบียนแรงงานทำงานปกติ แต่ฝั่งคำขอนำรถไม่ส่ง**

อาการแบบนั้นตัดสาเหตุร่วมออกไปแล้วเกือบหมด — ถ้าฝั่งแรงงานส่งได้ แปลว่า login EPRO,
เครือข่าย/VPN, Playwright, Node/npm, lock, `GATEPASS_URL` และ `INTEGRATION_API_KEY`
ใช้งานได้ทั้งหมด

**แต่ยังไม่ได้ตัด Task Scheduler ออก** — ฝั่งแรงงานทำงานพิสูจน์แค่ว่า task *รัน* ไม่ได้พิสูจน์ว่า
task เรียก runner ตัวที่รู้จักฝั่งรถ นี่คือสาเหตุของเคสแรกจริง ๆ (2026-08-17) จึงต้องเริ่มที่ขั้น 1

**ถ้า `npm run sync:vehicle` ด้วยมือบนเครื่อง server ทำงานได้สมบูรณ์ แต่รอบที่ตั้งเวลาเงียบ**
→ ข้ามไป **ขั้น 1 ได้เลย** เพราะ manual ที่ผ่านตัด env, API key, `GATEPASS_URL`, EPRO,
selector และการมีอยู่ของโค้ดออกทั้งหมด เหลือแค่ "task เรียกอะไร" อย่างเดียว

> ⚠️ **ถ้าดูอีกทีแล้วพบว่า _ทั้งสองฝั่ง_ ไม่ได้ทำงานตามรอบ ไม่ใช่แค่ฝั่งรถ** → ข้ามไป **ขั้น 1.4** เลย
> อาการจะดูเหมือนพังฝั่งรถฝ่ายเดียวเพราะฝั่งรถมีกฎ lead-time 60 นาทีของ EPRO ใบจึงหมดอายุ
> ระหว่างรอ ส่วนฝั่งแรงงานแค่ "มาช้า" ซึ่งไม่มีใครสังเกต และถ้ามีคนเคยสั่ง `npm run sync`
> ด้วยมือ ฝั่งแรงงานจะยิ่งดูเหมือนปกติ **เกณฑ์ที่ใช้แยก: `logs/sync.log` มีบล็อกใหม่
> โผล่เองทุกช่วง repetition หรือไม่** ถ้าไม่มีเลย ปัญหาไม่ได้อยู่ที่ฝั่งใดฝั่งหนึ่ง

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

## ขั้น 1 — Task Scheduler เรียก "ไฟล์ไหน" และไฟล์นั้นใหม่จริงไหม

> ⚠️ **อย่าเริ่มจากการเช็ค `run-sync.ps1`** ครั้งแรกที่เกิดปัญหานี้ (2026-08-17) สาเหตุคือ
> task เรียก `run-sync.cmd` ซึ่งตอนนั้น**ไม่ได้อยู่ใน git** และเรียก `npm run sync` ตรง ๆ
> การเช็ค `run-sync.ps1` จึงเห็นสองบรรทัดครบและ**บอกว่าผ่านทั้งที่ไฟล์นั้นไม่ได้ถูกรันเลย**
> ต้องเริ่มจาก "task เรียกอะไร" เสมอ ไม่ใช่ "ไฟล์ที่เราคิดว่าถูกเรียกมีอะไร"

### 1.1 task เรียกอะไร จากโฟลเดอร์ไหน

```powershell
Get-ScheduledTask | Where-Object { ($_.Actions | ForEach-Object { "$($_.Execute) $($_.Arguments)" }) -match 'run-sync|npm|node' } |
  ForEach-Object { "TASK: $($_.TaskName)  [$($_.State)]"; $_.Actions | ForEach-Object { "  Execute : $($_.Execute)"; "  Args    : $($_.Arguments)"; "  WorkDir : $($_.WorkingDirectory)" } }
```

| ผลที่ได้ | แปลว่า |
|---|---|
| `Execute` ลงท้าย `run-sync.cmd` | ปกติ — ไปข้อ 1.2 |
| `Execute` เป็น `powershell.exe` + `-File ...run-sync.ps1` | ก็ใช้ได้ — ไปข้อ 1.2 (ข้ามการเช็ค `.cmd`) |
| `Execute`/`Args` มี `npm run sync` ตรง ๆ | **นี่คือสาเหตุ** — task ไม่ผ่าน runner จึงไม่มีทางได้ฝั่งรถ → ไปข้อ 1.3 |
| `State` = `Disabled` | task ถูกปิด → `Enable-ScheduledTask -TaskName "<ชื่อ>"` |

จด `WorkDir` ไว้ — **ทุกคำสั่งในขั้นถัดไปต้องรันในโฟลเดอร์นั้น** ไม่ใช่ checkout ที่คุณเคย `git pull`
(เครื่อง sync ใช้ `C:\gatepass\Gate-pass-system\automation`)

### 1.2 ไฟล์ในโฟลเดอร์นั้นใหม่จริงไหม

`run-sync.cmd` เป็นแค่ wrapper ที่ส่งต่อไป `run-sync.ps1` ซึ่งเป็นที่อยู่ของ logic ทั้งหมด
ต้องเช็คทั้งสองไฟล์ เพราะ**ไฟล์เดียวเก่าก็พอที่จะทำให้ฝั่งรถเงียบ**

```powershell
cd <WorkDir จากข้อ 1.1>
git log --oneline -3
Select-String -Path .\run-sync.cmd -Pattern "run-sync.ps1"   # ต้องเจอ 1 บรรทัด
Select-String -Path .\run-sync.ps1 -Pattern "npm run sync"    # ต้องเจอ 2 บรรทัด
npm run                        # ต้องมี sync:vehicle และ sync:vehicle:dry
Test-Path .\epro-sync-vehicle.mjs                             # ต้องเป็น True
```

- `run-sync.cmd` **ไม่มีคำว่า `run-sync.ps1`** (มี `npm run sync` แทน) → ไฟล์เก่าที่ยัง untracked → ข้อ 1.3
- `run-sync.ps1` เจอ **บรรทัดเดียว** → checkout เก่ากว่า PR #4 (merge 2026-08-14 09:14 UTC) → `git pull` ในโฟลเดอร์นี้

### 1.3 ถ้าเป็นไฟล์เก่าที่ยัง untracked

`git pull` จะ **abort** ด้วย `untracked working tree files would be overwritten by merge`
เพราะ repo มี `automation/run-sync.cmd` แล้ว ต้องย้ายของเดิมออกก่อน

```powershell
cd <WorkDir จากข้อ 1.1>
Get-Content .\run-sync.cmd                    # ดูก่อนว่ามันทำอะไรพิเศษไหม (เช่นตั้ง PATH)
Rename-Item .\run-sync.cmd run-sync.cmd.local-backup
git pull
Select-String -Path .\run-sync.cmd -Pattern "run-sync.ps1"   # ต้องเจอแล้ว
```

**ถ้าของเดิมปักพาธเต็มของ npm หรือตั้ง `PATH` ไว้** ปกติไม่ต้องย้ายมาเอง — `run-sync.ps1`
หา npm ให้เองจาก `%ProgramFiles%\nodejs`, `%ProgramFiles(x86)%\nodejs`,
`%LOCALAPPDATA%\Programs\nodejs`, `%APPDATA%\npm` แล้วจะขึ้นใน log ว่า
`npm ไม่อยู่ใน PATH ของ Task Scheduler — ใช้ <path>` ซึ่ง**ไม่ใช่ error** แค่บอกว่าใช้ทางสำรอง

จะเจอ `ไม่พบ npm — ตรวจว่าติดตั้ง Node.js แล้ว...` ก็เฉพาะเมื่อ Node.js ติดตั้งไว้ที่อื่นนอก 4 ที่นั้น
(เช่น nvm) ตอนนั้นให้เอาบรรทัดตั้ง `PATH` จาก `run-sync.cmd.local-backup` มาใส่ก่อนบรรทัด
`powershell.exe` ในไฟล์ใหม่

ทดสอบทันทีโดยไม่ต้องรอ trigger — คำสั่งนี้**ส่งเข้า EPRO จริง** ให้ทำตอนที่พร้อมเฝ้าดู:

```powershell
Start-ScheduledTask -TaskName "<ชื่อ task จากข้อ 1.1>"
Get-Content .\logs\sync.log -Tail 40
```

> ⚠️ **`Start-ScheduledTask` ข้าม trigger** มันพิสูจน์แค่ว่า action (`run-sync.cmd` →
> `run-sync.ps1` → npm) ทำงานได้ **ไม่ได้พิสูจน์ว่าตารางเวลาทำงาน** ถ้าผ่านตรงนี้แล้วรอบ
> ที่ตั้งเวลายังเงียบ ให้ไปขั้น 1.4

### ขั้น 1.4 — trigger ตั้งไว้แต่ไม่รันเลย (repetition ขาด Duration)

เคสจริง 2026-08-18: task ชี้ไฟล์ถูก ไฟล์ใหม่ครบ `State` = `Ready` `LastTaskResult` = `0`
`NextRunTime` ก็ดูปกติ แต่ **task ไม่เคยรันเองเลยตั้งแต่สร้าง** เพราะ trigger เป็น

```xml
<Repetition><Interval>PT10M</Interval></Repetition>   <!-- ไม่มี <Duration> -->
```

`<Interval>` ที่ไม่มี `<Duration>` คู่กันจะ**ไม่ถูกรัน** วัดเทียบสองตัวที่ต่างกันแค่บรรทัดนี้:

| trigger | ผล |
|---|---|
| มี `<Duration>P1D</Duration>` | `LastTaskResult` = `0` — รันตามรอบจริง |
| ไม่มี `<Duration>` | `LastTaskResult` = `267011` (`SCHED_S_TASK_HAS_NOT_RUN`) — ไม่รันเลย |

**สิ่งที่ทำให้จับยาก: ทั้งสองแบบรายงาน `NextRunTime` ตรงตามรอบเหมือนกัน** Task Scheduler
เดิน `NextRunTime` ให้ต่อไปแม้เป็น repetition ที่มันไม่รัน ทั้งหน้า GUI, tab Triggers และ
`Get-ScheduledTaskInfo` จึงดูปกติหมด ตัวที่ฟ้องคือ **`LastRunTime`/`LastTaskResult` ที่ไม่ขยับ**

ตรวจ:
```powershell
Export-ScheduledTask -TaskName "<ชื่อ task>"
```
ใน `<Repetition>` **ต้องมี `<Duration>`** ถ้ามี `<Interval>` — และดูให้ตรงว่าเป็น `<Duration>`
ที่อยู่ใน `<Repetition>` ไม่ใช่ตัวใน `<IdleSettings>` (task ที่พังก็มี `<Duration>` ใต้
`<IdleSettings>` อยู่แล้ว การ grep หาคำว่า `Duration` เฉย ๆ จึงผ่านทั้งที่พัง)

แก้ด้วยการลงทะเบียนใหม่จากนิยามที่อยู่ในรีโป (ต้อง **Run as Administrator**):
```powershell
cd <WorkDir จากข้อ 1.1>
.\register-task.ps1                      # ทุก 15 นาที (ค่าเริ่มต้น)
```
สคริปต์ตรวจผลงานตัวเองด้วย `Export-ScheduledTask` แล้ว throw ถ้า `<Duration>` ไม่ติด
จึงไม่มีทางลงทะเบียน trigger ที่พังแบบเดิมได้อีก

ยืนยันว่า**หายจริง** ต้องปล่อยให้ถึงรอบเอง ห้ามใช้ `Start-ScheduledTask`:
```powershell
Get-ScheduledTask -TaskName "<ชื่อ task>" | Get-ScheduledTaskInfo
```
`LastTaskResult` ต้องเปลี่ยนจาก `267011` เป็น `0` เอง และ `logs\sync.log` ต้องมีบล็อกใหม่
โผล่เองทุก ~15 นาที

---

## ขั้น 2 — อ่าน log บล็อกล่าสุด

```powershell
cd <checkout บน server>\automation
Get-Content logs\sync.log -Tail 80      # ทั้งสองฝั่ง เรียงตามเวลา
Get-Content logs\vehicle.log -Tail 40   # ฝั่งรถล้วน
Get-Content logs\worker.log -Tail 40    # ฝั่งแรงงานล้วน
```

`sync.log` มีทั้งสองฝั่งคั่นด้วย `----- ฝั่งแรงงาน -----` / `----- ฝั่งรถ -----` ส่วน
`worker.log` กับ `vehicle.log` แยกไว้ให้ตามอ่านฝั่งเดียวได้โดยไม่มี output อีกฝั่งปนมา
(ไฟล์แยกสองตัวนี้มีขึ้นเพื่อ**ไม่ต้อง**สร้าง scheduled task ที่สอง — runner สองตัวจะแย่ง
write handle ของ `sync.log` และแย่ง session EPRO กัน)

> ถ้าสั่ง `npm run sync:vehicle` ด้วยมือ **ผลจะออกหน้าจอ ไม่ลงไฟล์ log ใด ๆ** — ให้ก๊อปข้อความบนจอมาดูแทน
> ไฟล์ log มีแค่รอบที่ Task Scheduler รัน

### บรรทัดปิดของบล็อกบอกอะไร

| บรรทัดปิด | แปลว่า |
|---|---|
| **ไม่มีบล็อกใหม่เลย** ตั้งแต่เวลาที่ควรรัน | `run-sync.ps1` ไม่เคยเริ่มทำงาน → task เรียกอย่างอื่น หรือ task ไม่ trigger → **กลับไปขั้น 1** และดู `Get-ScheduledTaskInfo` ด้านล่าง |
| มีแต่ output ฝั่งแรงงาน ปิดด้วย `จบ sync (exit N)` | **สคริปต์เก่า** — pull ก่อน PR #4 ฝั่งรถไม่เคยถูกเรียก → กลับไปขั้น 1.2 |
| `จบ sync (แรงงาน exit X, รถ exit Y)` | สคริปต์ใหม่ทำงานแล้ว → ดูตารางถัดไป |
| `ข้ามรอบนี้ — sync ก่อนหน้ายังทำงานอยู่` ทุกรอบ | มี process ค้างถือ lock อยู่ → ดู `Get-Process node, chrome` แล้วปิดตัวที่ค้าง |

ถ้าไม่มีบล็อกใหม่เลย ให้ดูว่า task รันแล้วล้มเหลวก่อนถึงสคริปต์หรือไม่:

```powershell
Get-ScheduledTask -TaskName "<ชื่อ task>" | Get-ScheduledTaskInfo
```

| ผล | แปลว่า |
|---|---|
| `LastTaskResult` = `267011` | `SCHED_S_TASK_HAS_NOT_RUN` — **ยังไม่เคยรันเลย** มักเป็น repetition ที่ขาด `<Duration>` → **ขั้น 1.4** |
| `LastRunTime` เก่ามาก / ว่าง | trigger ไม่ทำงาน → **ขั้น 1.4** |
| `LastRunTime` ตรงกับเวลาที่เคยสั่ง `Start-ScheduledTask` ด้วยมือเท่านั้น | trigger ไม่เคยยิงเอง manual run ปิดบังไว้ → **ขั้น 1.4** |
| `NextRunTime` ห่างเป็นหลักชั่วโมง ทั้งที่ควรทุก 15 นาที | trigger ไม่ได้ตั้ง repetition ไว้ → **ขั้น 1.4** |
| `NextRunTime` ดูถูกต้อง แต่ `LastRunTime` ไม่ขยับ | **ค่านี้เชื่อไม่ได้** — Task Scheduler เดิน `NextRunTime` ให้แม้ repetition ที่ไม่รัน → **ขั้น 1.4** |
| `LastTaskResult` = `0` แต่ log ไม่ขยับ | task รันสิ่งที่ไม่ใช่ runner ของเรา → ขั้น 1.1 |
| `LastTaskResult` ไม่ใช่ `0` และไม่ใช่ `267011` | ล้มเหลวก่อนถึงสคริปต์ — path ผิด, บัญชีที่รันไม่มีสิทธิ์, หรือ `Execute` ไม่มีไฟล์นั้น |

### ข้อความในบล็อก → สาเหตุ → วิธีแก้

| ข้อความที่เห็น | สาเหตุ | ทำอะไร |
|---|---|---|
| `ไม่มีคำขอนำรถเข้าที่ต้องส่ง — จบการทำงาน` | ไม่มีใบ `ยืนยันแล้ว` | ไม่ใช่บั๊ก — ให้ admin ยืนยันใบก่อน |
| `npm ไม่อยู่ใน PATH ของ Task Scheduler — ใช้ <path>` | **ไม่ใช่ error** — PATH ที่ task ได้ไม่มี Node.js สคริปต์หาเจอเองแล้วใช้ต่อ | ไม่ต้องทำอะไร |
| `ไม่พบ npm — ตรวจว่าติดตั้ง Node.js แล้ว...` | Node.js อยู่นอก 4 ที่มาตรฐาน (เช่น nvm) → **ทั้งสองฝั่งหยุด ไม่ใช่แค่ฝั่งรถ** | เอาบรรทัดตั้ง `PATH` จาก `run-sync.cmd.local-backup` มาใส่ก่อนบรรทัด `powershell.exe` ใน `run-sync.cmd` |
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
# task เรียกอะไร (สำคัญที่สุด — อย่าข้าม)
Get-ScheduledTask | Where-Object { ($_.Actions | ForEach-Object { "$($_.Execute) $($_.Arguments)" }) -match 'run-sync|npm|node' } |
  ForEach-Object { "TASK: $($_.TaskName)  [$($_.State)]"; $_.Actions | ForEach-Object { "  $($_.Execute) $($_.Arguments)"; "  WorkDir: $($_.WorkingDirectory)" }; $_ | Get-ScheduledTaskInfo | Select-Object LastRunTime, LastTaskResult, NextRunTime }

cd <WorkDir ที่ได้จากคำสั่งข้างบน>
git log --oneline -3
git status --short                              # ไฟล์ที่แก้ค้าง/untracked ในโฟลเดอร์นี้
Select-String -Path .\run-sync.cmd, .\run-sync.ps1 -Pattern "npm run sync|run-sync.ps1"
node ..\scripts\check-rpa-env.mjs
Get-Content .\logs\sync.log -Tail 80

# นิยาม trigger ตัวจริง (ขั้น 1.4 — <Repetition> ต้องมี <Duration>)
Export-ScheduledTask -TaskName "<ชื่อ task>"
Get-ChildItem .\screenshots\vehicle-* -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending | Select-Object -First 3 Name, LastWriteTime
```

> ใช้ `Select-String` อ่าน**ไฟล์บนดิสก์** ไม่ใช่ `git show HEAD:...` เพราะ `git show` แสดง
> เวอร์ชันที่ commit ไว้ ไม่ใช่ไฟล์ที่ Task Scheduler รันจริง ถ้ามีใครแก้ไฟล์บนเครื่อง server
> หรือไฟล์นั้น untracked (เคสจริง 2026-08-17) `git show` จะรายงานผลที่ไม่เกี่ยวกับความจริงเลย

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
