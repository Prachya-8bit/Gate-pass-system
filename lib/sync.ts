import { prisma } from '@/lib/db';

export const MAX_ATTEMPTS = 3;
export const RETRY_BACKOFF_MS = 5 * 60_000;       // 5 minutes
export const CLAIM_TIMEOUT_MS = 30 * 60_000;       // 30 minutes

export function groupKey(r: { company: string; startDate: string; endDate: string; zone?: string | null }): string {
  return [r.company, r.startDate, r.endDate, r.zone ?? ''].join('|');
}

// ─────────────────────────────────────────────────────────────────────────────
// นโยบายของ claim/report — เก็บไว้ที่เดียวเพื่อให้ทุกตารางที่ sync เข้า EPRO
// (Record วันนี้ และตารางอื่นในอนาคต) ใช้กฎเดียวกัน
//
// ทำเป็น "ก้อนข้อมูล" ไม่ใช่ helper ที่รับ Prisma delegate เพราะ Prisma ไม่มี
// base type ของ delegate ที่ใช้ร่วมกันได้ การบังคับให้ generic ต้องลงเอยที่
// any/as never ซึ่งจะทำให้พิมพ์ชื่อสถานะผิด (เช่น 'SYNCNG') compile ผ่านแล้ว
// query ไม่ match อะไรเลยแบบเงียบๆ — แลก type-safety ไปกับการประหยัดไม่กี่บรรทัด
// ─────────────────────────────────────────────────────────────────────────────

export function claimCutoffs(now: Date = new Date()) {
  return {
    now,
    claimTimeoutCutoff: new Date(now.getTime() - CLAIM_TIMEOUT_MS),
    retryBackoffCutoff: new Date(now.getTime() - RETRY_BACKOFF_MS),
  };
}

/** แถวที่ RPA หยิบไปส่งได้: ยืนยันแล้ว หรือ ล้มเหลวแต่ยัง retry ได้และพ้น backoff */
export function claimableWhere(retryBackoffCutoff: Date) {
  return {
    OR: [
      { syncStatus: 'CONFIRMED' as const },
      {
        syncStatus: 'FAILED' as const,
        syncAttempt: { lt: MAX_ATTEMPTS },
        lastSyncAt: { lt: retryBackoffCutoff },
      },
    ],
  };
}

/** ค่าที่เขียนตอน claim สำเร็จ — ใช้คู่กับ where ที่ guard สถานะต้นทางไว้ */
export function claimData(runId: string, batchKey: string, now: Date) {
  return {
    syncStatus: 'SYNCING' as const,
    claimedAt: now,
    claimedBy: runId,
    batchKey,
    lastSyncAt: now,
    syncAttempt: { increment: 1 },
  };
}

export type ReportResult = 'ok' | 'failed' | 'unknown';
export type ErrorClass = 'retryable' | 'permanent' | null;

/**
 * ตารางตัดสิน result → สถานะปลายทาง
 * `unknown` (และค่าที่ไม่รู้จัก) → NEEDS_REVIEW เสมอ เพราะ EPRO ไม่มี API ให้ถาม
 * ว่าข้อมูลเข้าไปแล้วหรือยัง ต้องให้คนไปดู — ห้าม auto-retry เด็ดขาด
 * `permanent` → set syncAttempt = MAX_ATTEMPTS เพื่อตัดสิทธิ์ auto-retry
 */
export function reportOutcome(
  result: string,
  errorClass: ErrorClass | undefined,
  error: string | null | undefined,
): {
  to: 'SYNCED' | 'FAILED' | 'NEEDS_REVIEW';
  data: {
    syncStatus: 'SYNCED' | 'FAILED' | 'NEEDS_REVIEW';
    syncedAt?: Date;
    lastSyncError?: string | null;
    syncAttempt?: number;
  };
  error: string | null;
} {
  if (result === 'ok') {
    return { to: 'SYNCED', data: { syncStatus: 'SYNCED', syncedAt: new Date() }, error: null };
  }
  if (result === 'failed' && errorClass === 'permanent') {
    return {
      to: 'FAILED',
      data: { syncStatus: 'FAILED', lastSyncError: error ?? null, syncAttempt: MAX_ATTEMPTS },
      error: error ?? null,
    };
  }
  if (result === 'failed') {
    return {
      to: 'FAILED',
      data: { syncStatus: 'FAILED', lastSyncError: error ?? null },
      error: error ?? null,
    };
  }
  return { to: 'NEEDS_REVIEW', data: { syncStatus: 'NEEDS_REVIEW' }, error: null };
}

export const SYNC_LABELS: Record<string, string> = {
  PENDING: 'รอยืนยัน',
  CONFIRMED: 'ยืนยันแล้ว',
  SYNCING: 'กำลังส่ง',
  SYNCED: 'ส่งแล้ว',
  FAILED: 'ไม่สำเร็จ',
  NEEDS_REVIEW: 'ต้องตรวจสอบ',
  CANCELLED: 'ยกเลิก',
};

/** ตารางที่ SyncLog.recordId อ้างถึง — 'record' = ลงทะเบียนแรงงาน, 'vehicle' = คำขอนำรถเข้า */
export type SyncLogKind = 'record' | 'vehicle';

export async function logTransition(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  params: {
    // ชื่อ recordIds คงไว้ตามเดิมทั้งที่ตอนนี้รับ id ของ VehicleRequest ได้ด้วย —
    // เปลี่ยนชื่อต้องแตะ call site ที่ทำงานอยู่ 7 จุดเพื่อความสวยเท่านั้น
    recordIds: string[];
    to: string;
    from?: string | null;
    actor: string;
    machine?: string | null;
    error?: string | null;
    kind?: SyncLogKind;
  },
) {
  // Use createMany for efficiency — the plan explicitly says syncLog.createMany
  await tx.syncLog.createMany({
    data: params.recordIds.map((recordId) => ({
      recordId,
      kind: params.kind ?? 'record',
      fromStatus: params.from ?? null,
      toStatus: params.to,
      actor: params.actor,
      machine: params.machine ?? null,
      error: params.error ?? null,
    })),
  });
}
