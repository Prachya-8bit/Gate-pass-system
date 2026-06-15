import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { signToken, COOKIE_NAME, COOKIE_MAX_AGE } from '@/lib/auth';

// Dummy hash for timing-attack resistance when user does not exist.
// Real bcrypt hash of a fixed string so compare takes the same time as a real check.
const DUMMY_HASH = '$2b$10$vAh88reWIodqzTGDA3Qqae7ZWop5FQ21WWwfPhVrPaSw4qqGlpfZe';

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

  // Timing-safe comparison: always run bcrypt even if user not found
  const hash = user?.password ?? DUMMY_HASH;
  const ok = await bcrypt.compare(password, hash);

  if (!user || !ok) {
    return NextResponse.json(
      { error: 'เบอร์โทร/อีเมล หรือรหัสผ่านไม่ถูกต้อง' },
      { status: 401 },
    );
  }

  const token = await signToken({
    id: user.id,
    credential: user.credential,
    role: user.role as 'admin' | 'contractor',
  });

  const res = NextResponse.json({ success: true, role: user.role });
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    path: '/',
    maxAge: COOKIE_MAX_AGE,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
  return res;
}
