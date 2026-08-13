// เครื่องมือเก็บหน้าฟอร์มจาก epro เพื่อเอา element id ไปเติมใน selectors.mjs
//
// ใช้ตอนจะรองรับฟอร์มใหม่ หรือตอน epro เปลี่ยนหน้าเว็บแล้ว selector เดิมพัง
//
//   node --env-file=.env capture-page.mjs --list
//       → login แล้ว dump เมนูซ้ายทั้งหมดลง pages/menu.json (ไม่เปิดฟอร์ม)
//
//   node --env-file=.env capture-page.mjs --menu "นำรถยนต์" --name FrmVehicle
//       → หาเมนูที่มีข้อความนี้ คลิกเข้าไป แล้วเก็บทุกอย่าง
//
//   node --env-file=.env capture-page.mjs --url https://.../reg/FrmX.aspx --name FrmX
//       → เปิด URL ตรง แล้วเก็บทุกอย่าง
//
// ผลลัพธ์ทั้งหมดลงโฟลเดอร์ pages/ ซึ่ง gitignore ไว้แล้ว
// ⚠️ ไฟล์ที่เก็บมีชื่อ-เลขบัตรจริงของคนในระบบ — ห้าม commit ห้ามส่งออกนอกองค์กร

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { login } from './selectors.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, 'pages');

function arg(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}
const listOnly = process.argv.includes('--list');
const menuText = arg('--menu');
const directUrl = arg('--url');
const name = arg('--name') ?? 'captured';

function requireEnv(n) {
  const v = process.env[n];
  if (!v) {
    console.error(`ยังไม่ได้ตั้งค่า ${n} ใน .env`);
    process.exit(1);
  }
  return v;
}
const EPRO_USERNAME = requireEnv('EPRO_USERNAME');
const EPRO_PASSWORD = requireEnv('EPRO_PASSWORD');
const HEADLESS = process.env.HEADLESS === 'true' || process.env.HEADLESS === '1';

if (!listOnly && !menuText && !directUrl) {
  console.error('ต้องระบุ --list, --menu "<ข้อความในเมนู>", หรือ --url <URL>');
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

async function doLogin(page) {
  await page.goto(login.url);
  await page.fill(login.usernameInput, EPRO_USERNAME);
  await page.fill(login.passwordInput, EPRO_PASSWORD);
  await page.click(login.submitButton);
  await page.waitForSelector(login.loggedInIndicator, { timeout: 20_000 });
}

// ASP.NET TreeView ซ่อน node ลูกไว้ — กางให้หมดก่อนอ่านรายการเมนู
async function expandTree(page) {
  for (let round = 0; round < 6; round++) {
    const toggles = page.locator(
      `${login.loggedInIndicator} a[href*="TreeView_ToggleNode"], ${login.loggedInIndicator} img[src*="plus"]`,
    );
    const n = await toggles.count();
    let clicked = 0;
    for (let i = 0; i < n; i++) {
      try {
        await toggles.nth(i).click({ timeout: 2000 });
        await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
        clicked++;
      } catch {
        /* node นี้กางแล้วหรือคลิกไม่ได้ — ข้าม */
      }
    }
    if (clicked === 0) break;
  }
}

async function dumpMenu(page) {
  return page.$$eval(`${login.loggedInIndicator} a`, (as) =>
    as.map((a) => ({
      text: (a.textContent || '').trim(),
      href: a.getAttribute('href'),
      id: a.id || null,
      onclick: a.getAttribute('onclick'),
    })),
  );
}

// ดึงทุก control ที่ต้องกรอก พร้อมชนิดและ option — นี่คือของที่เอาไปเติม selectors.mjs
async function dumpControls(page) {
  return page.$$eval('[id^="ctl00_MainBody_"]', (els) =>
    els
      .map((e) => ({
        id: e.id,
        tag: e.tagName,
        type: e.getAttribute('type'),
        name: e.getAttribute('name'),
        maxLength: e.getAttribute('maxlength'),
        value: e.tagName === 'SELECT' ? undefined : e.getAttribute('value'),
        options:
          e.tagName === 'SELECT'
            ? [...e.options].map((o) => ({ value: o.value, text: (o.text || '').trim() }))
            : undefined,
      }))
      // เอาแต่ตัวที่กรอกได้จริง + ตาราง (grid) ที่อาจต้องนับแถว
      .filter((c) => ['INPUT', 'SELECT', 'TEXTAREA', 'TABLE'].includes(c.tag)),
  );
}

// validator บอกว่า epro บังคับกรอกช่องไหน → ฟอร์มเราต้องบังคับตามให้ตรง
async function dumpValidators(page) {
  return page.$$eval('span[id*="alidator"], span[id*="alid"]', (els) =>
    els.map((e) => ({
      id: e.id,
      message: (e.textContent || '').trim(),
      controlToValidate:
        e.getAttribute('data-val-controltovalidate') ||
        e.getAttribute('controltovalidate') ||
        null,
    })),
  );
}

const browser = await chromium.launch({ headless: HEADLESS });
const page = await browser.newPage();
page.on('dialog', (d) => d.accept());

try {
  console.log(`login: ${login.url}`);
  await doLogin(page);
  console.log('login สำเร็จ');

  await expandTree(page);
  const menu = await dumpMenu(page);
  writeFileSync(join(outDir, 'menu.json'), JSON.stringify(menu, null, 2), 'utf8');
  console.log(`เมนูทั้งหมด ${menu.length} รายการ → pages/menu.json`);

  if (listOnly) {
    console.log('\n--- รายการเมนู (ข้อความ | href) ---');
    for (const m of menu) if (m.text) console.log(`${m.text}  |  ${m.href}`);
    process.exit(0);
  }

  let target = null;
  if (menuText) {
    target = menu.find((m) => m.text.includes(menuText));
    if (!target) {
      console.error(`\nไม่เจอเมนูที่มีข้อความ "${menuText}" — รายการที่มีอยู่:`);
      for (const m of menu) if (m.text) console.log(`  ${m.text}`);
      process.exit(1);
    }
    console.log(`\nเจอเมนู: "${target.text}"`);
    console.log(`  href    = ${target.href}`);
    console.log(`  onclick = ${target.onclick ?? '(ไม่มี)'}`);
    const isPostBack = /__doPostBack/.test(`${target.href} ${target.onclick}`);
    console.log(
      isPostBack
        ? '  ⚠️ เป็น __doPostBack — อาจไม่มี URL ให้เปิดตรง RPA ต้องคลิกเมนูแทน'
        : '  href เป็นลิงก์ปกติ น่าจะเปิดตรงได้ (จะทดสอบให้ด้านล่าง)',
    );
    await page.locator(`${login.loggedInIndicator} a`, { hasText: target.text }).first().click();
    await page.waitForLoadState('networkidle');
  } else {
    await page.goto(directUrl, { waitUntil: 'networkidle' });
  }

  const finalUrl = page.url();
  console.log(`\nURL ของหน้าฟอร์ม: ${finalUrl}`);

  const html = await page.content();
  writeFileSync(join(outDir, `${name}.html`), html, 'utf8');
  await page.screenshot({ path: join(outDir, `${name}.png`), fullPage: true });

  const controls = await dumpControls(page);
  const validators = await dumpValidators(page);
  writeFileSync(
    join(outDir, `${name}.controls.json`),
    JSON.stringify({ url: finalUrl, menuEntry: target, controls, validators }, null, 2),
    'utf8',
  );

  console.log(`\n--- control ที่เจอ ${controls.length} ตัว ---`);
  for (const c of controls) {
    const kind = c.tag === 'SELECT' ? `SELECT(${c.options?.length ?? 0} ตัวเลือก)` : `${c.tag}${c.type ? `[${c.type}]` : ''}`;
    console.log(`  #${c.id}  ${kind}${c.maxLength ? `  maxlength=${c.maxLength}` : ''}`);
  }

  const selects = controls.filter((c) => c.tag === 'SELECT');
  if (selects.length) {
    console.log('\n--- ตัวเลือกของทุก dropdown (ต้องเอาไปใส่ในเว็บเราให้ตรงทุกตัวอักษร) ---');
    for (const s of selects) {
      console.log(`\n  #${s.id}`);
      for (const o of s.options ?? []) console.log(`     "${o.value}" = ${o.text}`);
    }
  }

  if (validators.length) {
    console.log('\n--- validator (บอกว่า epro บังคับช่องไหน) ---');
    for (const v of validators) console.log(`  ${v.controlToValidate ?? '?'} → ${v.message}`);
  }

  // ทดสอบเปิด URL ตรงใน context ใหม่ (ไม่มี cookie เดิม) — ตัดสินว่า RPA ใช้ goto() ได้ไหม
  console.log('\n--- ทดสอบเปิด URL ตรงใน browser context ใหม่ ---');
  const probeCtx = await browser.newContext();
  const probe = await probeCtx.newPage();
  probe.on('dialog', (d) => d.accept());
  try {
    await doLogin(probe);
    await probe.goto(finalUrl, { waitUntil: 'domcontentloaded' });
    const probeControls = await probe.$$eval('[id^="ctl00_MainBody_"]', (els) => els.length);
    const landedUrl = probe.url();
    const ok = probeControls > 0 && landedUrl.includes(finalUrl.split('/').pop().split('?')[0]);
    console.log(`  URL หลังเปิด: ${landedUrl}`);
    console.log(`  เจอ control ${probeControls} ตัว`);
    console.log(
      ok
        ? '  ✅ เปิด URL ตรงได้ — RPA ใช้ page.goto() ได้เลย'
        : '  ❌ เปิด URL ตรงไม่ได้ — RPA ต้องคลิกจากเมนูซ้าย (ใส่ menuLabel ใน selectors.mjs)',
    );
    writeFileSync(
      join(outDir, `${name}.directurl.json`),
      JSON.stringify({ finalUrl, landedUrl, probeControls, directUrlWorks: ok }, null, 2),
      'utf8',
    );
  } catch (e) {
    console.log(`  ❌ เปิด URL ตรงไม่ได้: ${e.message}`);
  }
  await probeCtx.close();

  console.log(`\nเก็บเรียบร้อย → pages/${name}.html, ${name}.png, ${name}.controls.json, menu.json`);
  console.log('⚠️ ไฟล์เหล่านี้มีข้อมูลส่วนบุคคล — gitignore ไว้แล้ว ห้าม commit');
  console.log('\nยังต้องตรวจด้วยตาอีก 2 อย่างที่สคริปต์บอกแทนไม่ได้:');
  console.log('  1) รูปแบบวันที่ — พิมพ์วันที่ในช่องวันที่ดู แล้วอ่านค่าที่มันแสดงกลับ');
  console.log('     ว่าเป็น พ.ศ. (2569) หรือ ค.ศ. (2026) — ผิดปีจะไม่ error แต่ข้อมูลผิด 543 ปี');
  console.log('  2) มีปุ่ม "เพิ่ม" ที่ต้องกดให้รถขึ้นตารางก่อน Save ไหม');
} catch (err) {
  mkdirSync(outDir, { recursive: true });
  const shot = join(outDir, `capture-error-${name}.png`);
  await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
  console.error(`\nพัง: ${err.message}`);
  console.error(`ภาพหน้าจอตอนพัง: ${shot}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
