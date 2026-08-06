// Seed: default admin only — contractor accounts are created by the admin
// via the dashboard, and records come from real form submissions.
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// รายชื่อบริษัทที่เคย hardcode ไว้ใน lib/constants.ts — seed เข้า Company table
// ครั้งเดียวตอน migrate ไป DB-backed list กันไม่ให้ suggestion list ว่างเปล่า
const INITIAL_COMPANIES = [
  'ABB',
  'BRAINIC',
  'C.E.MECH',
  'FUJI',
  'InspiredTech',
  'Innomatic',
  'MATFORCON',
  'P-WINNER',
];

async function main() {
  // Production: set SEED_ADMIN_PASSWORD so the real admin password never
  // appears in the codebase. Falls back to admin123 for local dev only.
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'admin123';

  const admin = await prisma.user.upsert({
    where: { credential: 'admin' },
    update: {},
    create: {
      credential: 'admin',
      password: bcrypt.hashSync(adminPassword, 10),
      role: 'admin',
    },
  });

  for (const name of INITIAL_COMPANIES) {
    await prisma.company.upsert({ where: { name }, update: {}, create: { name } });
  }

  console.log('Seed เสร็จสิ้น: admin =', admin.credential, '| records =', await prisma.record.count());
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
