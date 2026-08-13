import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireApiKey } from '@/lib/integration-auth';
import { logTransition, reportOutcome, type ReportResult, type ErrorClass } from '@/lib/sync';

interface ReportBody {
  runId?: string;
  batchKey?: string;
  result?: ReportResult;
  error?: string;
  errorClass?: ErrorClass;
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

  const outcome = reportOutcome(result, errorClass, error);

  await prisma.$transaction(async (tx) => {
    const matching = await tx.record.findMany({ where: guard, select: { id: true } });
    if (matching.length === 0) return;
    const ids = matching.map((r) => r.id);

    await tx.record.updateMany({ where: guard, data: outcome.data });
    await logTransition(tx, {
      recordIds: ids,
      to: outcome.to,
      from: 'SYNCING',
      actor: `rpa:${runId}`,
      error: outcome.error,
    });
  });

  return NextResponse.json({ acknowledged: true });
}
