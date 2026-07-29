import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { logTransition } from '@/lib/sync';

const RECORD_SELECT = {
  id: true,
  name: true,
  idCard: true,
  company: true,
  job: true,
  zone: true,
  startDate: true,
  endDate: true,
  manDays: true,
  accident: true,
  createdAt: true,
  createdBy: true,
  syncStatus: true,
  syncAttempt: true,
  lastSyncError: true,
  lastSyncAt: true,
  syncedAt: true,
  claimedAt: true,
  claimedBy: true,
  batchKey: true,
  confirmedAt: true,
  confirmedBy: true,
  author: { select: { credential: true } },
} satisfies Prisma.RecordSelect;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession(request);
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์เข้าถึง' }, { status: 403 });
  }

  const { id } = await params;

  // No body at all is the legacy accident-toggle call — keep it working.
  let body: { action?: string } = {};
  try {
    body = (await request.json()) ?? {};
  } catch {
    body = {};
  }

  if (!body.action || body.action === 'toggleAccident') {
    const record = await prisma.record.findUnique({ where: { id } });
    if (!record) {
      return NextResponse.json({ error: 'ไม่พบรายการที่ระบุ' }, { status: 404 });
    }
    const updated = await prisma.record.update({
      where: { id },
      data: { accident: !record.accident },
    });
    return NextResponse.json(updated);
  }

  const actor = `admin:${session.id}`;
  let where: Prisma.RecordWhereInput;
  let data: Prisma.RecordUpdateManyMutationInput;
  let to: string;
  let from: string | null;
  let errorMessage: string;

  switch (body.action) {
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
    const result = await tx.record.updateMany({ where, data });
    if (result.count === 0) return null;

    await logTransition(tx, { recordIds: [id], to, from, actor });

    return tx.record.findUnique({ where: { id }, select: RECORD_SELECT });
  });

  if (!updated) {
    return NextResponse.json({ error: errorMessage }, { status: 400 });
  }

  return NextResponse.json(updated);
}
