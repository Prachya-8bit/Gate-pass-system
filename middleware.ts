import { NextRequest, NextResponse } from 'next/server';
import { getSession, type Role } from '@/lib/auth';

export async function middleware(request: NextRequest) {
  const session = await getSession(request);
  const { pathname } = request.nextUrl;

  if (!session) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  // Explicit role requirement per path prefix
  const requiredRole: Role | null = pathname.startsWith('/admin')
    ? 'admin'
    : pathname.startsWith('/contractor')
      ? 'contractor'
      : null;

  if (!requiredRole || session.role !== requiredRole) {
    return NextResponse.json(
      { error: 'ไม่มีสิทธิ์เข้าถึงหน้านี้' },
      { status: 403 },
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/contractor/:path*', '/admin/:path*'],
};
