/* gp-atoms.jsx — Design tokens, shared components, and data utilities */
/* Exports to window: gDS, Logo, TopBar, Btn, InpBox, SelBox, DatePick, GCard, Badge, StepBar,
   getRecords, saveRecords, addBatch, calcMD, getSession, setSession, clearSession,
   seedData, COMPANIES */

const { useState: useStateA } = React;

const gDS = {
  primary: '#0a1628', accent: '#e8a020', bg: '#f0f4f8',
  text: '#1a2332', muted: '#64748b', ok: '#16a34a', okBg: '#f0fdf4',
  err: '#dc2626', errBg: '#fef2f2', border: '#e2e8f0',
  font: "'Prompt', 'Noto Sans Thai', sans-serif",
  r: { s: 6, m: 10, l: 16 },
  sh: '0 2px 8px rgba(0,0,0,0.08)',
};

function Logo({ lg, inv }) {
  const sz = lg ? 52 : 34, fn = lg ? 22 : 14;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{
        width: sz, height: sz, background: inv ? '#fff' : gDS.accent,
        borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 800, fontSize: fn, color: gDS.primary, fontFamily: gDS.font, letterSpacing: -0.5,
        flexShrink: 0,
      }}>SYS</div>
      <div style={{ fontFamily: gDS.font, lineHeight: 1.25 }}>
        <div style={{ fontWeight: 700, fontSize: fn * 0.9, color: inv ? '#fff' : gDS.primary }}>Gate Pass</div>
        <div style={{ fontSize: fn * 0.58, color: inv ? 'rgba(255,255,255,0.55)' : gDS.muted }}>Management System</div>
      </div>
    </div>
  );
}

function TopBar({ title, sub, onBack, right }) {
  return (
    <div style={{
      background: gDS.primary, color: '#fff', padding: '11px 16px',
      display: 'flex', alignItems: 'center', gap: 10,
      fontFamily: gDS.font, position: 'sticky', top: 0, zIndex: 20,
      minHeight: 54,
    }}>
      {onBack
        ? <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 20, padding: '2px 8px 2px 0', lineHeight: 1 }}>←</button>
        : <div style={{ width: 30, height: 30, background: gDS.accent, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, color: gDS.primary, fontFamily: gDS.font, flexShrink: 0 }}>SYS</div>
      }
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
        {sub && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 1 }}>{sub}</div>}
      </div>
      {right}
    </div>
  );
}

function Btn({ label, children, onClick, v = 'primary', fw, sm, disabled }) {
  const vs = {
    primary:   { bg: gDS.primary, color: '#fff',      border: 'none' },
    accent:    { bg: gDS.accent,  color: gDS.primary,  border: 'none' },
    secondary: { bg: '#fff',      color: gDS.primary,  border: `2px solid ${gDS.border}` },
    ghost:     { bg: 'transparent', color: gDS.primary, border: `2px solid ${gDS.primary}` },
    ok:        { bg: gDS.ok,      color: '#fff',       border: 'none' },
    danger:    { bg: gDS.err,     color: '#fff',       border: 'none' },
  };
  const s = vs[v] || vs.primary;
  return (
    <button onClick={disabled ? undefined : onClick} style={{
      background: s.bg, color: s.color, border: s.border,
      borderRadius: gDS.r.m, padding: sm ? '8px 14px' : '12px 20px',
      width: fw ? '100%' : 'auto', fontFamily: gDS.font,
      fontSize: sm ? 13 : 15, fontWeight: 600,
      cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
      transition: 'opacity 0.15s',
    }}>{label || children}</button>
  );
}

function InpBox({ lbl, val, set, ph, type = 'text', max, err, note, im, autoFocus }) {
  const [focus, setFocus] = useStateA(false);
  return (
    <div style={{ marginBottom: 14, fontFamily: gDS.font }}>
      {lbl && <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: gDS.text, marginBottom: 5 }}>{lbl}</label>}
      <input
        type={type} value={val}
        onChange={e => { let v = e.target.value; if (max) v = v.slice(0, max); set(v); }}
        placeholder={ph} maxLength={max} inputMode={im} autoFocus={autoFocus}
        onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        style={{
          width: '100%', border: `2px solid ${err ? gDS.err : focus ? gDS.primary : gDS.border}`,
          borderRadius: gDS.r.s, padding: '10px 12px', fontFamily: gDS.font,
          fontSize: 15, color: gDS.text, background: '#fff', outline: 'none', boxSizing: 'border-box',
        }}
      />
      {note && !err && <div style={{ fontSize: 12, color: gDS.muted, marginTop: 3 }}>{note}</div>}
      {err && <div style={{ fontSize: 12, color: gDS.err, marginTop: 3 }}>{err}</div>}
    </div>
  );
}

function SelBox({ lbl, val, set, opts, mb = 14 }) {
  return (
    <div style={{ marginBottom: mb, fontFamily: gDS.font }}>
      {lbl && <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: gDS.text, marginBottom: 5 }}>{lbl}</label>}
      <select value={val} onChange={e => set(e.target.value)} style={{
        width: '100%', border: `2px solid ${gDS.border}`, borderRadius: gDS.r.s,
        padding: '9px 32px 9px 12px', fontFamily: gDS.font, fontSize: 14,
        color: val ? gDS.text : gDS.muted, background: '#fff', outline: 'none',
        appearance: 'none', cursor: 'pointer', boxSizing: 'border-box',
        backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23888' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E\")",
        backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center',
      }}>
        {opts.map(o => <option key={o.v ?? o} value={o.v ?? o}>{o.l ?? o}</option>)}
      </select>
    </div>
  );
}

function DatePick({ lbl, val, set }) {
  return (
    <div style={{ marginBottom: 14, fontFamily: gDS.font }}>
      {lbl && <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: gDS.text, marginBottom: 5 }}>{lbl}</label>}
      <input type="date" value={val} onChange={e => set(e.target.value)} style={{
        width: '100%', border: `2px solid ${gDS.border}`, borderRadius: gDS.r.s,
        padding: '10px 12px', fontFamily: gDS.font, fontSize: 14, color: val ? gDS.text : gDS.muted,
        background: '#fff', outline: 'none', boxSizing: 'border-box',
      }} />
    </div>
  );
}

function GCard({ children, style }) {
  return (
    <div style={{
      background: '#fff', borderRadius: gDS.r.m, border: `1px solid ${gDS.border}`,
      padding: 16, marginBottom: 14, boxShadow: gDS.sh, ...style,
    }}>{children}</div>
  );
}

function Badge({ children, c = 'gray' }) {
  const cc = {
    green: { bg: '#f0fdf4', b: '#bbf7d0', t: '#15803d' },
    red:   { bg: '#fef2f2', b: '#fecaca', t: '#dc2626' },
    blue:  { bg: '#eff6ff', b: '#bfdbfe', t: '#1d4ed8' },
    gray:  { bg: '#f8fafc', b: '#e2e8f0', t: '#475569' },
    amber: { bg: '#fffbeb', b: '#fde68a', t: '#b45309' },
  };
  const s = cc[c] || cc.gray;
  return (
    <span style={{
      background: s.bg, border: `1.5px solid ${s.b}`, color: s.t,
      borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 600,
      fontFamily: gDS.font, display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap',
    }}>{children}</span>
  );
}

function StepBar({ step, total }) {
  return (
    <div style={{ padding: '12px 16px 4px', fontFamily: gDS.font }}>
      <div style={{ display: 'flex', gap: 5, marginBottom: 5 }}>
        {Array.from({ length: total }, (_, i) => (
          <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i < step ? gDS.accent : '#e2e8f0', transition: 'background 0.3s' }} />
        ))}
      </div>
      <div style={{ fontSize: 12, color: gDS.muted }}>ขั้นตอน {step} / {total}</div>
    </div>
  );
}

// ── Data utilities ────────────────────────────────────────────────────────────
const GP_KEY  = 'gp_records_v1';
const GP_SESS = 'gp_session_v1';

function getRecords() {
  try { return JSON.parse(localStorage.getItem(GP_KEY) || '[]'); } catch { return []; }
}
function saveRecords(r) { localStorage.setItem(GP_KEY, JSON.stringify(r)); }
function addBatch(batch) { const r = [...getRecords(), ...batch]; saveRecords(r); return r; }
function calcMD(s, e) {
  if (!s || !e) return 0;
  return Math.max(1, Math.ceil((new Date(e) - new Date(s)) / 86400000) + 1);
}
function getSession() { try { return JSON.parse(sessionStorage.getItem(GP_SESS)); } catch { return null; } }
function setSession(u) { sessionStorage.setItem(GP_SESS, JSON.stringify(u)); }
function clearSession() { sessionStorage.removeItem(GP_SESS); }

function seedData() {
  if (getRecords().length > 0) return;
  saveRecords([
    { id: 'd1', name: 'นายสมชาย ใจดี',       idCard: '1100112345678', company: 'บจก. สยามก่อสร้าง',      job: 'ช่างไฟฟ้า',    zone: 'Zone A', startDate: '2026-05-01', endDate: '2026-05-15', manDays: 15, createdAt: '2026-05-01', createdBy: '0891234567', accident: false },
    { id: 'd2', name: 'นายวิชัย พงษ์ดี',      idCard: '3200234567890', company: 'บจก. สยามก่อสร้าง',      job: 'ช่างสี',       zone: 'Zone B', startDate: '2026-05-10', endDate: '2026-05-25', manDays: 16, createdAt: '2026-05-10', createdBy: '0891234567', accident: false },
    { id: 'd3', name: 'นางสาววิภา มีสุข',     idCard: '4300345678901', company: 'บจก. ไทยอิเล็คทริค',   job: 'ช่างไฟฟ้า',    zone: 'Zone A', startDate: '2026-05-15', endDate: '2026-05-28', manDays: 14, createdAt: '2026-05-15', createdBy: '0812345678', accident: false },
    { id: 'd4', name: 'นายประวิทย์ เก่งมาก',  idCard: '5400456789012', company: 'หจก. พิษณุโลก วิศวกรรม', job: 'แรงงาน',       zone: 'Zone C', startDate: '2026-05-12', endDate: '2026-05-20', manDays: 9,  createdAt: '2026-05-12', createdBy: '0823456789', accident: true  },
    { id: 'd5', name: 'นายกิตติ ดีใจ',        idCard: '6500567890123', company: 'บจก. นวการก่อสร้าง',    job: 'ช่างเชื่อม',   zone: 'Zone B', startDate: '2026-05-20', endDate: '2026-06-05', manDays: 17, createdAt: '2026-05-20', createdBy: '0891234567', accident: false },
    { id: 'd6', name: 'นายอนุชา รักงาน',      idCard: '7600678901234', company: 'บจก. ไทยอิเล็คทริค',   job: 'ช่างประปา',    zone: 'Zone A', startDate: '2026-06-01', endDate: '2026-06-10', manDays: 10, createdAt: '2026-06-01', createdBy: '0812345678', accident: false },
    { id: 'd7', name: 'นางสาวรัตนา สดใส',     idCard: '8700789012345', company: 'บจก. สยามก่อสร้าง',      job: 'แรงงาน',       zone: 'Zone C', startDate: '2026-06-05', endDate: '2026-06-15', manDays: 11, createdAt: '2026-06-05', createdBy: '0891234567', accident: false },
  ]);
}

const COMPANIES = [
  '— เลือกบริษัท —',
  'บจก. สยามก่อสร้าง',
  'บจก. ไทยอิเล็คทริค',
  'หจก. พิษณุโลก วิศวกรรม',
  'บจก. นวการก่อสร้าง',
  'บจก. เอ็กซ์เพรส เซอร์วิส',
  'บจก. ไทยพัฒนา',
];

Object.assign(window, {
  gDS, Logo, TopBar, Btn, InpBox, SelBox, DatePick, GCard, Badge, StepBar,
  getRecords, saveRecords, addBatch, calcMD,
  getSession, setSession, clearSession, seedData, COMPANIES,
});
