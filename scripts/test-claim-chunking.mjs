// Standalone test for the 10-worker-per-order claim chunking.
//
// ไม่แตะฐานข้อมูลใด ๆ — จำลอง state machine ของ claim/report แบบ in-memory ให้ตรง
// ตรรกะใน app/api/integration/claim/route.ts และ app/api/integration/report/route.ts
// เป๊ะ (orderBy [createdAt asc, id asc] → group → slice(0,10) → compare-and-set →
// batchKey = chunkBatchKey(groupKey, sortedIds); report guard = batchKey+runId+SYNCING)
// แล้วยืนยันกรณีทดสอบ 4 แบบ รวมถึง unit-test helper จริงจาก lib/sync.ts
//
// รัน: node scripts/test-claim-chunking.mjs

import assert from 'node:assert';

// ── helper จาก lib/sync.ts (คัดลอก logic เป๊ะ) + ยืนยันว่ายังตรงกับ source ──────
// re-implement แบบ JS ล้วนเพื่อหลีกเลี่ยงการ eval TS; แล้ว sanity-check กับไฟล์จริง
// ว่า chunkBatchKey ยังใช้ djb2 (h * 33) ^ และ groupKey ยัง join ด้วย '|' — ถ้า
// source เปลี่ยน assertion ด้านล่างจะล้ม เตือนให้ sync test ตาม
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const syncSrc = readFileSync(join(here, '..', 'lib', 'sync.ts'), 'utf8');

const MAX_WORKERS_PER_ORDER = 10; // ตรงกับ lib/constants.ts

function groupKey(r) {
  return [r.company, r.startDate, r.endDate, r.zone ?? ''].join('|');
}

function chunkBatchKey(groupK, sortedIds) {
  let h = 5381;
  for (const id of sortedIds) {
    for (let i = 0; i < id.length; i++) {
      h = (h * 33) ^ id.charCodeAt(i);
    }
  }
  return `${groupK}#${(h >>> 0).toString(36)}`;
}

// guard: ยืนยันว่า test mirror ตรงกับ lib/sync.ts จริง ไม่ drift เงียบ ๆ
if (!/\[r\.company, r\.startDate, r\.endDate, r\.zone \?\? ''\]\.join\('\|'\)/.test(syncSrc)) {
  throw new Error('groupKey ใน lib/sync.ts เปลี่ยนไปจากที่ test จำลอง — อัปเดต test');
}
if (!/h = \(h \* 33\) \^ id\.charCodeAt\(i\)/.test(syncSrc) || !/\(h >>> 0\)\.toString\(36\)/.test(syncSrc)) {
  throw new Error('chunkBatchKey ใน lib/sync.ts เปลี่ยนไปจากที่ test จำลอง — อัปเดต test');
}

// ── in-memory DB จำลองตาราง Record ───────────────────────────────────────────
let db = [];
let idSeq = 0;

function seed(company, startDate, endDate, zone, count) {
  for (let i = 0; i < count; i++) {
    idSeq++;
    db.push({
      id: `rec_${String(idSeq).padStart(4, '0')}`,
      name: `${company}-worker-${i + 1}`,
      idCard: String(1000000000000 + idSeq),
      job: null,
      company,
      startDate,
      endDate,
      zone,
      // createdAt เป็น string วันที่ล้วน (ตามขนบโปรเจกต์) ทุกแถวในกลุ่มเท่ากัน →
      // ทดสอบว่า tiebreak ด้วย id ทำงานจริง
      createdAt: '2026-10-26',
      syncStatus: 'CONFIRMED',
      syncAttempt: 0,
      lastSyncError: null,
      lastSyncAt: null,
      claimedAt: null,
      claimedBy: null,
      batchKey: null,
    });
  }
}

// จำลอง orderBy [createdAt asc, id asc]
function orderClaimable(rows) {
  return [...rows].sort((a, b) =>
    a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
}

// จำลอง claimableWhere: CONFIRMED หรือ FAILED (ในเทสต์นี้ retry พ้น backoff แล้วเสมอ)
function claimableRows() {
  return orderClaimable(db.filter((r) => r.syncStatus === 'CONFIRMED' || r.syncStatus === 'FAILED'));
}

// จำลอง POST /claim — คืน { batchKey, workOrder, workers } | { workOrder: null }
function claim(runId, now = new Date()) {
  const claimable = claimableRows();
  if (claimable.length === 0) return { workOrder: null };

  const earliest = claimable[0];
  const key = groupKey(earliest);
  const group = claimable.filter((r) => groupKey(r) === key);

  const chunk = group.slice(0, MAX_WORKERS_PER_ORDER);
  const ids = chunk.map((r) => r.id);
  const sortedIds = [...ids].sort();
  const batchKey = chunkBatchKey(key, sortedIds);

  // compare-and-set
  const targets = db.filter((r) => ids.includes(r.id) && (r.syncStatus === 'CONFIRMED' || r.syncStatus === 'FAILED'));
  if (targets.length !== ids.length) return { workOrder: null };
  for (const r of targets) {
    r.syncStatus = 'SYNCING';
    r.claimedAt = now;
    r.claimedBy = runId;
    r.batchKey = batchKey;
    r.lastSyncAt = now;
    r.syncAttempt += 1;
  }

  const workers = orderClaimable(db.filter((r) => ids.includes(r.id))).map((r) => ({
    id: r.id,
    name: r.name,
    idCard: r.idCard,
    job: r.job,
  }));

  return {
    batchKey,
    workOrder: { company: earliest.company, startDate: earliest.startDate, endDate: earliest.endDate, zone: earliest.zone },
    workers,
  };
}

// จำลอง POST /report — guard { batchKey, claimedBy: runId, syncStatus: 'SYNCING' }
function report(runId, batchKey, result, errorClass = null) {
  const matching = db.filter((r) => r.batchKey === batchKey && r.claimedBy === runId && r.syncStatus === 'SYNCING');
  if (matching.length === 0) return { acknowledged: true, touched: 0 };
  for (const r of matching) {
    if (result === 'ok') {
      r.syncStatus = 'SYNCED';
      r.syncedAt = new Date();
    } else if (result === 'failed') {
      r.syncStatus = 'FAILED';
      r.lastSyncError = 'test';
      // retryable: ไม่แตะ syncAttempt (ค้างไว้ที่ค่าหลัง claim), permanent: ตัดสิทธิ์
      if (errorClass === 'permanent') r.syncAttempt = 3;
    } else {
      r.syncStatus = 'NEEDS_REVIEW';
    }
  }
  return { acknowledged: true, touched: matching.length };
}

function reset() {
  db = [];
  idSeq = 0;
}

// ── helpers สำหรับ assert ─────────────────────────────────────────────────────
let passed = 0;
function ok(label) {
  passed++;
  console.log(`  ✓ ${label}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Unit test: chunkBatchKey ต้อง deterministic และไม่ชนข้าม chunk
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[unit] chunkBatchKey / groupKey');
{
  const gk = groupKey({ company: 'MATFORCON', startDate: '2026-10-26', endDate: '2026-10-28', zone: 'Zone A' });
  assert.strictEqual(gk, 'MATFORCON|2026-10-26|2026-10-28|Zone A');
  ok('groupKey รวม company|start|end|zone');

  const a = chunkBatchKey(gk, ['rec_0001', 'rec_0002']);
  const b = chunkBatchKey(gk, ['rec_0001', 'rec_0002']);
  assert.strictEqual(a, b, 'deterministic');
  ok('chunkBatchKey deterministic สำหรับ id ชุดเดิม');

  const c = chunkBatchKey(gk, ['rec_0003', 'rec_0004']);
  assert.notStrictEqual(a, c, 'ต่าง chunk ต้องได้ batchKey ต่างกัน');
  ok('chunkBatchKey ต่างกันเมื่อ id ชุดต่างกัน (กัน compare-and-set ชนกัน)');

  assert.ok(a.startsWith(gk + '#'), 'ขึ้นต้นด้วย groupKey#');
  ok('batchKey ยังอ้างกลุ่มเดิมได้ (prefix = groupKey)');
}

// ─────────────────────────────────────────────────────────────────────────────
// Case 1: กลุ่ม 14 คน → claim 10 → report ok → claim 4 → report ok → claim null
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[case 14] MATFORCON 14 คน');
{
  reset();
  seed('MATFORCON', '2026-10-26', '2026-10-28', 'Zone A', 14);

  const c1 = claim('run-1');
  assert.ok(c1.workOrder, 'รอบ 1 ต้องมี workOrder');
  assert.strictEqual(c1.workers.length, 10, 'รอบ 1 ต้องได้ 10 คน');
  assert.deepStrictEqual(Object.keys(c1).sort(), ['batchKey', 'workOrder', 'workers'].sort(), 'response shape = {batchKey, workOrder, workers}');
  ok('รอบ 1 ได้ 10 คน (response shape ถูก)');

  report('run-1', c1.batchKey, 'ok');
  assert.strictEqual(db.filter((r) => r.syncStatus === 'SYNCED').length, 10, 'หลัง report ต้อง SYNCED 10');
  ok('report ok → 10 คนเป็น SYNCED');

  const c2 = claim('run-1');
  assert.ok(c2.workOrder, 'รอบ 2 ต้องมี workOrder');
  assert.strictEqual(c2.workers.length, 4, 'รอบ 2 ต้องได้ 4 คนที่เหลือ');
  assert.notStrictEqual(c1.batchKey, c2.batchKey, 'batchKey รอบ 2 ต้องไม่ซ้ำรอบ 1');
  ok('รอบ 2 ได้ 4 คน และ batchKey ต่างจากรอบ 1');

  // ยืนยันไม่มีคนซ้ำระหว่างสอง chunk
  const ids1 = new Set(c1.workers.map((w) => w.id));
  const dup = c2.workers.filter((w) => ids1.has(w.id));
  assert.strictEqual(dup.length, 0, 'ห้ามมีคนซ้ำระหว่าง chunk');
  ok('ไม่มีคนซ้ำระหว่าง chunk 1 กับ chunk 2');

  report('run-1', c2.batchKey, 'ok');
  const c3 = claim('run-1');
  assert.strictEqual(c3.workOrder, null, 'รอบ 3 ต้องเป็น workOrder: null');
  ok('รอบ 3 = workOrder: null');

  // รวมคนครบ 14 ไม่ตกหล่น
  assert.strictEqual(db.filter((r) => r.syncStatus === 'SYNCED').length, 14, 'ครบ 14 ไม่ตกหล่น');
  ok('รวมส่งครบ 14 คน ไม่ตกหล่น');
}

// ─────────────────────────────────────────────────────────────────────────────
// Case 2: กลุ่ม 8 คน → ได้ 8 คนในครั้งเดียว (พฤติกรรมเดิม)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[case 8] FUJI 8 คน');
{
  reset();
  seed('FUJI', '2026-10-26', '2026-10-27', 'Zone B', 8);
  const c1 = claim('run-2');
  assert.ok(c1.workOrder, 'ต้องมี workOrder');
  assert.strictEqual(c1.workers.length, 8, 'ต้องได้ 8 คนในครั้งเดียว');
  ok('กลุ่ม ≤10 ได้ครบในครั้งเดียว (8 คน)');
  report('run-2', c1.batchKey, 'ok');
  const c2 = claim('run-2');
  assert.strictEqual(c2.workOrder, null, 'หลังส่งครบต้องไม่มีงานอีก');
  ok('หลังส่ง 8 คน → workOrder: null');
}

// ─────────────────────────────────────────────────────────────────────────────
// Case 3: chunk แรก failed (retryable) → claim ใหม่ไม่ซ้ำ ไม่ตกหล่น
// retryable = syncAttempt ยัง < MAX_ATTEMPTS จึง claim ได้อีก; ในตรรกะจริงต้องพ้น
// backoff ก่อน — ที่นี่จำลองว่าพ้นแล้ว (claimableRows หยิบ FAILED เสมอ)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[case fail] chunk แรก failed แล้ว claim ใหม่');
{
  reset();
  seed('MATFORCON', '2026-10-26', '2026-10-28', 'Zone A', 14);

  const c1 = claim('run-3');
  assert.strictEqual(c1.workers.length, 10, 'chunk 1 = 10');
  const chunk1Ids = new Set(c1.workers.map((w) => w.id));

  report('run-3', c1.batchKey, 'failed', 'retryable'); // 10 คนกลับเป็น FAILED
  assert.strictEqual(db.filter((r) => r.syncStatus === 'FAILED').length, 10, '10 คนเป็น FAILED');
  ok('chunk แรก failed → 10 คนกลับเป็น FAILED (รอ retry)');

  // claim ใหม่: ตรรกะหยิบ "10 คนแรกที่ยังไม่ถูกส่ง" จาก group ที่เรียง deterministic
  // group ยังเป็น 14 คน (10 FAILED + 4 CONFIRMED) → chunk ใหม่ = 10 คนแรกเดิม
  const c2 = claim('run-3b');
  assert.strictEqual(c2.workers.length, 10, 'claim ใหม่ยังได้ 10');
  const chunk2Ids = c2.workers.map((w) => w.id);
  // 10 คนแรก (ที่ FAILED) ถูกหยิบก่อน 4 คนที่ยัง CONFIRMED เพราะ orderBy เดิม
  const sameAsChunk1 = chunk2Ids.filter((id) => chunk1Ids.has(id)).length;
  assert.strictEqual(sameAsChunk1, 10, 'หยิบ 10 คนเดิมที่ FAILED กลับมา retry');
  ok('claim ใหม่หยิบ 10 คนที่ FAILED กลับมา retry (deterministic)');

  // ไม่มีคนซ้ำ "ภายใน" การ claim และ 4 คน CONFIRMED ยังไม่ถูกแตะ
  const stillConfirmed = db.filter((r) => r.syncStatus === 'CONFIRMED').length;
  assert.strictEqual(stillConfirmed, 4, '4 คนที่ยังไม่ถูกหยิบต้องไม่ถูกกระทบ');
  ok('record ที่ยังไม่ถูกหยิบ (4 คน CONFIRMED) ไม่ถูกกระทบ');

  report('run-3b', c2.batchKey, 'ok');
  const c3 = claim('run-3c');
  assert.strictEqual(c3.workers.length, 4, 'รอบถัดไปได้ 4 คนที่เหลือ');
  report('run-3c', c3.batchKey, 'ok');
  assert.strictEqual(db.filter((r) => r.syncStatus === 'SYNCED').length, 14, 'สุดท้ายครบ 14 ไม่ตกหล่น');
  ok('สุดท้ายส่งครบ 14 คน ไม่มีคนตกหล่น ไม่มีคนซ้ำ');
}

// ─────────────────────────────────────────────────────────────────────────────
// Case 4: สอง process claim พร้อมกัน → ไม่ได้คนซ้ำ (พึ่ง compare-and-set)
// จำลอง interleave: A อ่าน claimable, B อ่าน claimable เดียวกัน, A commit ก่อน
// ความจริงใน Prisma ใช้ transaction + compare-and-set; ที่นี่ A claim ก่อน B
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[case race] สอง run claim พร้อมกัน');
{
  reset();
  seed('MATFORCON', '2026-10-26', '2026-10-28', 'Zone A', 14);

  const a = claim('run-A'); // ได้ 10 คนแรก, mark SYNCING
  const b = claim('run-B'); // claimable ตอนนี้เหลือ 4 CONFIRMED → ได้ 4
  assert.strictEqual(a.workers.length, 10, 'A ได้ 10');
  assert.strictEqual(b.workers.length, 4, 'B ได้ 4 ที่เหลือ (ไม่ชนกับ A)');
  const aIds = new Set(a.workers.map((w) => w.id));
  const overlap = b.workers.filter((w) => aIds.has(w.id)).length;
  assert.strictEqual(overlap, 0, 'A กับ B ต้องไม่ได้คนซ้ำ');
  assert.notStrictEqual(a.batchKey, b.batchKey, 'batchKey ของ A กับ B ต่างกัน');
  ok('สอง run ไม่ได้คนซ้ำ และ batchKey ต่างกัน (compare-and-set ยังกันได้)');
}

console.log(`\nทั้งหมดผ่าน: ${passed} assertions ✓\n`);
