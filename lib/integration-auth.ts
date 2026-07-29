import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';

function keyMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Require x-api-key header. Returns null if auth passes, or a 401/503 NextResponse if it fails.
 * Callers should return the response immediately.
 */
export function requireApiKey(request: NextRequest): NextResponse | null {
  const expected = process.env.INTEGRATION_API_KEY;
  if (!expected) {
    return NextResponse.json(
      { error: 'ระบบยังไม่ได้ตั้งค่า INTEGRATION_API_KEY' },
      { status: 503 },
    );
  }

  const provided = request.headers.get('x-api-key');
  if (!provided || !keyMatches(provided, expected)) {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์เข้าถึง' }, { status: 401 });
  }

  return null;
}
