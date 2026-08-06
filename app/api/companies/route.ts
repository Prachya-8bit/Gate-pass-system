import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์เข้าถึง' }, { status: 401 });
  }

  const companies = await prisma.company.findMany({ orderBy: { name: 'asc' } });
  return NextResponse.json(companies.map((c) => c.name));
}
