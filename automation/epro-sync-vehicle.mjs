// Gate Pass → epro sync สำหรับ "ขออนุมัตินำรถยนต์เข้ามาปฏิบัติงานภายในโรงงาน"
//
// แยกไฟล์จาก epro-sync.mjs โดยเจตนา ไม่รวมเป็นสคริปต์เดียว เพราะสองเส้นทางแชร์กัน
// แค่ login การรวมไฟล์ทำให้ exception ฝั่งรถอาจล้ม run ของคนงานที่กำลังจะ submit
// การให้ epro-sync.mjs เหมือนเดิมทุก byte มีค่ามากกว่าโค้ด boilerplate ที่ซ้ำ
//
// แต่ต้องรันภายใต้ flock เดียวกันกับฝั่งคนงาน (run-sync.sh เรียกต่อกัน) เพราะ lock
// มีอยู่เพื่อกันไม่ให้มี browser สองตัว login บัญชี epro เดียวกันพร้อมกัน
//
// Usage:
//   npm run sync:vehicle:dry   — login + กรอกใบแรกให้ดู ไม่กด Save
//   npm run sync:vehicle       — รันจริง

import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { hostname } from 'os';
import { login, vehicleForm, eproProvinceValue } from './selectors.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const screenshotDir = join(here, 'screenshots');
const dryRun = process.argv.includes('--dry-run');
const runId = `${hostname()}-${Date.now()}`;

function requireEnv(name, hint) {
  const v = process.env[name];
  if (!v) {
    console.error(`ยังไม่ได้ตั้งค่า ${name} ใน .env${hint ? ` — ${hint}` : ''}`);
    process.exit(1);
  }
  return v;
}

const EPRO_USERNAME = requireEnv('EPRO_USERNAME');
const EPRO_PASSWORD = requireEnv('EPRO_PASSWORD');
const EPRO_APPROVER = requireEnv('EPRO_APPROVER', 'ดู value ของผู้อนุมัติในคอมเมนต์ selectors.mjs');
const EPRO_REQ_TEL = process.env.EPRO_REQ_TEL ?? '';
const GATEPASS_URL = process.env.GATEPASS_URL ?? 'http://localhost:4009';
const API_KEY = requireEnv('INTEGRATION_API_KEY');
const HEADLESS = process.env.HEADLESS === 'true' || process.env.HEADLESS === '1';

// กฎของ epro: เวลาเริ่มต้องห่างจากตอนกด Save อย่างน้อย 1 ชั่วโมง
const LEAD_MINUTES = 60;

// ปฏิเสธการรันถ้ายังมี selector ที่เป็น placeholder
const flat = (obj, prefix = '') =>
  Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? flat(v, `${prefix}${k}.`) : [[`${prefix}${k}`, v]],
  );
const unresolved = [...flat(login), ...flat(vehicleForm)].filter(([, v]) => v === '#TODO');
if (unresolved.length > 0) {
  console.error('selectors.mjs: vehicleForm ยังมีช่องที่เป็น #TODO — ต้องเก็บหน้าฟอร์มรถมาเติมก่อน:');
  for (const [k] of unresolved) console.error(`  - ${k}`);
  console.error('  วิธีเก็บ: npm run capture -- --menu "นำรถยนต์" --name FrmVehicle');
  process.exit(1);
}

const toDMY = (iso) => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

// เวลาไทยเป็น UTC+7 ตายตัว — เครื่องที่รันอยู่ในไทยแต่ไม่พึ่ง timezone ของ OS
const thaiInstant = (date, time) =>
  new Date(new Date(`${date}T${time}:00.000Z`).getTime() - 7 * 60 * 60 * 1000);

async function reportWithRetry(batchKey, result, error, errorClass) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${GATEPASS_URL}/api/integration/vehicle-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
        body: JSON.stringify({ runId, batchKey, result, error, errorClass: errorClass || null }),
      });
      if (res.ok) return;
      console.error(`  report ครั้งที่ ${attempt} ไม่สำเร็จ (HTTP ${res.status})`);
    } catch (e) {
      console.error(`  report ครั้งที่ ${attempt} ล้มเหลว: ${e.message}`);
    }
    if (attempt < 3) await new Promise((r) => setTimeout(r, 2000));
  }
  console.error('  ⚠️ report ไม่สำเร็จหลังจากลอง 3 ครั้ง — reaper จะเปลี่ยนเป็น NEEDS_REVIEW ให้เอง');
}

const browser = await chromium.launch({ headless: HEADLESS });
const page = await browser.newPage();

// เก็บข้อความ dialog ที่ epro เด้งขึ้นมา แล้วกด OK ให้
// สำคัญ: ถ้ามี dialog โผล่ "หลัง" กด Save แปลว่า validation ไม่ผ่าน ห้ามรายงาน ok
let lastDialog = null;
page.on('dialog', (d) => {
  lastDialog = d.message();
  console.log(`  [dialog] ${lastDialog}`);
  d.accept();
});

async function openVehicleForm() {
  await page.goto(vehicleForm.url, { waitUntil: 'domcontentloaded' });
  const found = await page.locator(vehicleForm.loadedIndicator).count();
  if (found === 0) {
    // เปิด URL ตรงได้ตอนเก็บ selector แต่ถ้า epro เปลี่ยนพฤติกรรม อย่าพิมพ์อะไรลงไป
    throw new Error('vehicle form selector not found — เปิดหน้าฟอร์มรถยนต์ไม่ได้');
  }
}

try {
  console.log(`เปิดหน้า login: ${login.url}`);
  await page.goto(login.url);
  await page.fill(login.usernameInput, EPRO_USERNAME);
  await page.fill(login.passwordInput, EPRO_PASSWORD);
  await page.click(login.submitButton);
  await page.waitForSelector(login.loggedInIndicator, { timeout: 20_000 });
  console.log('login สำเร็จ');

  let totalSubmitted = 0;

  for (let cycle = 0; cycle < 20; cycle++) {
    const claimRes = await fetch(`${GATEPASS_URL}/api/integration/vehicle-claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
      body: JSON.stringify({ runId }),
    });
    if (!claimRes.ok) {
      if (claimRes.status === 404) {
        console.log('ยังไม่มี endpoint vehicle-claim บนเซิร์ฟเวอร์ (HTTP 404) — ข้ามการส่งรถรอบนี้');
        break;
      }
      if (claimRes.status >= 500) {
        console.error(`claim ล้มเหลว HTTP ${claimRes.status} — ข้ามรอบนี้ รอ cron รอบถัดไป`);
        break;
      }
      console.error(`claim ล้มเหลว HTTP ${claimRes.status} — ตรวจ API key / GATEPASS_URL`);
      process.exit(1);
    }

    const { batchKey, vehicle } = await claimRes.json();
    if (!vehicle) {
      console.log('ไม่มีคำขอนำรถเข้าที่ต้องส่ง — จบการทำงาน');
      break;
    }

    console.log(
      `\n[คำขอ ${cycle + 1}] ${vehicle.plateNumber} ${vehicle.plateProvince} | ` +
        `${vehicle.startDate} ${vehicle.startTime} → ${vehicle.endDate} ${vehicle.endTime}`,
    );

    // ── pre-flight: กฎ 1 ชั่วโมงของ epro ──
    // ถ้าเวลาเริ่มเหลือน้อยกว่า 1 ชม. แล้ว epro จะปฏิเสธแน่ ๆ และ retry ยิ่งแย่ลง
    // เพราะเวลาเดินหน้า จึงไม่ส่งเลยและรายงานเป็น permanent เพื่อตัด auto-retry
    const startAt = thaiInstant(vehicle.startDate, vehicle.startTime);
    const minsLeft = Math.floor((startAt.getTime() - Date.now()) / 60_000);
    if (minsLeft < LEAD_MINUTES) {
      // เขียนเป็น template literal เดียว ไม่ต่อด้วย + เพื่อให้ grep หาข้อความที่เห็นใน
      // log แล้วเจอในซอร์ส — ข้อความที่ถูกต่อคนละบรรทัดหาไม่เจอตอนต้อง debug
      const msg = `เวลาเริ่มเหลือ ${minsLeft} นาที (น้อยกว่า ${LEAD_MINUTES} นาที) epro จะไม่รับคำขอนี้ — ต้องให้ผู้รับเหมายื่นใบใหม่`;
      console.error(`  ✗ ข้ามและรายงานว่าล้มเหลวถาวร: ${msg}`);
      await reportWithRetry(batchKey, 'failed', msg, 'permanent');
      continue;
    }

    let submitClicked = false;
    try {
      await openVehicleForm();

      const h = vehicleForm.header;
      const v = vehicleForm.vehicle;

      // หมายเหตุ: การ fill ช่องวันที่ทำให้ปฏิทินของ epro เปิดค้างไว้และปิดไม่ลง
      // (ลองแล้วทั้ง blur, Escape, คลิกพื้นที่ว่าง — ไม่ปิด) แต่เป็นเรื่องหน้าตาเท่านั้น:
      // ค่าใน input ถูกต้อง (dry-run อ่านกลับมายืนยันทุกรอบ) และปฏิทินอยู่เหนือปุ่ม Save
      // ไม่ทับ — dry-run มีการตรวจว่าปุ่ม Save ไม่ถูกอะไรทับก่อนจบด้วย
      await page.selectOption(h.plantSelect, vehicle.plant);
      await page.fill(h.startDate, toDMY(vehicle.startDate));
      const [sh, sm] = vehicle.startTime.split(':');
      await page.selectOption(h.startHour, sh);
      await page.selectOption(h.startMin, sm);
      await page.fill(h.endDate, toDMY(vehicle.endDate));
      const [eh, em] = vehicle.endTime.split(':');
      await page.selectOption(h.endHour, eh);
      await page.selectOption(h.endMin, em);
      await page.fill(h.company, vehicle.company);

      await page.fill(v.driverName, vehicle.driverName);
      await page.fill(v.plateNumber, vehicle.plateNumber);
      // value ของ option ห่อด้วย NBSP — ห่อกลับก่อนเลือก
      await page.selectOption(v.provinceSelect, eproProvinceValue(vehicle.plateProvince));
      await page.fill(v.location, vehicle.location);
      await page.fill(v.reason, vehicle.reason);
      // เบอร์ที่ผู้รับเหมากรอกมามีประโยชน์กว่าค่า env เพราะช่องผู้ขออนุญาตถูก
      // pre-fill เป็นชื่อบัญชี epro ที่ใช้ login ไม่ใช่ชื่อผู้รับเหมา
      const tel = vehicle.contactTel || EPRO_REQ_TEL;
      if (tel) await page.fill(v.requesterTel, tel);

      await page.selectOption(h.approverSelect, EPRO_APPROVER);

      if (dryRun) {
        // อ่านค่ากลับจากฟอร์มจริง ดีกว่าให้คนเพ่งหน้าจอ — dropdown ที่เลือกไม่ติด
        // จะโชว์เป็นค่าว่างให้เห็นชัด (เช่น จังหวัดที่ห่อ NBSP ผิด หรือนาทีที่ epro ไม่มี)
        const val = (sel) => page.inputValue(sel).catch(() => '<อ่านไม่ได้>');
        const picked = (sel) =>
          page
            .locator(`${sel} option:checked`)
            .first()
            .innerText()
            .then((t) => t.trim())
            .catch(() => '<ไม่มีอะไรถูกเลือก>');

        const readback = {
          'โรงงาน (ddlPlant)': await picked(h.plantSelect),
          'วันที่เริ่ม': await val(h.startDate),
          'เวลาเริ่ม ชม.': await picked(h.startHour),
          'เวลาเริ่ม นาที': await picked(h.startMin),
          'วันที่สิ้นสุด': await val(h.endDate),
          'เวลาสิ้นสุด ชม.': await picked(h.endHour),
          'เวลาสิ้นสุด นาที': await picked(h.endMin),
          'ชื่อบริษัท': await val(h.company),
          'ชื่อพนักงานขับรถ': await val(v.driverName),
          'เลขทะเบียน': await val(v.plateNumber),
          'จังหวัด (ddlProvience)': await picked(v.provinceSelect),
          'สถานที่ปฏิบัติงาน': await val(v.location),
          'เหตุผล': await val(v.reason),
          'เบอร์ติดต่อ': await val(v.requesterTel),
          'ผู้อนุมัติ (ddlSM)': await picked(h.approverSelect),
        };

        console.log('\n[dry-run] ค่าที่อ่านกลับจากฟอร์ม epro จริง:');
        const width = Math.max(...Object.keys(readback).map((k) => k.length));
        const blanks = [];
        for (const [k, valRead] of Object.entries(readback)) {
          const shown = valRead === '' ? '<ว่าง>' : valRead;
          if (valRead === '' || valRead.startsWith('<')) blanks.push(k);
          console.log(`  ${k.padEnd(width)}  ${shown}`);
        }

        // เตือนเรื่องปีแบบอ่านออก — พ.ศ. จะไม่ error แต่ข้อมูลผิด 543 ปี
        const year = (readback['วันที่เริ่ม'] || '').split('/')[2];
        const expectYear = vehicle.startDate.slice(0, 4);
        console.log(
          `\n  ปีในช่องวันที่ = ${year || '?'} (คาดว่าเป็น ค.ศ. ${expectYear}) → ` +
            (year === expectYear ? 'ค.ศ. ถูกต้อง' : '⚠️ ไม่ตรง! ตรวจว่า epro ใช้ พ.ศ. หรือไม่'),
        );
        if (blanks.length > 0) {
          console.log(`\n  ⚠️ ช่องที่ยังว่าง/อ่านไม่ได้: ${blanks.join(', ')}`);
        } else {
          console.log('\n  ✅ ทุกช่องมีค่าครบ ไม่มี dropdown ที่เลือกไม่ติด');
        }

        // ปฏิทินของ epro เปิดค้างหลังกรอกวันที่ — ตรวจว่ามันไม่ทับปุ่ม Save
        // ถ้าทับ การกด submit ตอนรันจริงจะพลาดหรือไปโดน element อื่น
        const saveClickable = await page
          .locator(vehicleForm.submitButton)
          .evaluate((el) => {
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) return 'ปุ่มไม่มีขนาด (ซ่อนอยู่?)';
            const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            return top === el || el.contains(top) ? 'ok' : `ถูกทับด้วย <${top?.tagName ?? '?'}>`;
          })
          .catch((e) => `ตรวจไม่ได้: ${e.message}`);
        console.log(
          `  ปุ่ม Save: ${saveClickable === 'ok' ? '✅ กดได้ ไม่มีอะไรทับ' : `⚠️ ${saveClickable}`}`,
        );

        mkdirSync(screenshotDir, { recursive: true });
        const shot = join(screenshotDir, `vehicle-dryrun-${Date.now()}.png`);
        await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
        console.log(`\n[dry-run] ภาพหน้าจอ: ${shot}`);
        if (!HEADLESS) {
          console.log('[dry-run] ค้างหน้านี้ไว้ 90 วินาที (ปิดหน้าต่างเพื่อข้ามได้)');
          // ต้องดักไว้เอง: ถ้าผู้ใช้ปิดหน้าต่างก่อนครบเวลา waitForTimeout จะ throw
          // ถ้าปล่อยหลุดไปถึง catch ด้านล่าง มันจะรายงานใบนี้เป็น "ไม่สำเร็จ"
          // ทั้งที่ dry-run ไม่ได้ส่งอะไรเข้า epro เลย — ผู้ใช้ปิดหน้าต่างไม่ใช่ความล้มเหลว
          await page.waitForTimeout(90_000).catch(() => {
            console.log('[dry-run] หน้าต่างถูกปิดก่อนครบเวลา — ไม่ถือเป็นความล้มเหลว');
          });
        }
        console.log('[dry-run] ไม่ได้กดบันทึก คำขอยังอยู่สถานะ "กำลังส่ง"');
        console.log('[dry-run] จะส่งใบนี้ใหม่: กด "ยังไม่ส่ง" บนหน้า admin หรือรอ reaper 30 นาที');
        break;
      }

      lastDialog = null;
      submitClicked = true; // ตั้งก่อน click: throw ใน click เอง (nav race) ก็ต้องนับว่าไม่แน่นอน
      await page.click(vehicleForm.submitButton);
      await page.waitForLoadState('networkidle');

      // ถ้า epro เด้ง alert หลังกด Save แปลว่า validation ไม่ผ่าน ห้ามรายงาน ok
      // ไม่งั้นแถวจะกลายเป็น "ส่งแล้ว" ทั้งที่ epro ไม่ได้บันทึกอะไร
      if (lastDialog) {
        throw new Error(`epro validation ไม่ผ่าน: ${lastDialog}`);
      }

      await reportWithRetry(batchKey, 'ok');
      totalSubmitted += 1;
      console.log('  บันทึกคำขอแล้ว');
    } catch (err) {
      mkdirSync(screenshotDir, { recursive: true });
      const shot = join(screenshotDir, `vehicle-error-${cycle}-${Date.now()}.png`);
      await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
      console.error(`ภาพหน้าจอตอนพัง: ${shot}`);

      const msg = err?.message || String(err);
      if (submitClicked) {
        // กด Save ไปแล้ว ผลไม่แน่นอน ต้องให้คนไปเช็คใน epro
        // ห้ามรายงาน failed เพราะ failed retry ได้ = เสี่ยงส่งซ้ำ
        await reportWithRetry(batchKey, 'unknown', msg, 'retryable');
        console.error(`  ✗ ไม่ทราบผล: ${msg}`);
      } else {
        // ยังไม่ได้กด Save = ไม่มีอะไรถูกบันทึก ปลอดภัยที่จะลองใหม่
        // ยกเว้นถ้าเป็นปัญหา selector/validation/login ที่ลองใหม่ก็ไม่หาย
        const permanent = /selector|validation|login/i.test(msg);
        await reportWithRetry(batchKey, 'failed', msg, permanent ? 'permanent' : 'retryable');
        console.error(`  ✗ ล้มเหลว (${permanent ? 'ถาวร' : 'ลองใหม่ได้'}): ${msg}`);
      }
      // ห้ามหยุด loop — ไปทำคำขอต่อไป
    }
  }

  if (!dryRun) console.log(`\nเสร็จสิ้น — ส่ง ${totalSubmitted} คำขอ`);
} catch (err) {
  mkdirSync(screenshotDir, { recursive: true });
  const shot = join(screenshotDir, `vehicle-error-${Date.now()}.png`);
  await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
  console.error('\nเกิดข้อผิดพลาด หยุดการทำงานทันทีเพื่อกันข้อมูลซ้ำ/ผิด');
  console.error(`ภาพหน้าจอตอนพัง: ${shot}`);
  console.error(err);
  process.exitCode = 1;
} finally {
  await browser.close();
}
