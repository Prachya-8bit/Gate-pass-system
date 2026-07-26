import { prisma } from '@/lib/db';

export const MAX_ATTEMPTS = 3;
export const RETRY_BACKOFF_MS = 5 * 60_000;       // 5 minutes
export const CLAIM_TIMEOUT_MS = 30 * 60_000;       // 30 minutes

export function groupKey(r: { company: string; startDate: string; endDate: string; zone?: string | null }): string {
  return [r.company, r.startDate, r.endDate, r.zone ?? ''].join('|');
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

export async function logTransition(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  params: {
    recordIds: string[];
    to: string;
    from?: string | null;
    actor: string;
    machine?: string | null;
    error?: string | null;
  },
) {
  // Use createMany for efficiency — the plan explicitly says syncLog.createMany
  await tx.syncLog.createMany({
    data: params.recordIds.map((recordId) => ({
      recordId,
      fromStatus: params.from ?? null,
      toStatus: params.to,
      actor: params.actor,
      machine: params.machine ?? null,
      error: params.error ?? null,
    })),
  });
}
