import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { prisma } from '@/lib/db';

// Server-to-server read-only endpoint for the eprocurement system.
// Auth is a shared API key (x-api-key header), not the JWT cookie —
// callers are scheduled jobs, not logged-in users.

function keyMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function GET(request: NextRequest) {
  const expected = process.env.INTEGRATION_API_KEY;
  if (!expected) {
    // Fail closed if the key was never configured on this deployment
    return NextResponse.json(
      { error: 'ระบบยังไม่ได้ตั้งค่า INTEGRATION_API_KEY' },
      { status: 503 },
    );
  }

  const provided = request.headers.get('x-api-key');
  if (!provided || !keyMatches(provided, expected)) {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์เข้าถึง' }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const company = params.get('company');
  const from = params.get('from');
  const to = params.get('to');

  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if ((from && !dateRe.test(from)) || (to && !dateRe.test(to))) {
    return NextResponse.json(
      { error: 'รูปแบบวันที่ต้องเป็น YYYY-MM-DD' },
      { status: 400 },
    );
  }

  // from/to filter on createdAt (submission date) — ISO strings compare correctly
  const records = await prisma.record.findMany({
    where: {
      ...(company ? { company } : {}),
      ...(from || to
        ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      idCard: true,
      company: true,
      job: true,
      zone: true,
      startDate: true,
      endDate: true,
      manDays: true,
      accident: true,
      createdAt: true,
      author: { select: { credential: true } },
    },
  });

  return NextResponse.json({ count: records.length, records });
}
