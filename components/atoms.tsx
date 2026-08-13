'use client';

// Shared atoms — migrated from prototype gp-atoms.jsx, inline styles only
import React, { useEffect, useRef, useState } from 'react';
import { gDS } from '@/lib/constants';

export type BtnVariant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'ok' | 'danger';
export type BadgeColor = 'green' | 'red' | 'blue' | 'gray' | 'amber';

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <h1
      style={{
        margin: 0,
        fontSize: 20,
        fontWeight: 700,
        color: light ? '#fff' : gDS.primary,
        fontFamily: gDS.font,
        letterSpacing: 0.2,
      }}
    >
      ระบบ Gate Pass
    </h1>
  );
}

export function TopBar({
  credential,
  role,
  onLogout,
}: {
  credential: string;
  role: string;
  onLogout: () => void;
}) {
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        background: gDS.primary,
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 20px',
        boxShadow: gDS.sh,
      }}
    >
      <Logo light />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 13, opacity: 0.85 }}>
          {credential} ({role === 'admin' ? 'ผู้ดูแลระบบ' : 'ผู้รับเหมา'})
        </span>
        <button
          onClick={onLogout}
          style={{
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.35)',
            color: '#fff',
            borderRadius: gDS.r.s,
            padding: '6px 14px',
            fontSize: 13,
            cursor: 'pointer',
            fontFamily: gDS.font,
          }}
        >
          ออกจากระบบ
        </button>
      </div>
    </div>
  );
}

const btnColors: Record<BtnVariant, { bg: string; color: string; border?: string }> = {
  primary: { bg: gDS.primary, color: '#fff' },
  accent: { bg: gDS.accent, color: gDS.primary },
  secondary: { bg: gDS.border, color: gDS.text },
  ghost: { bg: 'transparent', color: gDS.text },
  ok: { bg: gDS.ok, color: '#fff' },
  danger: { bg: gDS.err, color: '#fff' },
};

export function Btn({
  children,
  variant = 'primary',
  onClick,
  type = 'button',
  disabled = false,
  style,
}: {
  children: React.ReactNode;
  variant?: BtnVariant;
  onClick?: () => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
  style?: React.CSSProperties;
}) {
  const c = btnColors[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        background: c.bg,
        color: c.color,
        border: 'none',
        borderRadius: gDS.r.s,
        padding: '10px 20px',
        fontSize: 15,
        fontWeight: 600,
        fontFamily: gDS.font,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  color: gDS.text,
  marginBottom: 6,
  fontFamily: gDS.font,
};

const fieldStyle = (error?: string): React.CSSProperties => ({
  width: '100%',
  padding: '10px 12px',
  fontSize: 15,
  fontFamily: gDS.font,
  color: gDS.text,
  background: '#fff',
  border: `1px solid ${error ? gDS.err : gDS.border}`,
  borderRadius: gDS.r.s,
  outline: 'none',
  boxSizing: 'border-box',
});

function FieldError({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <div style={{ color: gDS.err, fontSize: 12, marginTop: 4, fontFamily: gDS.font }}>{error}</div>
  );
}

export function InpBox({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  error,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  error?: string;
  // ช่วยให้มือถือขึ้นแป้นตัวเลขตอนกรอกเลขบัตร/เบอร์โทร — ไม่ส่งมาก็ได้แป้นปกติ
  inputMode?: React.InputHTMLAttributes<HTMLInputElement>['inputMode'];
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={labelStyle}>{label}</label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        inputMode={inputMode}
        onChange={(e) => onChange(e.target.value)}
        style={fieldStyle(error)}
      />
      <FieldError error={error} />
    </div>
  );
}

export function SelBox({
  label,
  value,
  onChange,
  options,
  placeholder,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  // ถ้าไม่ส่ง placeholder จะไม่มี option ว่าง — select จะโชว์ options[0] เหมือนผู้ใช้เลือกเอง
  // ส่ง placeholder เมื่อต้องบังคับให้ผู้ใช้เลือกเอง แล้วเช็ค value === '' ตอน validate
  placeholder?: string;
  error?: string;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={labelStyle}>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={fieldStyle(error)}>
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <FieldError error={error} />
    </div>
  );
}

// textarea — ใช้กับช่องที่ EPRO เป็น textarea เช่น "เหตุผลที่ต้องใช้รถ"
// แยกเป็น component ใหม่ ไม่สอน InpBox ให้ render textarea แบบมีเงื่อนไข
// เพราะ InpBox เป็น atom ที่ใช้มากสุดในแอป ไม่คุ้มเสี่ยง
export function TxtBox({
  label,
  value,
  onChange,
  placeholder,
  error,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string;
  rows?: number;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={labelStyle}>{label}</label>
      <textarea
        value={value}
        placeholder={placeholder}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...fieldStyle(error), minHeight: 88, resize: 'vertical' }}
      />
      <FieldError error={error} />
    </div>
  );
}

export function Combobox({
  label,
  value,
  onChange,
  options,
  placeholder,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onOutsideClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onOutsideClick);
    return () => document.removeEventListener('mousedown', onOutsideClick);
  }, []);

  const q = value.trim().toLowerCase();
  const filtered = q
    ? options.filter((o) => o.toLowerCase().includes(q))
    : options;
  const isNewValue = q !== '' && !options.some((o) => o.toLowerCase() === q);

  return (
    <div style={{ marginBottom: 14, position: 'relative' }} ref={containerRef}>
      <label style={labelStyle}>{label}</label>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
        }}
        style={fieldStyle(error)}
      />
      {open && filtered.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 10,
            marginTop: 4,
            background: '#fff',
            border: `1px solid ${gDS.border}`,
            borderRadius: gDS.r.s,
            boxShadow: gDS.sh,
            maxHeight: 200,
            overflowY: 'auto',
          }}
        >
          {filtered.map((o) => (
            <div
              key={o}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(o);
                setOpen(false);
              }}
              style={{
                padding: '8px 12px',
                fontSize: 14,
                fontFamily: gDS.font,
                color: gDS.text,
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = gDS.bg)}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              {o}
            </div>
          ))}
        </div>
      )}
      {isNewValue && !error && (
        <div style={{ color: gDS.muted, fontSize: 12, marginTop: 4, fontFamily: gDS.font }}>
          จะบันทึกเป็นบริษัทใหม่
        </div>
      )}
      <FieldError error={error} />
    </div>
  );
}

export function DatePick({
  label,
  value,
  onChange,
  min,
  max,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  min?: string;
  max?: string;
  error?: string;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={labelStyle}>{label}</label>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        min={min}
        max={max}
        style={fieldStyle(error)}
      />
      <FieldError error={error} />
    </div>
  );
}

export function GCard({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        background: '#fff',
        borderRadius: gDS.r.m,
        padding: gDS.r.l,
        boxShadow: gDS.sh,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

const badgeColors: Record<BadgeColor, { bg: string; color: string }> = {
  green: { bg: gDS.okBg, color: gDS.ok },
  red: { bg: gDS.errBg, color: gDS.err },
  blue: { bg: '#dbeafe', color: '#1d4ed8' },
  gray: { bg: '#f1f5f9', color: gDS.muted },
  amber: { bg: '#fef3c7', color: '#d97706' },
};

export function Badge({ color, children }: { color: BadgeColor; children: React.ReactNode }) {
  const c = badgeColors[color];
  return (
    <span
      style={{
        display: 'inline-block',
        background: c.bg,
        color: c.color,
        fontSize: 12,
        fontWeight: 600,
        padding: '3px 10px',
        borderRadius: 999,
        fontFamily: gDS.font,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

export function StepBar({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <React.Fragment key={s}>
            {i > 0 && (
              <div
                style={{
                  flex: 1,
                  height: 2,
                  background: done || active ? gDS.accent : gDS.border,
                  margin: '0 6px',
                }}
              />
            )}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 13,
                  fontWeight: 700,
                  fontFamily: gDS.font,
                  background: done ? gDS.ok : active ? gDS.accent : gDS.border,
                  color: done || active ? '#fff' : gDS.muted,
                }}
              >
                {done ? '✓' : i + 1}
              </div>
              <span
                style={{
                  fontSize: 11,
                  color: active ? gDS.text : gDS.muted,
                  fontWeight: active ? 600 : 400,
                  fontFamily: gDS.font,
                  whiteSpace: 'nowrap',
                }}
              >
                {s}
              </span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}
