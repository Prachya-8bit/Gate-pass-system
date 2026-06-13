import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

export async function middleware(request: NextRequest) {
  const session = await getSession(request);
  const { pathname } = request.nextUrl;

  if (!session) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  const requiredRole = pathname.startsWith('/admin') ? 'admin' : 'contractor';
  if (session.role !== requiredRole) {
    return new NextResponse('ไม่มีสิทธิ์เข้าถึงหน้านี้ (403 Forbidden)', {
      status: 403,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/contractor/:path*', '/admin/:path*'],
};
