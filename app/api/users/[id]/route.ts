import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';

const userSelect = {
  id: true,
  credential: true,
  contactName: true,
  role: true,
  createdAt: true,
} as const;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession(request);
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์เข้าถึง' }, { status: 403 });
  }

  const { id } = await params;

  let body: { password?: string; contactName?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'ไม่พบผู้ใช้ที่ระบุ' }, { status: 404 });
  }

  const data: { password?: string; contactName?: string } = {};

  if (body.password !== undefined) {
    if (body.password.length < 8) {
      return NextResponse.json(
        { error: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร' },
        { status: 400 },
      );
    }
    data.password = bcrypt.hashSync(body.password, 10);
  }

  if (body.contactName !== undefined) {
    data.contactName = body.contactName.trim();
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'ไม่มีข้อมูลให้แก้ไข' }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id },
    data,
    select: userSelect,
  });

  return NextResponse.json(updated);
}
