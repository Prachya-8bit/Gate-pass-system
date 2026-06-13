// Seed: default admin + demo contractor users + 7 demo records (matches UI/gp-atoms.jsx seedData)
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const admin = await prisma.user.upsert({
    where: { credential: 'admin' },
    update: {},
    create: {
      credential: 'admin',
      password: bcrypt.hashSync('admin123', 10),
      role: 'admin',
    },
  });

  // Contractor accounts that own the demo records
  const phones = ['0891234567', '0812345678', '0823456789'];
  const contractors: Record<string, string> = {};
  for (const phone of phones) {
    const u = await prisma.user.upsert({
      where: { credential: phone },
      update: {},
      create: {
        credential: phone,
        password: bcrypt.hashSync('demo123', 10),
        role: 'contractor',
      },
    });
    contractors[phone] = u.id;
  }

  const demo = [
    { name: 'นายสมชาย ใจดี',      idCard: '1100112345678', company: 'บจก. สยามก่อสร้าง',      job: 'ช่างไฟฟ้า',  zone: 'Zone A', startDate: '2026-05-01', endDate: '2026-05-15', manDays: 15, createdAt: '2026-05-01', by: '0891234567', accident: false },
    { name: 'นายวิชัย พงษ์ดี',     idCard: '3200234567890', company: 'บจก. สยามก่อสร้าง',      job: 'ช่างสี',     zone: 'Zone B', startDate: '2026-05-10', endDate: '2026-05-25', manDays: 16, createdAt: '2026-05-10', by: '0891234567', accident: false },
    { name: 'นางสาววิภา มีสุข',    idCard: '4300345678901', company: 'บจก. ไทยอิเล็คทริค',   job: 'ช่างไฟฟ้า',  zone: 'Zone A', startDate: '2026-05-15', endDate: '2026-05-28', manDays: 14, createdAt: '2026-05-15', by: '0812345678', accident: false },
    { name: 'นายประวิทย์ เก่งมาก', idCard: '5400456789012', company: 'หจก. พิษณุโลก วิศวกรรม', job: 'แรงงาน',     zone: 'Zone C', startDate: '2026-05-12', endDate: '2026-05-20', manDays: 9,  createdAt: '2026-05-12', by: '0823456789', accident: true  },
    { name: 'นายกิตติ ดีใจ',       idCard: '6500567890123', company: 'บจก. นวการก่อสร้าง',    job: 'ช่างเชื่อม', zone: 'Zone B', startDate: '2026-05-20', endDate: '2026-06-05', manDays: 17, createdAt: '2026-05-20', by: '0891234567', accident: false },
    { name: 'นายอนุชา รักงาน',     idCard: '7600678901234', company: 'บจก. ไทยอิเล็คทริค',   job: 'ช่างประปา',  zone: 'Zone A', startDate: '2026-06-01', endDate: '2026-06-10', manDays: 10, createdAt: '2026-06-01', by: '0812345678', accident: false },
    { name: 'นางสาวรัตนา สดใส',    idCard: '8700789012345', company: 'บจก. สยามก่อสร้าง',      job: 'แรงงาน',     zone: 'Zone C', startDate: '2026-06-05', endDate: '2026-06-15', manDays: 11, createdAt: '2026-06-05', by: '0891234567', accident: false },
  ];

  const existing = await prisma.record.count();
  if (existing === 0) {
    for (const d of demo) {
      const { by, ...rec } = d;
      await prisma.record.create({ data: { ...rec, createdBy: contractors[by] } });
    }
  }

  console.log('Seed เสร็จสิ้น: admin =', admin.credential, '| records =', await prisma.record.count());
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
