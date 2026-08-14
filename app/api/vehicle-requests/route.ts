import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { ensureCompanyExists } from '@/lib/companies';
import { VEHICLE_SELECT } from '@/lib/vehicle';
import { normalizePlate, validateVehicleInput, type VehicleInput } from '@/lib/vehicle-validate';

// GET — admin only. ไม่มี pagination (parity กับ /api/records)
export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์เข้าถึง' }, { status: 403 });
  }

  const company = request.nextUrl.searchParams.get('company');
  const rows = await prisma.vehicleRequest.findMany({
    where: company ? { company } : undefined,
    select: VEHICLE_SELECT,
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json(rows);
}

// POST — contractor only (admin ยิงเองจะได้ 403 เหมือน /api/records โดยเจตนา)
// รับ object เดียว ไม่ใช่ array เพราะ 1 คำขอ = 1 คัน
export async function POST(request: NextRequest) {
  const session = await getSession(request);
  if (!session || session.role !== 'contractor') {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์เข้าถึง' }, { status: 403 });
  }

  let body: VehicleInput;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 });
  }

  const invalid = validateVehicleInput(body);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  // canonicalize ชื่อบริษัทเหมือนฝั่ง record เพื่อให้ตัวกรอง/สรุปของ admin ไม่แตกกลุ่ม
  const company = await ensureCompanyExists(body.company!.trim());

  const created = await prisma.vehicleRequest.create({
    data: {
      plant: body.plant!,
      company,
      driverName: body.driverName!.trim(),
      plateNumber: normalizePlate(body.plateNumber!),
      plateProvince: body.plateProvince!,
      location: body.location!.trim(),
      reason: body.reason!.trim(),
      contactTel: body.contactTel?.trim() || null,
      startDate: body.startDate!,
      startTime: body.startTime!,
      endDate: body.endDate!,
      endTime: body.endTime!,
      createdAt: new Date().toISOString().slice(0, 10),
      createdBy: session.id,
    },
    select: { id: true },
  });

  return NextResponse.json({ success: true, id: created.id }, { status: 201 });
}
