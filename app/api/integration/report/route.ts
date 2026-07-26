import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireApiKey } from '@/lib/integration-auth';
import { MAX_ATTEMPTS, logTransition } from '@/lib/sync';

interface ReportBody {
  runId?: string;
  batchKey?: string;
  result?: 'ok' | 'failed' | 'unknown';
  error?: string;
  errorClass?: 'retryable' | 'permanent' | null;
}

export async function POST(request: NextRequest) {
  const authError = requireApiKey(request);
  if (authError) return authError;

  let body: ReportBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 });
  }

  const { runId, batchKey, result, error, errorClass } = body;
  if (!runId || !batchKey || !result) {
    return NextResponse.json({ error: 'ต้องระบุ runId, batchKey, result' }, { status: 400 });
  }

  // Guard: only touch records this run currently owns, mid-sync, for this batch.
  // A report from a stale/superseded run silently matches nothing — not an error.
  const guard = { batchKey, claimedBy: runId, syncStatus: 'SYNCING' as const };

  await prisma.$transaction(async (tx) => {
    const matching = await tx.record.findMany({ where: guard, select: { id: true } });
    if (matching.length === 0) return;
    const ids = matching.map((r) => r.id);
    const actor = `rpa:${runId}`;

    if (result === 'ok') {
      await tx.record.updateMany({
        where: guard,
        data: { syncStatus: 'SYNCED', syncedAt: new Date() },
      });
      await logTransition(tx, { recordIds: ids, to: 'SYNCED', from: 'SYNCING', actor });
    } else if (result === 'failed' && errorClass === 'permanent') {
      await tx.record.updateMany({
        where: guard,
        data: { syncStatus: 'FAILED', lastSyncError: error ?? null, syncAttempt: MAX_ATTEMPTS },
      });
      await logTransition(tx, { recordIds: ids, to: 'FAILED', from: 'SYNCING', actor, error });
    } else if (result === 'failed') {
      await tx.record.updateMany({
        where: guard,
        data: { syncStatus: 'FAILED', lastSyncError: error ?? null },
      });
      await logTransition(tx, { recordIds: ids, to: 'FAILED', from: 'SYNCING', actor, error });
    } else {
      await tx.record.updateMany({
        where: guard,
        data: { syncStatus: 'NEEDS_REVIEW' },
      });
      await logTransition(tx, { recordIds: ids, to: 'NEEDS_REVIEW', from: 'SYNCING', actor });
    }
  });

  return NextResponse.json({ acknowledged: true });
}
