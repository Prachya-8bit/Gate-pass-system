import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { calcMD, COMPANIES } from '@/lib/constants';

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์เข้าถึง' }, { status: 403 });
  }

  const company = request.nextUrl.searchParams.get('company');
  const records = await prisma.record.findMany({
    where: company ? { company } : undefined,
    include: { author: { select: { credential: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json(records);
}

interface IncomingRecord {
  name?: string;
  idCard?: string;
  company?: string;
  job?: string;
  zone?: string;
  startDate?: string;
  endDate?: string;
}

export async function POST(request: NextRequest) {
  const session = await getSession(request);
  if (!session || session.role !== 'contractor') {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์เข้าถึง' }, { status: 403 });
  }

  let body: IncomingRecord[];
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 });
  }

  if (!Array.isArray(body) || body.length === 0) {
    return NextResponse.json({ error: 'ต้องมีรายชื่อแรงงานอย่างน้อย 1 คน' }, { status: 400 });
  }

  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  for (const r of body) {
    if (!r.name?.trim()) {
      return NextResponse.json({ error: 'กรุณากรอกชื่อ-นามสกุลให้ครบทุกคน' }, { status: 400 });
    }
    if (!r.idCard || !/^\d{13}$/.test(r.idCard)) {
      return NextResponse.json(
        { error: 'เลขบัตรประชาชนต้องเป็นตัวเลข 13 หลัก' },
        { status: 400 },
      );
    }
    if (!r.company || r.company === COMPANIES[0]) {
      return NextResponse.json({ error: 'กรุณาเลือกบริษัท' }, { status: 400 });
    }
    if (!r.startDate || !r.endDate || !dateRe.test(r.startDate) || !dateRe.test(r.endDate)) {
      return NextResponse.json(
        { error: 'กรุณาระบุวันที่เริ่มและวันที่สิ้นสุดให้ถูกต้อง' },
        { status: 400 },
      );
    }
    if (new Date(r.endDate) < new Date(r.startDate)) {
      return NextResponse.json(
        { error: 'วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่ม' },
        { status: 400 },
      );
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const created = await prisma.$transaction(
    body.map((r) =>
      prisma.record.create({
        data: {
          name: r.name!.trim(),
          idCard: r.idCard!,
          company: r.company!,
          job: r.job?.trim() || null,
          zone: r.zone?.trim() || null,
          startDate: r.startDate!,
          endDate: r.endDate!,
          manDays: calcMD(r.startDate!, r.endDate!),
          createdAt: today,
          createdBy: session.id,
        },
      }),
    ),
  );

  return NextResponse.json({ success: true, count: created.length }, { status: 201 });
}
