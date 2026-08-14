// ตรวจ automation/.env บนเครื่องที่รัน RPA — ไม่พิมพ์ความลับออกมา
//
//   node scripts/check-rpa-env.mjs
//
// ทำไมเป็นไฟล์ ไม่ใช่ one-liner ใน runbook: คำสั่ง node -e ที่มี regex และ quote
// ซ้อนกันจะถูก PowerShell แปลงค่าเสียหายแบบเงียบ (เคยทำให้ hash ของ API key
// ออกมาผิดและเกือบทำให้สรุปว่า key ไม่ตรงทั้งที่ตรง) ไฟล์ไม่มีปัญหานี้
//
// รันได้จาก repo root หรือจาก automation/ ก็ได้

import { readFileSync, existsSync } from 'fs';
import { createHash } from 'crypto';
import { join } from 'path';

const CANDIDATES = ['automation/.env', '.env'];
const envPath = CANDIDATES.find((p) => existsSync(p));
if (!envPath) {
  console.error('หาไฟล์ .env ไม่เจอ — รันจาก repo root หรือจากโฟลเดอร์ automation');
  process.exit(1);
}

function parse(file) {
  const out = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    let v = t.slice(i + 1).trim();
    const q = v[0];
    if ((q === '"' || q === "'") && v[v.length - 1] === q) v = v.slice(1, -1);
    out[t.slice(0, i).trim()] = v;
  }
  return out;
}

const sha = (v) => createHash('sha256').update(v).digest('hex').slice(0, 10);
const env = parse(envPath);
console.log(`อ่านจาก: ${envPath}\n`);

let problems = 0;
const bad = (m) => {
  problems++;
  console.log('  ⚠️  ' + m);
};

// ── ค่าที่ไม่เป็นความลับ แสดงได้ตรงๆ ──
const shown = ['GATEPASS_URL', 'EPRO_PLANT', 'EPRO_APPROVER', 'EPRO_USERNAME', 'EPRO_REQ_TEL'];
console.log('ค่าที่ตั้งไว้:');
for (const k of shown) {
  console.log('  ' + k.padEnd(20) + (env[k] === undefined ? '(ไม่มี)' : env[k] === '' ? '(ว่าง)' : env[k]));
}

// ── ความลับ แสดงแค่ความยาวกับ hash ──
console.log('\nความลับ (ไม่แสดงค่า):');
for (const k of ['EPRO_PASSWORD', 'INTEGRATION_API_KEY']) {
  const v = env[k];
  console.log('  ' + k.padEnd(20) + (v ? `ตั้งแล้ว · ยาว ${v.length} · sha256(10) ${sha(v)}` : '(ไม่มี)'));
}

// ── ตรวจสิ่งที่มักผิด ──
console.log('\nตรวจ:');
if (!env.GATEPASS_URL) bad('ไม่มี GATEPASS_URL');
else if (/localhost|127\.0\.0\.1/.test(env.GATEPASS_URL)) {
  bad(
    `GATEPASS_URL ชี้ ${env.GATEPASS_URL} — ถูกสำหรับเครื่องพัฒนา แต่ถ้านี่คือเครื่องที่รัน ` +
      'Task Scheduler ต้องเปลี่ยนเป็น URL ของ production ไม่งั้น cron จะไปหยิบงานจากฐานเครื่องพัฒนา',
  );
} else console.log('  ✅ GATEPASS_URL ไม่ใช่ localhost');

if (!env.EPRO_APPROVER) bad('EPRO_APPROVER ว่าง — สคริปต์จะออกทันทีที่เริ่มรัน');
else console.log('  ✅ EPRO_APPROVER มีค่า');

const PLANTS = ['4911', '4931', '4951'];
if (!PLANTS.includes(env.EPRO_PLANT ?? '')) bad(`EPRO_PLANT = ${env.EPRO_PLANT ?? '(ไม่มี)'} ต้องเป็น ${PLANTS.join(' / ')}`);
else console.log('  ✅ EPRO_PLANT ถูกต้อง');

for (const k of ['EPRO_USERNAME', 'EPRO_PASSWORD', 'INTEGRATION_API_KEY']) {
  if (!env[k]) bad(`${k} ว่าง — จำเป็นต้องมี`);
}
if (env.INTEGRATION_API_KEY === 'copy-from-project-.env.local') {
  bad('INTEGRATION_API_KEY ยังเป็นค่า placeholder จาก .env.example — จะได้ 401 ตอน claim');
}

// ── ถ้าอยู่บนเครื่องพัฒนา เทียบกับ .env.local ของ Gate Pass ให้ด้วย ──
const localEnv = ['.env.local', join('..', '.env.local')].find((p) => existsSync(p));
if (localEnv) {
  const l = parse(localEnv);
  console.log(`\nเทียบกับ ${localEnv} (เครื่องพัฒนา):`);
  if (l.INTEGRATION_API_KEY && env.INTEGRATION_API_KEY) {
    const same = l.INTEGRATION_API_KEY === env.INTEGRATION_API_KEY;
    console.log(
      (same ? '  ✅ ' : '  ⚠️  ') +
        `INTEGRATION_API_KEY ${same ? 'ตรงกัน' : 'ไม่ตรงกัน → RPA จะได้ 401'} (local sha ${sha(l.INTEGRATION_API_KEY)})`,
    );
    if (!same) problems++;
  }
  if (l.DATABASE_URL) {
    try {
      console.log('  DATABASE_URL host: ' + new URL(l.DATABASE_URL).hostname);
    } catch {
      console.log('  DATABASE_URL อ่านไม่ได้');
    }
  }
} else {
  console.log('\n(ไม่เจอ .env.local — ปกติสำหรับเครื่อง server ที่รันแค่ automation/)');
}

console.log('\n' + (problems === 0 ? '✅ ไม่พบปัญหา' : `⚠️ พบ ${problems} จุดที่ต้องดู`));
