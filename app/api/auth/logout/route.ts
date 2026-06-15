import { NextResponse } from 'next/server';
import { COOKIE_NAME } from '@/lib/auth';

export async function POST() {
  const res = NextResponse.json({ success: true });
  // Properly delete the cookie by setting past expiry
  res.cookies.set(COOKIE_NAME, '', {
    httpOnly: true,
    path: '/',
    expires: new Date(0),
    maxAge: 0,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
  return res;
}
