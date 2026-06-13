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

export const COMPANIES = [
  '— เลือกบริษัท —',
  'ABB',
  'BRAINIC',
  'C.E.MECH',
  'FUJI',
  'InspiredTech',
  'Innomatic',
  'MATFORCON',
  'P-WINNER',
];

// Man-day count, inclusive of both endpoints (YYYY-MM-DD strings)
export function calcMD(startDate: string, endDate: string): number {
  if (!startDate || !endDate) return 0;
  return Math.max(
    1,
    Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000) + 1,
  );
}
