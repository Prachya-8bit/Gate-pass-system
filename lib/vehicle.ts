// ค่าคงที่และกฎของ "ขออนุมัตินำรถยนต์เข้ามาปฏิบัติงานภายในโรงงาน"
//
// ทุกอย่างในไฟล์นี้ถอดมาจากฟอร์มจริง EPRO reg/FrmOperation.aspx (ดู
// automation/pages/FrmVehicle.controls.json) ฟอร์มฝั่งเราและ validation ฝั่ง
// server อ่านจากที่นี่ที่เดียว ถ้า EPRO เปลี่ยน dropdown ให้แก้ไฟล์นี้ที่เดียว
//
// ไฟล์นี้ต้อง client-safe — ห้าม import @/lib/db เพราะถูก import จาก component

import type { Prisma } from '@prisma/client';

export const VEHICLE_LABELS = {
  plant: 'โรงงาน',
  company: 'ชื่อบริษัท/หน่วยงาน',
  driverName: 'ชื่อพนักงานขับรถ',
  plateNumber: 'เลขทะเบียน',
  plateProvince: 'จังหวัด',
  location: 'สถานที่ปฏิบัติงาน',
  reason: 'เหตุผลที่ต้องใช้รถ',
  contactTel: 'เบอร์ติดต่อ',
  startDate: 'วันที่เริ่ม',
  startTime: 'เวลาเริ่ม',
  endDate: 'วันที่สิ้นสุด',
  endTime: 'เวลาสิ้นสุด',
} as const;

export type VehicleField = keyof typeof VEHICLE_LABELS;

/** ddlPlant — value ต้องตรงกับ EPRO ห้ามแก้ตัวเลข */
export const PLANTS: { value: string; label: string }[] = [
  { value: '4911', label: 'SYS-MTP' },
  { value: '4931', label: 'SYS-HP' },
  { value: '4951', label: 'SYS-BDC' },
];

/** value → label เช่น "4911" → "SYS-MTP" ใช้แสดงค่าที่เก็บไว้แล้ว */
export const PLANT_LABELS: Record<string, string> = Object.fromEntries(
  PLANTS.map((p) => [p.value, p.label]),
);

/**
 * label → value เช่น "SYS-MTP" → "4911"
 *
 * SelBox เก็บค่าเท่ากับที่แสดง (options เป็น string[]) ฟอร์มจึงถือ label ไว้
 * แล้วแปลงเป็น value ตอนส่ง API — ที่บันทึกลง DB และส่งให้ EPRO ต้องเป็น value
 */
export const PLANT_VALUE_BY_LABEL: Record<string, string> = Object.fromEntries(
  PLANTS.map((p) => [p.label, p.value]),
);

/**
 * ddlProvience — 77 จังหวัด เรียงตามลำดับที่ EPRO ให้มา
 *
 * ⚠️ ค่า value จริงใน EPRO ห่อด้วย non-breaking space (U+00A0) ทั้งหัวและท้าย
 * เช่น " กระบี่ " ตรวจแล้วเป็นแบบนี้ทั้ง 77 ตัว ที่นี่เก็บชื่อสะอาด
 * ส่วน RPA เป็นคนห่อ NBSP กลับตอน selectOption (ดู automation/selectors.mjs)
 */
export const PLATE_PROVINCES: string[] = [
  'กระบี่', 'กรุงเทพมหานคร', 'กาญจนบุรี', 'กาฬสินธุ์',
  'กำแพงเพชร', 'ขอนแก่น', 'จันทบุรี', 'ฉะเชิงเทรา',
  'ชลบุรี', 'ชัยนาท', 'ชัยภูมิ', 'ชุมพร',
  'เชียงราย', 'เชียงใหม่', 'ตรัง', 'ตราด',
  'ตาก', 'นครนายก', 'นครปฐม', 'นครพนม',
  'นครราชสีมา', 'นครศรีธรรมราช', 'นครสวรรค์', 'นนทบุรี',
  'นราธิวาส', 'น่าน', 'บึงกาฬ', 'บุรีรัมย์',
  'ปทุมธานี', 'ประจวบคีรีขันธ์', 'ปราจีนบุรี', 'ปัตตานี',
  'พระนครศรีอยุธยา', 'พะเยา', 'พังงา', 'พัทลุง',
  'พิจิตร', 'พิษณุโลก', 'เพชรบุรี', 'เพชรบูรณ์',
  'แพร่', 'ภูเก็ต', 'มหาสารคาม', 'มุกดาหาร',
  'แม่ฮ่องสอน', 'ยโสธร', 'ยะลา', 'ร้อยเอ็ด',
  'ระนอง', 'ระยอง', 'ราชบุรี', 'ลพบุรี',
  'ลำปาง', 'ลำพูน', 'เลย', 'ศรีสะเกษ',
  'สกลนคร', 'สงขลา', 'สตูล', 'สมุทรปราการ',
  'สมุทรสงคราม', 'สมุทรสาคร', 'สระแก้ว', 'สระบุรี',
  'สิงห์บุรี', 'สุโขทัย', 'สุพรรณบุรี', 'สุราษฎร์ธานี',
  'สุรินทร์', 'หนองคาย', 'หนองบัวลำภู', 'อ่างทอง',
  'อำนาจเจริญ', 'อุดรธานี', 'อุตรดิตถ์', 'อุทัยธานี',
  'อุบลราชธานี',
];

/** ชั่วโมง 00–23 ตรงกับ ddlShour / ddlEhour */
export const TIME_HOURS: string[] = Array.from({ length: 24 }, (_, i) =>
  String(i).padStart(2, '0'),
);

/**
 * ⚠️ ddlSMin / ddlEMin ของ EPRO มี 59 ตัวเลือก ไม่ใช่ 60 — **ขาดค่า "10"**
 * ถ้าปล่อยให้เลือกนาที 10 แล้ว RPA เรียก selectOption('10') จะ throw ทุกครั้ง
 * จำกัดเป็นราย 15 นาที ซึ่งเลี่ยง 10 พอดีและกรอกบนมือถือง่ายกว่า
 */
export const TIME_MINUTES: string[] = ['00', '15', '30', '45'];

/** EPRO บังคับว่าเวลาเริ่มต้องห่างจาก "ตอนกดบันทึกใน EPRO" อย่างน้อย 1 ชั่วโมง */
export const VEHICLE_LEAD_MINUTES = 60;

/**
 * เตือนแบบไม่บล็อกเมื่อเวลาเริ่มเหลือน้อยกว่านี้ — กฎ EPRO วัดตอน RPA กดบันทึก
 * ไม่ใช่ตอนผู้รับเหมากรอก ระหว่างนั้นมี admin ยืนยัน + cron 10 นาที
 */
export const VEHICLE_RISKY_LEAD_MINUTES = 120;

// ช่วงวันที่ใช้ MIN_SPAN_DAYS / MAX_SPAN_DAYS ตัวเดียวกับฟอร์มลงทะเบียนแรงงาน
// (span 1–6 วัน = calcMD 2–7 วัน ห้ามวันเดียวกัน) จึงไม่มีค่าคงที่ของตัวเองที่นี่

/** เวลาไทยเป็น UTC+7 ตายตัว (ไม่มี DST) — server บน Vercel รันเป็น UTC */
const THAI_UTC_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * แปลง "YYYY-MM-DD" + "HH:MM" (เวลาไทย) เป็น Date
 *
 * ต้องระบุ offset +07:00 ชัดเจน ห้ามพึ่ง local time ของ process เพราะ
 * client รันในเบราว์เซอร์ (เวลาไทย) แต่ server รันบน Vercel (UTC)
 * ถ้าใช้ local time ผลจะต่างกัน 7 ชั่วโมงระหว่างสองฝั่ง
 */
export function thaiDateTime(date: string, time: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const d = new Date(`${date}T${time}:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getTime() - THAI_UTC_OFFSET_MS);
}

/** นาทีจากตอนนี้ถึงเวลาเริ่ม — ติดลบแปลว่าเลยไปแล้ว */
export function minutesUntil(date: string, time: string, now: Date = new Date()): number | null {
  const target = thaiDateTime(date, time);
  if (!target) return null;
  return Math.floor((target.getTime() - now.getTime()) / 60_000);
}

export const VEHICLE_SELECT = {
  id: true,
  plant: true,
  company: true,
  driverName: true,
  plateNumber: true,
  plateProvince: true,
  location: true,
  reason: true,
  contactTel: true,
  startDate: true,
  startTime: true,
  endDate: true,
  endTime: true,
  createdAt: true,
  createdBy: true,
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
  author: { select: { credential: true } },
} satisfies Prisma.VehicleRequestSelect;
