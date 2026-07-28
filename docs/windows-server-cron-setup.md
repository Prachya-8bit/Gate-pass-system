> **สถานะ:** ยังไม่ได้ตั้งค่าจริง — เอกสารนี้เป็น runbook สำหรับย้าย EPRO sync จาก WSL2 crontab (เครื่อง dev) ไปรันถาวรบน **Windows Server 2019** ตามที่ตัดสินใจไว้ (2026-07-27)

# ตั้งค่า EPRO Sync บน Windows Server 2019

เอกสารนี้แทนที่ขั้นตอนแบบ WSL2 (`automation/run-sync.sh` + crontab) ด้วยขั้นตอนสำหรับ Windows Server โดยใช้ **Task Scheduler** แทน `cron`/`flock`

## สิ่งที่ต้องมีบนเครื่อง Server

| อย่าง | หมายเหตุ |
|---|---|
| Node.js LTS (20.x ขึ้นไป) | ติดตั้งจาก [nodejs.org](https://nodejs.org) — เลือกตัว MSI |
| Git | สำหรับ `git pull` โค้ดใหม่ |
| เข้าถึง `eprocurement.syssteel.com` ได้ | อยู่ใน network/VPN บริษัท |
| เข้าถึง Gate Pass บน Vercel ได้ | `https://gate-pass-system-lac.vercel.app` (ไม่ต้องรัน dev server บน Server นี้) |
| บัญชี epro ของผู้ที่ sync แทน | user/password จริงที่ใช้ log-in `eprocurement.syssteel.com` |

## 1. ดึงโค้ดลงเครื่อง Server

```powershell
cd C:\gatepass
git clone git@github.com:Prachya-8bit/Gate-pass-system.git .
# รอบถัดไป: git pull origin main
```

> โฟลเดอร์ตัวอย่างในเอกสารนี้คือ `C:\gatepass` — ถ้าใช้ path อื่นให้แก้ตามใน `run-sync.ps1`

## 2. ติดตั้ง dependencies + Playwright

```powershell
cd C:\gatepass\automation
npm install
npx playwright install chromium
```

## 3. ตั้งค่า `.env`

```powershell
copy .env.example .env
notepad .env
```

กรอกค่าเหล่านี้ — **ต่างจากเครื่อง dev ตรงที่ `GATEPASS_URL` ต้องชี้ไป production** เพราะ Server นี้ไม่ได้รัน `npm run dev`:

```env
EPRO_USERNAME="..."
EPRO_PASSWORD="..."
EPRO_PLANT="4911"
EPRO_APPROVER="..."
EPRO_REQ_TEL=""

GATEPASS_URL="https://gate-pass-system-lac.vercel.app"
INTEGRATION_API_KEY="<คีย์ฝั่ง production ไม่ใช่ตัว dev>"
```

## 4. ทดสอบด้วยมือก่อนตั้งเวลาอัตโนมัติ

> ต้องอยู่ใน `automation/` ก่อนรัน — ถ้ารันจาก root ของ repo จะเจอ `Missing script: "sync:dry"` เพราะ script นี้อยู่ใน `automation/package.json` ไม่ใช่ package.json ของ Next.js ที่ root

```powershell
cd C:\gatepass\automation
npm run sync:dry    # ดูว่า login + กรอกฟอร์มได้ ไม่กด submit จริง
npm run sync         # รันจริงหนึ่งรอบ ดูด้วยตาว่า browser ทำงานถูกต้อง
```

ผ่านทั้งสองอย่างแล้วค่อยไปตั้ง Task Scheduler

## 5. สคริปต์ wrapper — `automation/run-sync.ps1`

ไฟล์นี้ทำหน้าที่เดียวกับ `run-sync.sh` บน WSL2 (รันแบบ headless + log ผลลง log) อยู่ในโฟลเดอร์ `automation/` แล้ว ดูเนื้อหาที่ [`automation/run-sync.ps1`](../automation/run-sync.ps1)

**หมายเหตุเรื่อง lock:** บน WSL2 ใช้ `flock` กันไม่ให้สองรอบทับกัน — Windows Task Scheduler มี setting `Do not start a new instance` ในตัวอยู่แล้ว (ขั้นตอนที่ 6) จึงไม่ต้องเขียน lock เองในสคริปต์

## 6. ตั้ง Task Scheduler

**วิธี GUI:**

1. เปิด Task Scheduler → Create Task (ไม่ใช่ Basic Task เพราะต้องปรับ setting เพิ่ม)
2. **General:** ตั้งชื่อ `GatePass EPRO Sync`, เลือก "Run whether user is logged on or not", ติ๊ก "Run with highest privileges"
3. **Triggers:** New → Begin the task: On a schedule → Daily, Repeat task every **15 minutes**, for a duration of **Indefinitely**
4. **Actions:** New → Start a program
   - Program/script: `powershell.exe`
   - Add arguments: `-ExecutionPolicy Bypass -File "C:\gatepass\automation\run-sync.ps1"`
5. **Conditions:** ปิด "Start the task only if the computer is on AC power" (Server ไม่มีแบต แต่เผื่อ default เปลี่ยน)
6. **Settings:**
   - ติ๊ก "If the task fails, restart every" → 5 minutes, up to 3 times
   - **"If the task is already running, then the following rule applies" → เลือก "Do not start a new instance"** (นี่คือตัวแทน `flock`)

**วิธี command line (เทียบเท่า GUI ด้านบน):**

```powershell
schtasks /create /tn "GatePass EPRO Sync" /tr "powershell.exe -ExecutionPolicy Bypass -File C:\gatepass\automation\run-sync.ps1" /sc minute /mo 15 /ru SYSTEM /rl highest
```

> `/ru SYSTEM` รันโดยไม่ต้อง log-in ค้างไว้ — ถ้าต้องการ credential อื่นเปลี่ยน `/ru` เป็น `/ru <user> /rp <password>`

## 7. ตรวจว่าทำงานจริง

```powershell
Get-Content C:\gatepass\automation\logs\sync.log -Tail 40 -Wait
```

ดูว่ามีบรรทัด `เริ่ม sync` / `จบ sync (exit 0)` ทุก ~15 นาที และเช็คหน้า Admin dashboard ว่า Badge เปลี่ยนเป็น "ส่งแล้ว" ตามจริง

## เรื่อง multi-machine ที่เคยกังวลไว้ (2026-07-21)

ตอนนั้นกันซ้ำด้วย `submitted.json` ซึ่งเป็นไฟล์ local — ถ้ามีสองเครื่องรันพร้อมกันมีความเสี่ยงส่งซ้ำ **ปัญหานี้แก้แล้วโดย state machine** (`POST /api/integration/claim` ใช้ compare-and-set ที่ฐานข้อมูลกลาง — สองเครื่องแย่งกัน claim ใบงานเดียวกัน มีแค่เครื่องเดียวที่ได้ ดู `docs/sync-state-machine.md` ส่วน "หัวใจของงานนี้") ดังนั้นเทคนิคแล้วรันสองเครื่องพร้อมกันไม่ทำให้ข้อมูลซ้ำ แต่ **แนะนำปิด WSL2 crontab ตอนย้ายมา Server นี้เสร็จ** เพื่อไม่ให้ log กระจายสองที่และไม่เปลืองการ claim แย่งกันเปล่าๆ:

```bash
# บนเครื่อง WSL2 เดิม
crontab -e   # ลบหรือคอมเมนต์บรรทัด run-sync.sh ออก
```

## Checklist ก่อนตัดขาด WSL2

- [ ] `npm run sync` รันด้วยมือบน Server สำเร็จอย่างน้อย 1 รอบ
- [ ] Task Scheduler ตั้งแล้ว เห็น log วิ่งเอง 2-3 รอบติดกัน
- [ ] เช็ค Admin dashboard ว่า record ที่ยืนยันแล้วถูก sync จริง
- [ ] ปิด crontab บน WSL2
- [ ] อัปเดตเมโมรี/เอกสารว่าเครื่องที่รันจริงคือ Server ตัวไหน (ชื่อเครื่อง/IP ภายใน) เผื่อคนอื่นต้องมาดู log
