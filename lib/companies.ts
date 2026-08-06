import { prisma } from '@/lib/db';

// เพิ่มชื่อบริษัทเข้า Company table ถ้ายังไม่มี — เทียบแบบไม่สนตัวพิมพ์ใหญ่-เล็ก
// กันไม่ให้ "ABB" กับ "abb" กลายเป็นสองแถวใน suggestion list
// คืนชื่อที่ใช้จริง (canonical) เพื่อให้ Record.company ใช้ตัวสะกดเดียวกันเสมอ
// — ไม่งั้น admin filter/สรุป man-day ต่อบริษัทจะแยก "ABB" กับ "abb" เป็นคนละกลุ่ม
export async function ensureCompanyExists(name: string): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) return trimmed;
  const existing = await prisma.company.findFirst({
    where: { name: { equals: trimmed, mode: 'insensitive' } },
  });
  if (existing) return existing.name;
  const created = await prisma.company.create({ data: { name: trimmed } });
  return created.name;
}
