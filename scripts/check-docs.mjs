// ตรวจว่าเอกสารยังตรงกับโค้ด และ render ออกมาถูก
//
//   npm run check:docs              ตรวจทุกอย่าง
//   npm run check:docs -- --offline ข้ามส่วนที่ต้องใช้เน็ต/เบราว์เซอร์
//
// เอกสารของโปรเจกต์นี้อ้างถึงโค้ดเยอะ (ข้อความ error ไทย, ค่าคงที่, path, ตัวเลข)
// ข้ออ้างที่ไม่ตรงโค้ดคือ defect — โดยเฉพาะ docs/error-reference.md ที่มีหน้าที่เดียว
// คือ "เห็นข้อความนี้ → มาเปิดหา" ข้อความไม่ตรงทำให้มันใช้ไม่ได้ตามวัตถุประสงค์
//
// ข้อจำกัดที่รู้ไว้:
//  - ข้อความที่ในซอร์สถูกต่อด้วย `+` คนละบรรทัด จะเทียบไม่เจอทั้งประโยค
//    (เทียบเป็นชิ้นๆ ช่วยได้บางส่วน) — ถ้า FAIL ให้ตรวจด้วยตาก่อนแก้เอกสาร
//  - การนับ cell ในตารางจับ "แถวที่ cell ขาด" ไม่ได้ เพราะ GitHub เติม <td></td> ให้เอง
//    แต่จับได้ว่าตารางถูก render เป็นตารางจริง ไม่ใช่ข้อความดิบ

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, dirname, resolve } from 'path';

const ROOT = process.cwd();
const OFFLINE = process.argv.includes('--offline');
const DOCS = [
  'CLAUDE.md',
  'docs/architecture.md',
  'docs/sync-state-machine.md',
  'docs/error-reference.md',
  'docs/runbook-vehicle-sync.md',
  'automation/README.md',
];

// path ที่เอกสารอ้างถึงเชิงประวัติ ไม่ใช่ไฟล์ที่ต้องมีอยู่จริง
const HISTORICAL_PATHS = new Set(['automation/state/submitted.json']);

// ข้อความที่เอกสารเขียนแบบย่อโดยเจตนา จึงเทียบกับซอร์สตรงๆ ไม่ได้
// (ในซอร์สเป็น ternary: `ล้มเหลว (${permanent ? 'ถาวร' : 'ลองใหม่ได้'}): ${msg}`)
// เอกสารรวมสองกรณีเป็นบรรทัดเดียวซึ่งอ่านง่ายกว่าแยกสองแถว
const PARAPHRASED = new Set(['ล้มเหลว (ถาวร/ลองใหม่ได้): <msg>']);

let fail = 0;
const bad = (m) => {
  fail++;
  console.log('  FAIL  ' + m);
};
const ok = (m) => console.log('  pass  ' + m);

// ── รวมซอร์สทั้งหมด (ไม่รวม node_modules, docs, UI prototype, ผลลัพธ์ runtime) ──
function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    if (['node_modules', '.next', '.git', 'docs', 'UI', 'pages', 'screenshots', 'logs', 'state'].includes(e)) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mjs|js|prisma|sql|json|sh|ps1)$/.test(e)) out.push(p);
  }
  return out;
}
const srcFiles = walk(ROOT);
const allSrc = srcFiles.map((f) => readFileSync(f, 'utf8')).join('\n');
const read = (f) => readFileSync(join(ROOT, f), 'utf8');
console.log(`อ่านซอร์ส ${srcFiles.length} ไฟล์\n`);

// ══ A. ลิงก์ relative ต้องชี้ไฟล์ที่มีจริง ══
console.log('A. ลิงก์ในเอกสาร');
let linkFails = 0;
for (const doc of DOCS) {
  if (!existsSync(doc)) {
    bad(`ไม่มีไฟล์เอกสาร ${doc}`);
    linkFails++;
    continue;
  }
  for (const m of read(doc).matchAll(/\[[^\]]+\]\((\.[^)#\s]+)/g)) {
    if (!existsSync(resolve(dirname(join(ROOT, doc)), m[1]))) {
      bad(`${doc}: ลิงก์เสีย → ${m[1]}`);
      linkFails++;
    }
  }
}
if (!linkFails) ok('ทุกลิงก์ relative ชี้ไปไฟล์ที่มีจริง');

// ══ B. path ที่อ้างในเอกสารต้องมีอยู่ ══
console.log('\nB. path ที่อ้างถึงในเอกสาร');
const pathRe =
  /`((?:app|lib|components|prisma|automation|scripts)\/[A-Za-z0-9_./[\]-]+\.(?:ts|tsx|mjs|prisma|sql|json|md))`/g;
const seenPaths = new Set();
let pathFails = 0;
for (const doc of DOCS) {
  for (const m of read(doc).matchAll(pathRe)) {
    const p = m[1];
    if (seenPaths.has(p) || HISTORICAL_PATHS.has(p)) continue;
    seenPaths.add(p);
    if (!existsSync(join(ROOT, p))) {
      bad(`${doc}: อ้าง path ที่ไม่มี → ${p}`);
      pathFails++;
    }
  }
}
if (!pathFails) ok(`path ทั้ง ${seenPaths.size} รายการมีอยู่จริง`);

// ══ C. ข้อความ error ไทยใน error-reference.md ต้องอยู่ในโค้ด ══
console.log('\nC. ข้อความ error ไทยใน error-reference.md');
const strings = new Set();
for (const line of read('docs/error-reference.md').split('\n')) {
  if (!line.startsWith('|')) continue;
  for (const m of (line.split('|')[1] ?? '').matchAll(/`([^`]+)`/g)) {
    if (/[฀-๿]/.test(m[1])) strings.add(m[1]);
  }
}
let strFails = 0;
for (const s of strings) {
  if (allSrc.includes(s) || PARAPHRASED.has(s)) continue;
  // เอกสารใช้ placeholder แทนส่วนที่เป็นตัวแปร เช่น <5xx>, <msg>, N, ${...}
  // จึงเทียบเป็นชิ้นคงที่แทนการเทียบทั้งประโยค
  const parts = s
    .split(/<[^>]*>|\$\{[^}]*\}|\s\d+\s|\bN\b|\/(?=[^/]*\))/)
    .map((x) => x.trim())
    .filter((x) => x.length >= 8);
  if (parts.length > 0 && parts.every((p) => allSrc.includes(p))) continue;
  bad(`ไม่เจอในโค้ด: "${s}"`);
  strFails++;
}
if (!strFails) ok(`ข้อความไทยทั้ง ${strings.size} รายการเจอในโค้ดครบ`);

// ══ D. ค่าคงที่ที่เอกสารอ้าง ต้องตรงกับโค้ด ══
console.log('\nD. ค่าคงที่ที่เอกสารอ้าง');
const MIG = 'prisma/migrations/20260813000000_add_vehicle_request/migration.sql';
const sqlNoComments = () =>
  read(MIG)
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n');
const claims = [
  ['MIN_SPAN_DAYS = 1', /MIN_SPAN_DAYS\s*=\s*1\b/.test(read('lib/constants.ts'))],
  ['MAX_SPAN_DAYS = 6', /MAX_SPAN_DAYS\s*=\s*6\b/.test(read('lib/constants.ts'))],
  ['MAX_ATTEMPTS = 3', /MAX_ATTEMPTS\s*=\s*3\b/.test(read('lib/sync.ts'))],
  ['RETRY_BACKOFF = 5 นาที', /RETRY_BACKOFF_MS\s*=\s*5\s*\*\s*60_000/.test(read('lib/sync.ts'))],
  ['CLAIM_TIMEOUT = 30 นาที', /CLAIM_TIMEOUT_MS\s*=\s*30\s*\*\s*60_000/.test(read('lib/sync.ts'))],
  ['VEHICLE_LEAD_MINUTES = 60', /VEHICLE_LEAD_MINUTES\s*=\s*60\b/.test(read('lib/vehicle.ts'))],
  ['TIME_MINUTES = 00/15/30/45', /TIME_MINUTES[^=]*=\s*\['00',\s*'15',\s*'30',\s*'45'\]/.test(read('lib/vehicle.ts'))],
  ['TIME_MINUTES ไม่มี 10 (epro dropdown ขาดค่านี้)', !/TIME_MINUTES[^;]*'10'/.test(read('lib/vehicle.ts'))],
  ['จังหวัด 77 ตัว', (read('lib/vehicle.ts').match(/PLATE_PROVINCES[^;]+;/s)?.[0].match(/'/g)?.length ?? 0) / 2 === 77],
  ['plant 4911/4931/4951', ['4911', '4931', '4951'].every((v) => read('lib/vehicle.ts').includes(v))],
  ["SyncLog.kind default 'record'", /kind\s+String\s+@default\("record"\)/.test(read('prisma/schema.prisma'))],
  ['VehicleRequest มี @@index([syncStatus])', /model VehicleRequest[\s\S]*?@@index\(\[syncStatus\]\)/.test(read('prisma/schema.prisma'))],
  ['migration additive (ไม่มี DROP ใน SQL จริง)', !/\bDROP\b/i.test(sqlNoComments())],
  ['migration ไม่ re-create enum SyncStatus', !/CREATE TYPE "SyncStatus"/.test(read(MIG))],
  ['vehicleForm URL = FrmOperation.aspx', read('automation/selectors.mjs').includes('reg/FrmOperation.aspx')],
  ['selectors ไม่มี #TODO ค้าง', !read('automation/selectors.mjs').includes("'#TODO'")],
  ['PROVINCE_PAD เป็น U+00A0', read('automation/selectors.mjs').includes(' ')],
  // runner ทั้งสองต้องเรียกทั้งสองฝั่ง และฝั่งรถต้องอยู่ "ทีหลัง" ฝั่งแรงงาน
  // ถ้าสลับลำดับ ปัญหาฝั่งรถจะหน่วง sync แรงงานซึ่งมีค่ากว่า
  ...['automation/run-sync.sh', 'automation/run-sync.ps1'].map((f) => {
    const s = read(f);
    const w = s.indexOf('npm run sync ');
    const v = s.indexOf('npm run sync:vehicle');
    return [`${f}: เรียกทั้งสองฝั่ง และรถอยู่หลังแรงงาน`, w !== -1 && v !== -1 && w < v];
  }),
  // ห้ามมี cron entry / scheduled task ที่สอง — ต้องอยู่ใน lock เดียวกัน
  ['run-sync.sh ใช้ flock เดียวครอบทั้งสองฝั่ง',
    (() => {
      const s = read('automation/run-sync.sh');
      const lock = s.indexOf('flock -n 9');
      return lock !== -1 && lock < s.indexOf('npm run sync ') && lock < s.indexOf('npm run sync:vehicle');
    })()],
  // run-sync.cmd คือสิ่งที่ Task Scheduler เรียกจริง ๆ บนเครื่อง sync
  // เดิมมันอยู่แต่บนเครื่อง server แบบ untracked และเรียก `npm run sync` ตรง ๆ
  // ทำให้ PR #4 (ที่สอน run-sync.ps1 ให้รันฝั่งรถ) ไม่มีผลอะไรเลยกับรอบที่รันจริง
  // ฝั่งแรงงานทำงานต่อไป ฝั่งรถเงียบ และไม่มี error ให้เห็น
  // สาม assert นี้กันไม่ให้กลับไปเป็นแบบนั้นอีก
  ['run-sync.cmd อยู่ใน repo (คือ entry point ของ Task Scheduler)',
    existsSync(join(ROOT, 'automation/run-sync.cmd'))],
  ...(existsSync(join(ROOT, 'automation/run-sync.cmd'))
    ? (() => {
        const s = read('automation/run-sync.cmd');
        // ตัด REM ออกก่อนตรวจ: comment ในไฟล์นี้ *อธิบาย* บั๊กเก่าที่เคยเรียก npm ตรง ๆ
        // และเตือนเรื่อง hard-code path จึงมีคำพวกนั้นอยู่ตามเจตนา ต้องตรวจโค้ดจริงเท่านั้น
        const code = s.replace(/^\s*REM\b.*$/gim, '');
        return [
          ['run-sync.cmd ส่งต่อไป run-sync.ps1', /-File\s+"%~dp0run-sync\.ps1"/.test(code)],
          // ถ้า .cmd เรียก npm เองอีก logic จะแตกเป็นสองที่และ drift ได้อีกรอบ
          ['run-sync.cmd ไม่เรียก npm เอง (logic อยู่ใน .ps1 ที่เดียว)', !/npm\s+run/.test(code)],
          // path แข็งผูกกับเครื่องเดียว และพังเงียบถ้า checkout ย้ายที่
          ['run-sync.cmd ไม่ hard-code path ของ checkout', !/[A-Za-z]:\\/.test(code)],
        ];
      })()
    : []),
  ['npm script sync:vehicle:dry มีจริง', read('automation/package.json').includes('sync:vehicle:dry')],
  ['dry-run ดัก waitForTimeout ที่ถูกปิดหน้าต่าง (ทั้งสองสคริปต์)',
    ['automation/epro-sync.mjs', 'automation/epro-sync-vehicle.mjs'].every((f) =>
      /waitForTimeout\(90_000\)\.catch\(/.test(read(f)))],
];
for (const [name, pass] of claims) (pass ? ok : bad)(name);

// ══ E. render จริง: ตาราง GFM ผ่าน GitHub API + mermaid ตัวจริง ══
if (OFFLINE) {
  console.log('\n(ข้าม render check เพราะ --offline)');
} else {
  console.log('\nE. ตาราง GFM (render ด้วย GitHub Markdown API)');
  for (const doc of DOCS) {
    let html;
    try {
      const res = await fetch('https://api.github.com/markdown', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/vnd.github+json' },
        body: JSON.stringify({ text: read(doc), mode: 'gfm' }),
      });
      if (!res.ok) {
        console.log(`  ข้าม  ${doc}: GitHub API ตอบ ${res.status}`);
        continue;
      }
      html = await res.text();
    } catch (e) {
      console.log(`  ข้าม  ${doc}: เรียก API ไม่ได้ (${e.message})`);
      continue;
    }
    // GitHub ออก <table role="table"> ไม่ใช่ <table> เปล่าๆ
    const tables = html.match(/<table[^>]*>[\s\S]*?<\/table>/g) ?? [];
    let tblBad = 0;
    tables.forEach((t, ti) => {
      const rows = t.match(/<tr>[\s\S]*?<\/tr>/g) ?? [];
      const counts = rows.map((r) => (r.match(/<t[hd][\s>]/g) ?? []).length);
      counts.forEach((c, ri) => {
        if (c !== counts[0]) {
          bad(`${doc}: ตารางที่ ${ti + 1} แถวที่ ${ri + 1} มี ${c} cell (หัวตาราง ${counts[0]})`);
          tblBad++;
        }
      });
    });
    if (!tblBad) ok(`${doc}: ${tables.length} ตาราง render เป็นตารางจริง cell ตรงหัวตาราง`);
  }

  console.log('\nF. mermaid diagram (parse ด้วย mermaid ตัวจริง)');
  const blocks = [];
  for (const doc of DOCS) {
    const s = read(doc);
    let m;
    const re = /```mermaid\r?\n([\s\S]*?)```/g;
    let idx = 0;
    while ((m = re.exec(s))) {
      idx++;
      blocks.push({ doc, idx, line: s.slice(0, m.index).split('\n').length, code: m[1] });
    }
  }
  console.log(`  พบ ${blocks.length} block`);
  if (blocks.length > 0) {
    let browser;
    try {
      const { chromium } = await import('playwright');
      browser = await chromium.launch();
      const page = await browser.newPage();
      await page.goto('about:blank');
      await page.addScriptTag({ url: 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js' });
      await page.evaluate(() => window.mermaid.initialize({ startOnLoad: false }));
      for (const b of blocks) {
        const err = await page.evaluate(async (code) => {
          try {
            await window.mermaid.parse(code);
            return null;
          } catch (e) {
            return String(e?.message ?? e).split('\n').slice(0, 2).join(' / ');
          }
        }, b.code);
        if (err) bad(`${b.doc} block ${b.idx} (บรรทัด ~${b.line}): ${err}`);
        else ok(`${b.doc} block ${b.idx} (บรรทัด ~${b.line}) parse ผ่าน`);
      }
    } catch (e) {
      console.log(`  ข้าม: โหลด mermaid ไม่ได้ (${e.message})`);
    } finally {
      await browser?.close();
    }
  }
}

console.log('\n' + (fail === 0 ? '✅ ผ่านทั้งหมด' : `❌ ${fail} ข้อไม่ผ่าน`));
process.exit(fail === 0 ? 0 : 1);
