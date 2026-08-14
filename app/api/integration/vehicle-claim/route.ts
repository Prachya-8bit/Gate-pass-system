import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireApiKey } from '@/lib/integration-auth';
import { claimCutoffs, claimData, claimableWhere, logTransition } from '@/lib/sync';

// endpoint คู่ใหม่แยกจาก /claim ของฝั่งคนงานโดยเจตนา ไม่ทำ formType บน route เดิม
// เพราะถ้า RPA เก่าบนเครื่องโรงงาน (deploy แยกจาก Vercel) ยิงมาที่ route ที่เปลี่ยน
// สัญญาไปแล้ว ผลที่เป็นไปได้คือ 200 พร้อม payload ผิดแบบเงียบๆ ส่วนการแยก endpoint
// ทำให้ผลที่แย่ที่สุดเป็นแค่ 404 ซึ่งเห็นชัดใน log
//
// ต่างจากฝั่งคนงานตรงไม่มีการจัดกลุ่ม — 1 คำขอ = 1 คัน = 1 แถว จึงไม่ต้องมี groupKey
// และ batchKey = id ของแถวนั้นเอง
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

  const { now, claimTimeoutCutoff, retryBackoffCutoff } = claimCutoffs();

  let result: { batchKey: string; vehicle: Record<string, unknown> } | null;

  try {
    result = await prisma.$transaction(
      async (tx) => {
        // reap คำขอที่ค้างสถานะ SYNCING นานเกินกำหนด — ทำเฉพาะตารางนี้
        // หมายเหตุ: reap เกิดขึ้นตอน claim เท่านั้น ถ้าสคริปต์ฝั่งรถหยุดทำงาน
        // แถวที่ค้างจะไม่ถูก reap (พฤติกรรมเดียวกับฝั่งคนงาน)
        const stuck = await tx.vehicleRequest.findMany({
          where: { syncStatus: 'SYNCING', claimedAt: { lt: claimTimeoutCutoff } },
          select: { id: true },
        });
        if (stuck.length > 0) {
          const stuckIds = stuck.map((r) => r.id);
          await tx.vehicleRequest.updateMany({
            where: { id: { in: stuckIds } },
            data: { syncStatus: 'NEEDS_REVIEW' },
          });
          await logTransition(tx, {
            recordIds: stuckIds,
            to: 'NEEDS_REVIEW',
            from: 'SYNCING',
            actor: 'system:reaper',
            kind: 'vehicle',
          });
        }

        // createdAt เป็น string วันที่ล้วน ทุกแถวที่ยื่นวันเดียวกันจึงเสมอกันหมด
        // ต้องมี tiebreak ด้วย id ไม่งั้นการหยิบแถวเดียวจะได้ผลไม่แน่นอนคนละรอบ
        const target = await tx.vehicleRequest.findFirst({
          where: claimableWhere(retryBackoffCutoff),
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: { id: true },
        });
        if (!target) return null;

        // compare-and-set — จุดเดียวที่กันการส่งซ้ำ ถ้ามี run อื่นชิงไปแล้ว
        // สถานะจะไม่ใช่ CONFIRMED/FAILED อีก updateMany จึงได้ count 0
        const claimed = await tx.vehicleRequest.updateMany({
          where: { id: target.id, syncStatus: { in: ['CONFIRMED', 'FAILED'] } },
          data: claimData(runId, target.id, now),
        });
        if (claimed.count !== 1) return null;

        await logTransition(tx, {
          recordIds: [target.id],
          to: 'SYNCING',
          from: null,
          actor: `rpa:${runId}`,
          kind: 'vehicle',
        });

        const vehicle = await tx.vehicleRequest.findUniqueOrThrow({
          where: { id: target.id },
          select: {
            id: true,
            plant: true,
            company: true,
            driverName: true,
            plateNumber: true,
            plateProvince: true,
            location: true,
            reason: true,
            contactTel: true,
            startDate: true,
            startTime: true,
            endDate: true,
            endTime: true,
          },
        });

        return { batchKey: target.id, vehicle };
      },
      { timeout: 20_000, maxWait: 10_000 },
    );
  } catch (e) {
    console.error('vehicle-claim transaction failed', e);
    return NextResponse.json(
      { error: 'ระบบฐานข้อมูลไม่พร้อมใช้งาน กรุณาลองใหม่' },
      { status: 503 },
    );
  }

  // key ชื่อ vehicle ไม่ใช่ workOrder โดยเจตนา — สคริปต์ที่ถูกชี้ผิด endpoint
  // จะ destructure undefined แล้วตายทันที ดีกว่ากรอกฟอร์มไปครึ่งใบ
  if (!result) return NextResponse.json({ vehicle: null });
  return NextResponse.json(result);
}
