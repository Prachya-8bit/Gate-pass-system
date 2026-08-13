// Gate Pass → eprocurement sync (state-machine claim/report pattern).
//
// Each run generates a unique runId, then loops:
//   1. POST /claim → server returns one work order (grouped company+date+zone) + workers
//   2. Fill the epro form via Playwright (login + header + add workers)
//   3. Click submit
//   4. POST /report → server records the outcome
//
// The server handles grouping, dedup (compare-and-set), retry backoff,
// and stale-claim reaping — RPA just executes one work order at a time.
//
// Usage:
//   npm run sync:dry   — login + fill the first work order, never submits
//   npm run sync       — real run

import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { hostname } from 'os';
import { login, regForm } from './selectors.mjs';

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
const EPRO_PLANT = process.env.EPRO_PLANT ?? '4911'; // SYS-MTP
const EPRO_APPROVER = requireEnv('EPRO_APPROVER', 'ดู value ของผู้อนุมัติในคอมเมนต์ selectors.mjs');
const EPRO_REQ_TEL = process.env.EPRO_REQ_TEL ?? '';
const GATEPASS_URL = process.env.GATEPASS_URL ?? 'http://localhost:4009';
const API_KEY = requireEnv('INTEGRATION_API_KEY');
// Headed by default so you can watch it work; set HEADLESS=true for the
// unattended cron run (no window pops up every 15 minutes).
const HEADLESS = process.env.HEADLESS === 'true' || process.env.HEADLESS === '1';

// Refuse to run while any selector is still a placeholder
const flat = (obj, prefix = '') =>
  Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'object' ? flat(v, `${prefix}${k}.`) : [[`${prefix}${k}`, v]],
  );
const unresolved = [...flat(login), ...flat(regForm)].filter(([, v]) => v === '#TODO');
if (unresolved.length > 0) {
  console.error('selectors.mjs ยังมีช่องที่เป็น #TODO — ต้องได้หน้า login จริงมาเติมก่อน:');
  for (const [k] of unresolved) console.error(`  - ${k}`);
  process.exit(1);
}

const toDMY = (iso) => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

// Helper: report with up to 3 retries
async function reportWithRetry(runId, batchKey, result, error, errorClass) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${GATEPASS_URL}/api/integration/report`, {
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
// ASP.NET pages use confirm()/alert() dialogs (e.g. on delete/save) — accept them
page.on('dialog', (d) => {
  console.log(`  [dialog] ${d.message()}`);
  d.accept();
});

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
    // 1. POST /claim to get a work order + workers
    const claimRes = await fetch(`${GATEPASS_URL}/api/integration/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
      body: JSON.stringify({ runId }),
    });
    if (!claimRes.ok) {
      // 5xx = ฝั่ง server ไม่พร้อม (Neon cold start / transaction timeout) — retry ได้
      // ข้ามรอบนี้เฉยๆ ยังไม่ได้ claim อะไร ไม่มีข้อมูลเสียหาย cron รอบหน้าเอาต่อ
      if (claimRes.status >= 500) {
        console.error(`claim ล้มเหลว HTTP ${claimRes.status} — ข้ามรอบนี้ รอ cron รอบถัดไป`);
        break;
      }
      // 400/401/403/404 = config ผิด (API key / GATEPASS_URL / ยังไม่ deploy) — ต้องมีคนแก้
      console.error(`claim ล้มเหลว HTTP ${claimRes.status} — ตรวจ API key / GATEPASS_URL`);
      process.exit(1);
    }
    const payload = await claimRes.json();
    const { batchKey, workOrder, workers } = payload;

    if (!workOrder) {
      console.log('ไม่มีใบงานที่ต้องส่ง — จบการทำงาน');
      break;
    }

    console.log(`\n[ใบงาน ${cycle + 1}] ${workOrder.company} | ${workOrder.startDate} → ${workOrder.endDate} | ${workers.length} คน`);

    try {
      // 2. Fill the epro form
      await page.goto(regForm.url);
      const h = regForm.header;
      await page.selectOption(h.plantSelect, EPRO_PLANT);
      await page.fill(h.startDate, toDMY(workOrder.startDate));
      await page.fill(h.endDate, toDMY(workOrder.endDate));
      await page.fill(h.company, workOrder.company);
      await page.fill(h.location, workOrder.zone || '-');
      if (EPRO_REQ_TEL) await page.fill(h.requesterTel, EPRO_REQ_TEL);
      await page.selectOption(h.approverSelect, EPRO_APPROVER);

      // 3. Add workers one by one — each click is a full postback
      const w = regForm.worker;
      for (const [i, worker] of workers.entries()) {
        console.log(`  (${i + 1}/${workers.length}) เพิ่ม: ${worker.name}`);
        await page.fill(w.name, worker.name);
        await page.fill(w.idCard, worker.idCard);
        await page.fill(w.position, worker.job || '-');
        const rowsBefore = await page.locator(`${w.grid} tr`).count();
        await page.click(w.addButton);
        await page.waitForLoadState('networkidle');
        const rowsAfter = await page.locator(`${w.grid} tr`).count();
        if (rowsAfter <= rowsBefore) {
          throw new Error(`กด "เพิ่ม" แล้วแต่รายชื่อไม่ขึ้นในตาราง (${worker.name}) — เช็ค validation บนหน้าจอ`);
        }
        // postback may clear header dropdowns that aren't in ViewState — re-assert
        await page.selectOption(h.approverSelect, EPRO_APPROVER).catch(() => {});
      }

      if (dryRun) {
        console.log('\n[dry-run] กรอกใบงานครบแล้ว แต่ไม่กดบันทึก — ตรวจหน้าจอได้เลย');
        console.log('[dry-run] ค้างหน้านี้ไว้ 90 วินาที แล้วปิดเอง');
        await page.waitForTimeout(90_000);
        break;
      }

      // 4. Submit — after this click, result is uncertain
      await page.click(regForm.submitButton);
      // ASP.NET save usually navigates away or reloads; wait for the network to settle
      await page.waitForLoadState('networkidle');

      // 5. Report success (with retry)
      await reportWithRetry(runId, batchKey, 'ok');
      totalSubmitted += workers.length;
      console.log(`  บันทึกใบงานแล้ว (${workers.length} รายการ)`);
    } catch (err) {
      mkdirSync(screenshotDir, { recursive: true });
      const shot = join(screenshotDir, `error-${cycle}-${Date.now()}.png`);
      await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
      console.error(`ภาพหน้าจอตอนพัง: ${shot}`);

      const msg = err?.message || String(err);
      // Error classification: selector/form issues = permanent; network/timeout = retryable
      const isPermanent = /selector|validation|login/i.test(msg);
      const result = isPermanent ? 'failed' : 'unknown';
      const errorClass = isPermanent ? 'permanent' : 'retryable';

      await reportWithRetry(runId, batchKey, result, msg, errorClass);
      console.error(`  ✗ ${result === 'failed' ? 'ล้มเหลว' : 'ไม่ทราบผล'}: ${msg}`);
      // DO NOT abort the loop — continue to next claim
    }
  }

  if (!dryRun) console.log(`\nเสร็จสิ้น — ส่ง ${totalSubmitted} รายการ`);
} catch (err) {
  mkdirSync(screenshotDir, { recursive: true });
  const shot = join(screenshotDir, `error-${Date.now()}.png`);
  await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
  console.error('\nเกิดข้อผิดพลาด หยุดการทำงานทันทีเพื่อกันข้อมูลซ้ำ/ผิด');
  console.error(`ภาพหน้าจอตอนพัง: ${shot}`);
  console.error(err);
  process.exitCode = 1;
} finally {
  await browser.close();
}
