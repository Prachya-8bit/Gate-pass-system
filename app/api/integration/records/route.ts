import { NextRequest, NextResponse } from 'next/server';
import { SyncStatus } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireApiKey } from '@/lib/integration-auth';

// Server-to-server read-only endpoint for the eprocurement system.
// Auth is a shared API key (x-api-key header), not the JWT cookie —
// callers are scheduled jobs, not logged-in users.

export async function GET(request: NextRequest) {
  const authError = requireApiKey(request);
  if (authError) return authError;

  const params = request.nextUrl.searchParams;
  const company = params.get('company');
  const from = params.get('from');
  const to = params.get('to');
  const status = params.get('status');

  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if ((from && !dateRe.test(from)) || (to && !dateRe.test(to))) {
    return NextResponse.json(
      { error: 'รูปแบบวันที่ต้องเป็น YYYY-MM-DD' },
      { status: 400 },
    );
  }

  const statusList = status
    ? (status.split(',').map((s) => s.trim()).filter(Boolean) as SyncStatus[])
    : null;

  // from/to filter on createdAt (submission date) — ISO strings compare correctly
  const records = await prisma.record.findMany({
    where: {
      ...(company ? { company } : {}),
      ...(from || to
        ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
        : {}),
      ...(statusList ? { syncStatus: { in: statusList } } : {}),
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
      syncStatus: true,
      syncAttempt: true,
      lastSyncError: true,
      lastSyncAt: true,
      syncedAt: true,
      claimedAt: true,
      claimedBy: true,
      batchKey: true,
      confirmedAt: true,
      confirmedBy: true,
    },
  });

  return NextResponse.json({ count: records.length, records });
}
