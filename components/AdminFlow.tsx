'use client';

import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { gDS, COMPANIES } from '@/lib/constants';
import { Btn, GCard, Badge, InpBox, SelBox, TopBar } from '@/components/atoms';

interface RecordRow {
  id: string;
  name: string;
  idCard: string;
  company: string;
  job: string | null;
  zone: string | null;
  startDate: string;
  endDate: string;
  manDays: number;
  accident: boolean;
  createdAt: string;
  createdBy: string;
  author?: { credential: string };
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  fontSize: 12,
  color: gDS.muted,
  fontWeight: 600,
  padding: '10px 10px',
  borderBottom: `2px solid ${gDS.border}`,
  whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  fontSize: 13,
  color: gDS.text,
  padding: '10px 10px',
  borderBottom: `1px solid ${gDS.border}`,
  whiteSpace: 'nowrap',
};

function KpiCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number | string;
  color: string;
}) {
  return (
    <GCard style={{ flex: 1, minWidth: 150, borderLeft: `4px solid ${color}` }}>
      <div style={{ fontSize: 13, color: gDS.muted, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: gDS.text }}>{value}</div>
    </GCard>
  );
}

export default function AdminFlow({
  credential,
  role,
}: {
  credential: string;
  role: string;
}) {
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyFilter, setCompanyFilter] = useState('ทั้งหมด');
  const [customCompany, setCustomCompany] = useState('');
  const [newCredential, setNewCredential] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('contractor');
  const [userMsg, setUserMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/records');
      if (res.ok) setRecords(await res.json());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }

  async function toggleAccident(id: string) {
    const res = await fetch(`/api/records/${id}`, { method: 'PATCH' });
    if (res.ok) {
      const updated: RecordRow = await res.json();
      setRecords((rs) => rs.map((r) => (r.id === id ? { ...r, accident: updated.accident } : r)));
    }
  }

  const filtered = useMemo(() => {
    if (companyFilter === 'ทั้งหมด') return records;
    if (companyFilter === 'อื่นๆ') {
      const q = customCompany.trim().toLowerCase();
      if (!q) return records;
      return records.filter((r) => r.company.toLowerCase().includes(q));
    }
    return records.filter((r) => r.company === companyFilter);
  }, [records, companyFilter, customCompany]);

  const totalManDays = filtered.reduce((s, r) => s + r.manDays, 0);
  const uniqueCompanies = new Set(filtered.map((r) => r.company)).size;
  const accidents = filtered.filter((r) => r.accident).length;

  const byCompany = useMemo(() => {
    const map = new Map<string, { count: number; manDays: number }>();
    for (const r of filtered) {
      const e = map.get(r.company) || { count: 0, manDays: 0 };
      e.count += 1;
      e.manDays += r.manDays;
      map.set(r.company, e);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].manDays - a[1].manDays);
  }, [filtered]);

  function exportExcel() {
    const rows = filtered.map((r) => ({
      'ชื่อ-นามสกุล': r.name,
      เลขบัตรประชาชน: r.idCard,
      บริษัท: r.company,
      ตำแหน่ง: r.job || '-',
      โซน: r.zone || '-',
      วันที่เริ่ม: r.startDate,
      วันที่สิ้นสุด: r.endDate,
      'แรงงาน (วัน)': r.manDays,
      อุบัติเหตุ: r.accident ? 'มี' : 'ไม่มี',
      วันที่บันทึก: r.createdAt,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'GatePass');
    XLSX.writeFile(wb, `gate-pass-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setUserMsg(null);
    if (!newCredential.trim() || !newPassword) {
      setUserMsg({ ok: false, text: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          credential: newCredential.trim(),
          password: newPassword,
          role: newRole,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setUserMsg({ ok: false, text: data.error || 'สร้างบัญชีไม่สำเร็จ' });
      } else {
        setUserMsg({ ok: true, text: `สร้างบัญชี ${data.credential} สำเร็จ` });
        setNewCredential('');
        setNewPassword('');
        setNewRole('contractor');
      }
    } catch {
      setUserMsg({ ok: false, text: 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง' });
    } finally {
      setCreating(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: gDS.bg, fontFamily: gDS.font }}>
      <TopBar credential={credential} role={role} onLogout={logout} />
      <div style={{ maxWidth: 880, margin: '0 auto', padding: '84px 16px 40px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <h2 style={{ margin: 0, fontSize: 20, color: gDS.text }}>แดชบอร์ดผู้ดูแลระบบ</h2>
          <Btn variant="ok" onClick={exportExcel} disabled={filtered.length === 0}>
            ⬇ ส่งออก Excel
          </Btn>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <KpiCard label="จำนวนรายการทั้งหมด" value={filtered.length} color={gDS.primary} />
          <KpiCard label="จำนวนแรงงานทั้งหมด" value={totalManDays} color={gDS.accent} />
          <KpiCard label="บริษัททั้งหมด" value={uniqueCompanies} color="#1d4ed8" />
          <KpiCard label="อุบัติเหตุ" value={accidents} color={gDS.err} />
        </div>

        <GCard style={{ marginBottom: 16 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 16, color: gDS.text }}>
            สรุปรายบริษัท
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>บริษัท</th>
                  <th style={thStyle}>จำนวนรายการ</th>
                  <th style={thStyle}>แรงงาน (วัน)</th>
                </tr>
              </thead>
              <tbody>
                {byCompany.map(([name, e]) => (
                  <tr key={name}>
                    <td style={tdStyle}>{name}</td>
                    <td style={tdStyle}>{e.count}</td>
                    <td style={tdStyle}>{e.manDays}</td>
                  </tr>
                ))}
                {byCompany.length === 0 && (
                  <tr>
                    <td style={{ ...tdStyle, color: gDS.muted }} colSpan={3}>
                      ไม่มีข้อมูล
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </GCard>

        <GCard style={{ marginBottom: 16 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
              marginBottom: 12,
            }}
          >
            <h3 style={{ margin: 0, fontSize: 16, color: gDS.text }}>
              รายการลงทะเบียน ({filtered.length})
            </h3>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ width: 240 }}>
                <SelBox
                  label="กรองตามบริษัท"
                  value={companyFilter}
                  onChange={(v) => {
                    setCompanyFilter(v);
                    if (v !== 'อื่นๆ') setCustomCompany('');
                  }}
                  options={['ทั้งหมด', ...COMPANIES.slice(1), 'อื่นๆ']}
                />
              </div>
              {companyFilter === 'อื่นๆ' && (
                <div style={{ width: 200 }}>
                  <InpBox
                    label="ชื่อบริษัท"
                    value={customCompany}
                    onChange={setCustomCompany}
                    placeholder="พิมพ์ชื่อบริษัท..."
                  />
                </div>
              )}
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>ชื่อ</th>
                  <th style={thStyle}>เลขบัตร</th>
                  <th style={thStyle}>บริษัท</th>
                  <th style={thStyle}>ตำแหน่ง</th>
                  <th style={thStyle}>โซน</th>
                  <th style={thStyle}>วันที่เริ่ม</th>
                  <th style={thStyle}>วันที่สิ้นสุด</th>
                  <th style={thStyle}>แรงงาน (วัน)</th>
                  <th style={thStyle}>อุบัติเหตุ</th>
                  <th style={thStyle}>วันที่บันทึก</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td style={{ ...tdStyle, color: gDS.muted }} colSpan={10}>
                      กำลังโหลดข้อมูล...
                    </td>
                  </tr>
                )}
                {!loading && filtered.length === 0 && (
                  <tr>
                    <td style={{ ...tdStyle, color: gDS.muted }} colSpan={10}>
                      ไม่มีข้อมูล
                    </td>
                  </tr>
                )}
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td style={tdStyle}>{r.name}</td>
                    <td style={tdStyle}>{r.idCard}</td>
                    <td style={tdStyle}>{r.company}</td>
                    <td style={tdStyle}>{r.job || '-'}</td>
                    <td style={tdStyle}>{r.zone || '-'}</td>
                    <td style={tdStyle}>{r.startDate}</td>
                    <td style={tdStyle}>{r.endDate}</td>
                    <td style={tdStyle}>{r.manDays}</td>
                    <td style={tdStyle}>
                      <button
                        onClick={() => toggleAccident(r.id)}
                        title="คลิกเพื่อสลับสถานะอุบัติเหตุ"
                        style={{
                          background: 'transparent',
                          border: 'none',
                          padding: 0,
                          cursor: 'pointer',
                        }}
                      >
                        <Badge color={r.accident ? 'red' : 'green'}>
                          {r.accident ? 'มีอุบัติเหตุ' : 'ปกติ'}
                        </Badge>
                      </button>
                    </td>
                    <td style={tdStyle}>{r.createdAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GCard>

        <GCard>
          <h3 style={{ margin: '0 0 12px', fontSize: 16, color: gDS.text }}>
            สร้างบัญชีผู้ใช้ใหม่
          </h3>
          <form onSubmit={createUser}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: 2, minWidth: 180 }}>
                <InpBox
                  label="เบอร์โทรหรืออีเมล"
                  value={newCredential}
                  onChange={setNewCredential}
                  placeholder="เช่น 0891234567"
                />
              </div>
              <div style={{ flex: 2, minWidth: 180 }}>
                <InpBox
                  label="รหัสผ่าน"
                  value={newPassword}
                  onChange={setNewPassword}
                  type="password"
                  placeholder="อย่างน้อย 6 ตัวอักษร"
                />
              </div>
              <div style={{ flex: 1, minWidth: 140 }}>
                <SelBox
                  label="สิทธิ์การใช้งาน"
                  value={newRole}
                  onChange={setNewRole}
                  options={['contractor', 'admin']}
                />
              </div>
            </div>
            {userMsg && (
              <div
                style={{
                  background: userMsg.ok ? gDS.okBg : gDS.errBg,
                  color: userMsg.ok ? gDS.ok : gDS.err,
                  fontSize: 13,
                  padding: '10px 12px',
                  borderRadius: gDS.r.s,
                  marginBottom: 14,
                }}
              >
                {userMsg.text}
              </div>
            )}
            <Btn type="submit" disabled={creating}>
              {creating ? 'กำลังสร้างบัญชี...' : '+ สร้างบัญชี'}
            </Btn>
          </form>
        </GCard>
      </div>
    </div>
  );
}
