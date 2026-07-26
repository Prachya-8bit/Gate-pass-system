// Backfill (apply) — ตั้งรายการที่ส่งเข้า EPRO ไปแล้วก่อนมี state machine ให้เป็น SYNCED
//
// ต่างจาก backfill-synced.mjs ที่พิมพ์ SQL ออกมาเฉยๆ — ตัวนี้เชื่อมฐานข้อมูลและเขียนจริง
// ในทรานแซกชันเดียว พร้อม precheck และรายงานก่อน/หลัง
//
// วิธีใช้:
//   node automation/backfill-apply.mjs              # dry-run — ดูอย่างเดียว ไม่เขียน
//   node automation/backfill-apply.mjs --yes        # เขียนจริง
//
// ฐานเป้าหมายอ่านจาก DATABASE_URL:
//   - ไม่ตั้งอะไร            → อ่านจาก .env       (production)
//   - ต้องการ branch dev     → DATABASE_URL="<dev>" node automation/backfill-apply.mjs --yes

import { readFileSync, renameSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '@prisma/client';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const stateFile = join(here, 'state', 'submitted.json');

// DATABASE_URL ที่ส่งมาทาง environment ชนะไฟล์เสมอ
if (!process.env.DATABASE_URL) loadEnv({ path: join(root, '.env') });

const apply = process.argv.includes('--yes');

if (!existsSync(stateFile)) {
  console.error(`ไม่พบ ${stateFile} — ไม่มีข้อมูลที่ต้อง backfill`);
  process.exit(0);
}

const ids = JSON.parse(readFileSync(stateFile, 'utf8'));
if (!Array.isArray(ids) || ids.length === 0) {
  console.log('submitted.json ว่างเปล่า — ไม่มีอะไรต้องทำ');
  process.exit(0);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('ไม่มี DATABASE_URL — ตั้งใน .env หรือส่งมาทาง environment');
  process.exit(1);
}

const host = (url.match(/@([^./]+)/) || [])[1] ?? '(ไม่ทราบ)';
const prisma = new PrismaClient();

const summarise = (rows) =>
  JSON.stringify(
    rows.reduce((acc, r) => ({ ...acc, [r.syncStatus]: (acc[r.syncStatus] ?? 0) + 1 }), {}),
  );

const select = { id: true, syncStatus: true, syncedAt: true, confirmedAt: true };

console.log(`ฐานเป้าหมาย : ${host}`);
console.log(`โหมด        : ${apply ? 'เขียนจริง (--yes)' : 'dry-run (ยังไม่เขียน)'}`);

const before = await prisma.record.findMany({ where: { id: { in: ids } }, select });

if (before.length !== ids.length) {
  const missing = ids.filter((id) => !before.some((r) => r.id === id));
  console.error(`\n❌ id ไม่ครบ พบ ${before.length}/${ids.length} — ยกเลิก ไม่เขียนอะไรทั้งนั้น`);
  console.error(`   ที่หายไป: ${missing.join(', ')}`);
  await prisma.$disconnect();
  process.exit(2);
}

console.log(`precheck    : id ครบ ${before.length}/${ids.length} ✓`);
console.log(`ก่อน        : ${summarise(before)}`);

if (!apply) {
  console.log('\nยังไม่ได้เขียนอะไร — ใส่ --yes เพื่อเขียนจริง');
  await prisma.$disconnect();
  process.exit(0);
}

const now = new Date();

// ทรานแซกชันแบบ batch — interactive transaction จะหมดเวลา 5 วินาทีบน Neon pooled connection
await prisma.$transaction([
  prisma.record.updateMany({
    where: { id: { in: ids } },
    data: { syncStatus: 'SYNCED', syncedAt: now, confirmedAt: now, lastSyncError: null },
  }),
  prisma.syncLog.createMany({
    data: ids.map((recordId) => ({
      recordId,
      toStatus: 'SYNCED',
      actor: 'system:backfill',
      createdAt: now,
    })),
  }),
]);

const after = await prisma.record.findMany({ where: { id: { in: ids } }, select });
const logCount = await prisma.syncLog.count({ where: { actor: 'system:backfill' } });

console.log(`หลัง        : ${summarise(after)}`);
console.log(`syncedAt ครบ : ${after.every((r) => r.syncedAt) ? '✓' : '✗'}`);
console.log(`confirmedAt ครบ : ${after.every((r) => r.confirmedAt) ? '✓' : '✗'}`);
console.log(`SyncLog actor=system:backfill : ${logCount} บรรทัด`);

await prisma.$disconnect();

// กันรันซ้ำ — เปลี่ยนชื่อ state file ทิ้ง
const bak = `${stateFile}.bak`;
if (!existsSync(bak)) {
  renameSync(stateFile, bak);
  console.log(`\nเปลี่ยนชื่อ submitted.json → submitted.json.bak แล้ว (กันรันซ้ำ)`);
} else {
  console.log(`\n${bak} มีอยู่แล้ว — ไม่เปลี่ยนชื่อทับ`);
}
