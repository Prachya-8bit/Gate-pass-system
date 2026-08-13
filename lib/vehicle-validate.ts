// Validation ของคำขอนำรถเข้า — ใช้ตัวเดียวกันทั้งฝั่ง client (VehicleFlow) และ
// ฝั่ง server (POST /api/vehicle-requests) เพื่อไม่ให้กฎสองฝั่งเพี้ยนกัน
// ตามหลักเดิมของโปรเจกต์: ฝั่ง server ไม่เชื่อ client ต้อง validate ซ้ำทุกข้อ
//
// client-safe — ห้าม import @/lib/db

import {
  PLANTS,
  PLATE_PROVINCES,
  TIME_HOURS,
  TIME_MINUTES,
  VEHICLE_LEAD_MINUTES,
  VEHICLE_MAX_SPAN_DAYS,
  minutesUntil,
  thaiDateTime,
} from '@/lib/vehicle';
import { spanDays } from '@/lib/constants';

export interface VehicleInput {
  plant?: string;
  company?: string;
  driverName?: string;
  plateNumber?: string;
  plateProvince?: string;
  location?: string;
  reason?: string;
  contactTel?: string;
  startDate?: string;
  startTime?: string;
  endDate?: string;
  endTime?: string;
}

export const MAX_DRIVER_NAME = 100;
export const MAX_LOCATION = 100;
export const MAX_REASON = 500;
export const MAX_PLATE = 20;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// ทะเบียนไทยรูปแบบหลากหลายมาก (1กก 1234, กข 1234, 70-1234, 8อ4444, ป้ายแดง,
// รถพ่วง, ทะเบียนต่างประเทศ) — เช็คแค่ charset กัน emoji/paste ขยะ
// ห้ามใส่ regex รูปแบบ เพราะจะปฏิเสธรถจริงและทำให้รถติดที่ป้อม
const PLATE_RE = /^[0-9A-Za-zก-๙\s-]{2,20}$/;

/** ตัดช่องว่างซ้ำและ trim — ใช้ทั้งตอน validate และตอนบันทึก ให้ค่าเหมือนกันแน่ */
export function normalizePlate(v: string): string {
  return v.trim().replace(/\s+/g, ' ');
}

function isTime(v: string): boolean {
  const m = /^(\d{2}):(\d{2})$/.exec(v);
  return !!m && TIME_HOURS.includes(m[1]) && TIME_MINUTES.includes(m[2]);
}

/**
 * คืนข้อความ error ไทยข้อแรกที่เจอ หรือ null ถ้าผ่านหมด
 *
 * `now` ส่งเข้ามาได้เพื่อให้ทดสอบกฎ lead time ได้แน่นอน
 */
export function validateVehicleInput(b: VehicleInput, now: Date = new Date()): string | null {
  if (!b.plant || !PLANTS.some((p) => p.value === b.plant)) return 'กรุณาเลือกโรงงาน';

  if (!b.company?.trim()) return 'กรุณาเลือกหรือระบุชื่อบริษัท';

  if (!b.driverName?.trim()) return 'กรุณากรอกชื่อพนักงานขับรถ';
  if (b.driverName.trim().length > MAX_DRIVER_NAME)
    return `ชื่อพนักงานขับรถยาวเกินกำหนด (ไม่เกิน ${MAX_DRIVER_NAME} ตัวอักษร)`;

  const plate = normalizePlate(b.plateNumber ?? '');
  if (!plate) return 'กรุณากรอกเลขทะเบียน';
  if (!PLATE_RE.test(plate)) return 'เลขทะเบียนไม่ถูกต้อง';

  if (!b.plateProvince) return 'กรุณาเลือกจังหวัด';
  if (!PLATE_PROVINCES.includes(b.plateProvince)) return 'จังหวัดไม่ถูกต้อง';

  if (!b.location?.trim()) return 'กรุณากรอกสถานที่ปฏิบัติงาน';
  if (b.location.trim().length > MAX_LOCATION)
    return `สถานที่ปฏิบัติงานยาวเกินกำหนด (ไม่เกิน ${MAX_LOCATION} ตัวอักษร)`;

  if (!b.reason?.trim()) return 'กรุณาระบุเหตุผลที่ต้องใช้รถ';
  if (b.reason.trim().length > MAX_REASON)
    return `เหตุผลยาวเกินกำหนด (ไม่เกิน ${MAX_REASON} ตัวอักษร)`;

  const tel = b.contactTel?.trim();
  if (tel && !/^0\d{8,9}$/.test(tel)) return 'เบอร์ติดต่อต้องเป็นตัวเลข 9–10 หลัก';

  if (!b.startDate || !b.endDate || !b.startTime || !b.endTime)
    return 'กรุณาระบุวันและเวลาให้ครบถ้วน';
  if (!DATE_RE.test(b.startDate) || !DATE_RE.test(b.endDate))
    return 'กรุณาระบุวันที่ให้ถูกต้อง';
  if (!isTime(b.startTime) || !isTime(b.endTime)) return 'กรุณาเลือกเวลาให้ถูกต้อง';

  const start = thaiDateTime(b.startDate, b.startTime);
  const end = thaiDateTime(b.endDate, b.endTime);
  if (!start || !end) return 'กรุณาระบุวันและเวลาให้ถูกต้อง';
  if (end.getTime() <= start.getTime()) return 'เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม';

  const span = spanDays(b.startDate, b.endDate);
  if (span > VEHICLE_MAX_SPAN_DAYS)
    return `ช่วงวันที่ต้องไม่เกิน ${VEHICLE_MAX_SPAN_DAYS} วันนับจากวันที่เริ่ม`;

  // กฎ EPRO — วัดตอนกดบันทึกใน EPRO จริง แต่กันไว้ตั้งแต่ตอนกรอกด้วย
  const lead = minutesUntil(b.startDate, b.startTime, now);
  if (lead === null || lead < VEHICLE_LEAD_MINUTES)
    return 'เวลาเริ่มต้องห่างจากปัจจุบันอย่างน้อย 1 ชั่วโมง';

  return null;
}
