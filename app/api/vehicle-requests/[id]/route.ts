import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { logTransition } from '@/lib/sync';
import { VEHICLE_SELECT } from '@/lib/vehicle';

// PATCH แบบ action-based ลอกโครงจาก app/api/records/[id]/route.ts
// ต่างกันตรงไม่มี legacy path แบบไม่ส่ง body (ไม่มีธงอุบัติเหตุสำหรับรถ)
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession(request);
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์เข้าถึง' }, { status: 403 });
  }

  const { id } = await params;

  let body: { action?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 });
  }

  const actor = `admin:${session.id}`;
  let where: Prisma.VehicleRequestWhereInput;
  let data: Prisma.VehicleRequestUpdateManyMutationInput;
  let to: string;
  let from: string | null;
  let errorMessage: string;

  switch (body?.action) {
    case 'confirm':
      from = 'PENDING';
      to = 'CONFIRMED';
      where = { id, syncStatus: 'PENDING' };
      data = { syncStatus: 'CONFIRMED', confirmedAt: new Date(), confirmedBy: session.id };
      errorMessage = 'ไม่สามารถยืนยันได้ ต้องมีสถานะรอยืนยันเท่านั้น';
      break;
    case 'unconfirm':
      from = 'CONFIRMED';
      to = 'PENDING';
      where = { id, syncStatus: 'CONFIRMED' };
      data = { syncStatus: 'PENDING', confirmedAt: null, confirmedBy: null };
      errorMessage = 'ส่งเข้า EPRO แล้ว ไม่สามารถยกเลิกการยืนยันได้';
      break;
    case 'retry':
      from = 'FAILED';
      to = 'CONFIRMED';
      where = { id, syncStatus: 'FAILED' };
      data = { syncStatus: 'CONFIRMED', syncAttempt: 0 };
      errorMessage = 'ไม่สามารถส่งใหม่ได้ ต้องมีสถานะไม่สำเร็จเท่านั้น';
      break;
    case 'resolveSynced':
      from = 'NEEDS_REVIEW';
      to = 'SYNCED';
      where = { id, syncStatus: 'NEEDS_REVIEW' };
      data = { syncStatus: 'SYNCED', syncedAt: new Date() };
      errorMessage = 'ไม่สามารถระบุว่าส่งแล้วได้ ต้องมีสถานะต้องตรวจสอบเท่านั้น';
      break;
    case 'resolveNotSynced':
      from = 'NEEDS_REVIEW';
      to = 'CONFIRMED';
      where = { id, syncStatus: 'NEEDS_REVIEW' };
      data = { syncStatus: 'CONFIRMED' };
      errorMessage = 'ไม่สามารถระบุว่ายังไม่ส่งได้ ต้องมีสถานะต้องตรวจสอบเท่านั้น';
      break;
    case 'cancel':
      from = null;
      to = 'CANCELLED';
      where = { id, syncStatus: { notIn: ['SYNCED', 'SYNCING'] } };
      data = { syncStatus: 'CANCELLED' };
      errorMessage = 'ส่งเข้า EPRO แล้ว ไม่สามารถยกเลิกได้';
      break;
    default:
      return NextResponse.json({ error: 'ไม่รู้จักคำสั่งนี้' }, { status: 400 });
  }

  const updated = await prisma.$transaction(async (tx) => {
    // compare-and-set: guard สถานะต้นทางใน where ห้าม read-then-write
    const result = await tx.vehicleRequest.updateMany({ where, data });
    if (result.count === 0) return null;

    await logTransition(tx, { recordIds: [id], to, from, actor, kind: 'vehicle' });

    return tx.vehicleRequest.findUnique({ where: { id }, select: VEHICLE_SELECT });
  });

  // count === 0 ครอบทั้ง "ไม่พบ id" และ "สถานะต้นทางไม่ตรง" ด้วยข้อความเดียว
  // เหมือนฝั่ง record
  if (!updated) {
    return NextResponse.json({ error: errorMessage }, { status: 400 });
  }

  return NextResponse.json(updated);
}
