import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireApiKey } from '@/lib/integration-auth';
import { logTransition, reportOutcome, type ErrorClass, type ReportResult } from '@/lib/sync';

// สัญญาเหมือน /api/integration/report ของฝั่งคนงานทุก byte จึง copy reportWithRetry
// ของ RPA มาเปลี่ยนแค่ path ได้เลย
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

  // แตะเฉพาะแถวที่ run นี้จองไว้จริงและยังอยู่กลางทาง
  // รายงานจาก run เก่าที่ถูกแทนที่ไปแล้วจะไม่ match อะไร — เงียบ ไม่ถือเป็น error
  // batchKey = id จึง match ได้มากสุด 1 แถว
  const guard = { batchKey, claimedBy: runId, syncStatus: 'SYNCING' as const };

  const outcome = reportOutcome(result, errorClass, error);

  try {
    await prisma.$transaction(
      async (tx) => {
        const matching = await tx.vehicleRequest.findMany({ where: guard, select: { id: true } });
        if (matching.length === 0) return;
        const ids = matching.map((r) => r.id);

        // updateMany ไม่ใช่ update — where แบบนี้ไม่ unique และถ้าใช้ update/
        // findUniqueOrThrow จะ throw P2025 ตอนรายงานมาจาก run เก่า
        // ทำให้ no-op ที่ตั้งใจให้เงียบกลายเป็น 500
        await tx.vehicleRequest.updateMany({ where: guard, data: outcome.data });
        await logTransition(tx, {
          recordIds: ids,
          to: outcome.to,
          from: 'SYNCING',
          actor: `rpa:${runId}`,
          error: outcome.error,
          kind: 'vehicle',
        });
      },
      { timeout: 20_000, maxWait: 10_000 },
    );
  } catch (e) {
    console.error('vehicle-report transaction failed', e);
    return NextResponse.json(
      { error: 'ระบบฐานข้อมูลไม่พร้อมใช้งาน กรุณาลองใหม่' },
      { status: 503 },
    );
  }

  return NextResponse.json({ acknowledged: true });
}
