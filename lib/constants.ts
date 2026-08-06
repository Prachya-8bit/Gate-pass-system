// Design tokens + shared constants — mirrors UI/gp-atoms.jsx

export const gDS = {
  primary: '#0a1628',
  accent: '#e8a020',
  bg: '#f0f4f8',
  text: '#1a2332',
  muted: '#64748b',
  ok: '#16a34a',
  okBg: '#f0fdf4',
  err: '#dc2626',
  errBg: '#fef2f2',
  border: '#e2e8f0',
  font: "'Prompt', 'Noto Sans Thai', sans-serif",
  r: { s: 6, m: 10, l: 16 },
  sh: '0 2px 8px rgba(0,0,0,0.08)',
} as const;

// จำนวนแรงงานสูงสุดต่อการส่ง 1 ครั้ง
export const MAX_WORKERS_PER_SUBMIT = 10;

// ช่วงวันทำงานที่อนุญาต: วันสิ้นสุดต้องห่างจากวันเริ่ม 1–6 วัน (ห้ามวันเดียวกัน)
export const MIN_SPAN_DAYS = 1;
export const MAX_SPAN_DAYS = 6;

// ระยะห่างเป็นวันระหว่างสองวันที่ (YYYY-MM-DD strings) — ไม่นับหัวนับท้าย
export function spanDays(startDate: string, endDate: string): number {
  return Math.round(
    (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000,
  );
}

// บวกวันเข้ากับวันที่ (YYYY-MM-DD strings) คืนค่าเป็น YYYY-MM-DD
export function addDays(date: string, days: number): string {
  if (!date) return '';
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Man-day count, inclusive of both endpoints (YYYY-MM-DD strings)
export function calcMD(startDate: string, endDate: string): number {
  if (!startDate || !endDate) return 0;
  return Math.max(
    1,
    Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000) + 1,
  );
}
