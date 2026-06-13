import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { signToken, COOKIE_NAME, COOKIE_MAX_AGE } from '@/lib/auth';

export async function POST(request: NextRequest) {
  let body: { credential?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 });
  }

  const { credential, password } = body;
  if (!credential || !password) {
    return NextResponse.json({ error: 'กรุณากรอกข้อมูลให้ครบถ้วน' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { credential } });
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return NextResponse.json(
      { error: 'เบอร์โทร/อีเมล หรือรหัสผ่านไม่ถูกต้อง' },
      { status: 401 },
    );
  }

  const token = await signToken({
    id: user.id,
    credential: user.credential,
    role: user.role,
  });

  const res = NextResponse.json({ success: true, role: user.role });
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    path: '/',
    maxAge: COOKIE_MAX_AGE,
    sameSite: 'lax',
  });
  return res;
}
