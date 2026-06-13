import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession(request);
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์เข้าถึง' }, { status: 403 });
  }

  const { id } = await params;
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
