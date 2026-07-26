import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { logTransition } from '@/lib/sync';

export async function POST(request: NextRequest) {
  const session = await getSession(request);
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์เข้าถึง' }, { status: 403 });
  }

  let body: { ids?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 });
  }

  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return NextResponse.json({ error: 'ต้องระบุรายการที่ต้องการยืนยัน' }, { status: 400 });
  }

  const ids = body.ids;

  const count = await prisma.$transaction(async (tx) => {
    const toConfirm = await tx.record.findMany({
      where: { id: { in: ids }, syncStatus: 'PENDING' },
      select: { id: true },
    });
    if (toConfirm.length === 0) return 0;

    const confirmIds = toConfirm.map((r) => r.id);
    await tx.record.updateMany({
      where: { id: { in: confirmIds }, syncStatus: 'PENDING' },
      data: { syncStatus: 'CONFIRMED', confirmedAt: new Date(), confirmedBy: session.id },
    });

    await logTransition(tx, {
      recordIds: confirmIds,
      to: 'CONFIRMED',
      from: 'PENDING',
      actor: `admin:${session.id}`,
    });

    return confirmIds.length;
  });

  return NextResponse.json({ count });
}
