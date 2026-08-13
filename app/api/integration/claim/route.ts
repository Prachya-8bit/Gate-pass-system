import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireApiKey } from '@/lib/integration-auth';
import { groupKey, MAX_ATTEMPTS, RETRY_BACKOFF_MS, CLAIM_TIMEOUT_MS, logTransition } from '@/lib/sync';

interface ClaimBody {
  runId?: string;
}

export async function POST(request: NextRequest) {
  const authError = requireApiKey(request);
  if (authError) return authError;

  let body: ClaimBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 });
  }

  const runId = body.runId;
  if (!runId || typeof runId !== 'string') {
    return NextResponse.json({ error: 'ต้องระบุ runId' }, { status: 400 });
  }

  const now = new Date();
  const claimTimeoutCutoff = new Date(now.getTime() - CLAIM_TIMEOUT_MS);
  const retryBackoffCutoff = new Date(now.getTime() - RETRY_BACKOFF_MS);

  // Explicit type: the transaction either claims a group or returns null.
  let result: {
    batchKey: string;
    workOrder: { company: string; startDate: string; endDate: string; zone: string | null };
    workers: { id: string; name: string; idCard: string; job: string | null }[];
  } | null;

  try {
    result = await prisma.$transaction(
      async (tx) => {
        // Reap SYNCING records that have been claimed for too long
        const stuck = await tx.record.findMany({
          where: { syncStatus: 'SYNCING', claimedAt: { lt: claimTimeoutCutoff } },
          select: { id: true },
        });
        if (stuck.length > 0) {
          const stuckIds = stuck.map((r) => r.id);
          await tx.record.updateMany({
            where: { id: { in: stuckIds } },
            data: { syncStatus: 'NEEDS_REVIEW' },
          });
          await logTransition(tx, {
            recordIds: stuckIds,
            to: 'NEEDS_REVIEW',
            from: 'SYNCING',
            actor: 'system:reaper',
          });
        }

        // Find claimable records: confirmed, or failed-but-retryable
        const claimable = await tx.record.findMany({
          where: {
            OR: [
              { syncStatus: 'CONFIRMED' },
              {
                syncStatus: 'FAILED',
                syncAttempt: { lt: MAX_ATTEMPTS },
                lastSyncAt: { lt: retryBackoffCutoff },
              },
            ],
          },
          select: { id: true, company: true, startDate: true, endDate: true, zone: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        });

        if (claimable.length === 0) return null;

        // Group by work-order key, take the earliest group
        const earliest = claimable[0];
        const key = groupKey(earliest);
        const group = claimable.filter((r) => groupKey(r) === key);
        const ids = group.map((r) => r.id);

        // Compare-and-set: only succeeds if no one else claimed these first
        const claimed = await tx.record.updateMany({
          where: { id: { in: ids }, syncStatus: { in: ['CONFIRMED', 'FAILED'] } },
          data: {
            syncStatus: 'SYNCING',
            claimedAt: now,
            claimedBy: runId,
            batchKey: key,
            lastSyncAt: now,
            syncAttempt: { increment: 1 },
          },
        });

        if (claimed.count !== ids.length) return null;

        await logTransition(tx, {
          recordIds: ids,
          to: 'SYNCING',
          from: null,
          actor: `rpa:${runId}`,
        });

        const workers = await tx.record.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true, idCard: true, job: true },
        });

        return {
          batchKey: key,
          workOrder: {
            company: earliest.company,
            startDate: earliest.startDate,
            endDate: earliest.endDate,
            zone: earliest.zone,
          },
          workers,
        };
      },
      { timeout: 20_000, maxWait: 10_000 },
    );
  } catch (e) {
    // Prisma's default 5s interactive-transaction timeout vs a Neon cold start
    // surfaces as P2028. Without this catch it became a bare 500, and the RPA
    // treated that as fatal and skipped the whole tick. 503 says "retryable".
    console.error('claim transaction failed', e);
    return NextResponse.json(
      { error: 'ระบบฐานข้อมูลไม่พร้อมใช้งาน กรุณาลองใหม่' },
      { status: 503 },
    );
  }

  if (!result) {
    return NextResponse.json({ workOrder: null });
  }

  return NextResponse.json(result);
}
