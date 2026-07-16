// Seed: default admin only — contractor accounts are created by the admin
// via the dashboard, and records come from real form submissions.
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

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

  console.log('Seed เสร็จสิ้น: admin =', admin.credential, '| records =', await prisma.record.count());
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
