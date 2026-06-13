import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function POST(request: NextRequest) {
  const session = await getSession(request);
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์เข้าถึง' }, { status: 403 });
  }

  let body: { credential?: string; password?: string; role?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 });
  }

  const credential = body.credential?.trim();
  const { password, role } = body;
  if (!credential || !password) {
    return NextResponse.json({ error: 'กรุณากรอกข้อมูลให้ครบถ้วน' }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json(
      { error: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' },
      { status: 400 },
    );
  }
  if (role !== 'contractor' && role !== 'admin') {
    return NextResponse.json({ error: 'สิทธิ์การใช้งานไม่ถูกต้อง' }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { credential } });
  if (existing) {
    return NextResponse.json(
      { error: 'เบอร์โทรหรืออีเมลนี้ถูกใช้งานแล้ว' },
      { status: 409 },
    );
  }

  const user = await prisma.user.create({
    data: {
      credential,
      password: bcrypt.hashSync(password, 10),
      role,
    },
  });

  return NextResponse.json(
    { success: true, id: user.id, credential: user.credential, role: user.role },
    { status: 201 },
  );
}
