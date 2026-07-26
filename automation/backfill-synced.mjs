// Backfill — marks previously-submitted records as SYNCED in the new state machine.
//
// Reads the old submitted.json (record IDs that were sent to EPRO before the
// state machine existed), then prints SQL INSERTs/UPDATEs that an admin can
// run in psql or Prisma Studio to bring the DB in sync.
//
// Usage:
//   node automation/backfill-synced.mjs
//   # Copy the printed SQL and run it against the production database.
//
// ⚠️ Important: check that the IDs in submitted.json actually exist in the
// target database before running the SQL. Different DB branches may have
// different data.

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const stateFile = join(here, 'state', 'submitted.json');

if (!existsSync(stateFile)) {
  console.error(`${stateFile} ไม่พบ — ไม่มีข้อมูลที่ต้อง backfill`);
  process.exit(0);
}

let submitted;
try {
  submitted = JSON.parse(readFileSync(stateFile, 'utf8'));
} catch (e) {
  console.error(`อ่าน ${stateFile} ไม่สำเร็จ: ${e.message}`);
  process.exit(1);
}

if (!Array.isArray(submitted) || submitted.length === 0) {
  console.log('submitted.json ว่างเปล่า — ไม่มีข้อมูลที่ต้อง backfill');
  process.exit(0);
}

console.log(`พบ ${submitted.length} รายการใน submitted.json`);
console.log('');
console.log('-- คัดลอก SQL ด้านล่างไปรันใน psql หรือ Prisma Studio --');
console.log('-- ⚠️ ตรวจสอบก่อนว่า ID เหล่านี้มีอยู่จริงในฐานข้อมูลเป้าหมาย');
console.log('');

const now = new Date().toISOString();

for (const id of submitted) {
  if (typeof id !== 'string') continue;
  console.log(`UPDATE "Record" SET "syncStatus" = 'SYNCED', "syncedAt" = '${now}', "confirmedAt" = '${now}' WHERE "id" = '${id}';`);
  console.log(`INSERT INTO "SyncLog" ("id", "recordId", "toStatus", "actor", "createdAt") VALUES (gen_random_uuid(), '${id}', 'SYNCED', 'system:backfill', '${now}');`);
}

console.log('');
console.log(`-- จำนวน: ${submitted.length} รายการ`);
console.log('-- เสร็จแล้วเปลี่ยนชื่อ submitted.json เป็น submitted.json.bak เพื่อป้องกันการรันซ้ำ');
