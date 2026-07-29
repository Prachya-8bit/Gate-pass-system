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

interface UserRow {
  id: string;
  credential: string;
  contactName: string | null;
  role: string;
  createdAt: string;
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

  const [users, setUsers] = useState<UserRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editingNameValue, setEditingNameValue] = useState('');
  const [savingName, setSavingName] = useState(false);

  const [resetModalUser, setResetModalUser] = useState<UserRow | null>(null);
  const [resetPw1, setResetPw1] = useState('');
  const [resetPw2, setResetPw2] = useState('');
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetResult, setResetResult] = useState<string | null>(null);
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/records');
      if (res.ok) setRecords(await res.json());
    } finally {
      setLoading(false);
    }
  }

  async function loadUsers() {
    setUsersLoading(true);
    try {
      const res = await fetch('/api/users');
      if (res.ok) setUsers(await res.json());
    } finally {
      setUsersLoading(false);
    }
  }

  useEffect(() => {
    load();
    loadUsers();
  }, []);

  function startEditName(u: UserRow) {
    setEditingNameId(u.id);
    setEditingNameValue(u.contactName || '');
  }

  function cancelEditName() {
    setEditingNameId(null);
    setEditingNameValue('');
  }

  async function saveName(id: string) {
    setSavingName(true);
    try {
      const res = await fetch(`/api/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactName: editingNameValue.trim() }),
      });
      if (res.ok) {
        const updated: UserRow = await res.json();
        setUsers((us) => us.map((u) => (u.id === id ? updated : u)));
        setEditingNameId(null);
        setEditingNameValue('');
      }
    } finally {
      setSavingName(false);
    }
  }

  function openResetModal(u: UserRow) {
    setResetModalUser(u);
    setResetPw1('');
    setResetPw2('');
    setResetError(null);
    setResetResult(null);
    setCopied(false);
  }

  function closeResetModal() {
    setResetModalUser(null);
    setResetPw1('');
    setResetPw2('');
    setResetError(null);
    setResetResult(null);
    setCopied(false);
  }

  async function submitReset() {
    setResetError(null);
    if (resetPw1.length < 8) {
      setResetError('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร');
      return;
    }
    if (resetPw1 !== resetPw2) {
      setResetError('รหัสผ่านทั้งสองช่องไม่ตรงกัน');
      return;
    }
    if (!resetModalUser) return;
    setResetSubmitting(true);
    try {
      const res = await fetch(`/api/users/${resetModalUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: resetPw1 }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResetError(data.error || 'รีเซ็ตรหัสผ่านไม่สำเร็จ');
      } else {
        setResetResult(resetPw1);
      }
    } catch {
      setResetError('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
    } finally {
      setResetSubmitting(false);
    }
  }

  async function copyResetResult() {
    if (!resetResult) return;
    try {
      await navigator.clipboard.writeText(resetResult);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

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
            จัดการบัญชีผู้ใช้
          </h3>

          <div style={{ overflowX: 'auto', marginBottom: 24 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>ชื่อผู้ใช้งาน</th>
                  <th style={thStyle}>Username</th>
                  <th style={thStyle}>บทบาท</th>
                  <th style={thStyle}>วันที่สร้าง</th>
                  <th style={thStyle}>จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {usersLoading && (
                  <tr>
                    <td style={{ ...tdStyle, color: gDS.muted }} colSpan={5}>
                      กำลังโหลดข้อมูล...
                    </td>
                  </tr>
                )}
                {!usersLoading && users.length === 0 && (
                  <tr>
                    <td style={{ ...tdStyle, color: gDS.muted }} colSpan={5}>
                      ไม่มีข้อมูล
                    </td>
                  </tr>
                )}
                {users.map((u) => (
                  <tr key={u.id}>
                    <td style={tdStyle}>
                      {editingNameId === u.id ? (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', minWidth: 220 }}>
                          <div style={{ flex: 1 }}>
                            <InpBox
                              label=""
                              value={editingNameValue}
                              onChange={setEditingNameValue}
                              placeholder="ชื่อผู้ใช้งานจริง"
                            />
                          </div>
                          <Btn
                            variant="ok"
                            onClick={() => saveName(u.id)}
                            disabled={savingName}
                            style={{ padding: '6px 12px', fontSize: 13 }}
                          >
                            บันทึก
                          </Btn>
                          <Btn
                            variant="ghost"
                            onClick={cancelEditName}
                            disabled={savingName}
                            style={{ padding: '6px 12px', fontSize: 13 }}
                          >
                            ยกเลิก
                          </Btn>
                        </div>
                      ) : u.contactName ? (
                        u.contactName
                      ) : (
                        <button
                          onClick={() => startEditName(u)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            padding: 0,
                            color: gDS.accent,
                            fontSize: 13,
                            fontWeight: 600,
                            cursor: 'pointer',
                            fontFamily: gDS.font,
                            textDecoration: 'underline',
                          }}
                        >
                          + เพิ่มชื่อ
                        </button>
                      )}
                    </td>
                    <td style={tdStyle}>{u.credential}</td>
                    <td style={tdStyle}>
                      <Badge color={u.role === 'admin' ? 'amber' : 'blue'}>
                        {u.role === 'admin' ? 'ผู้ดูแลระบบ' : 'ผู้รับเหมา'}
                      </Badge>
                    </td>
                    <td style={tdStyle}>{u.createdAt.slice(0, 10)}</td>
                    <td style={tdStyle}>
                      <Btn
                        variant="secondary"
                        onClick={() => openResetModal(u)}
                        style={{ padding: '6px 14px', fontSize: 13 }}
                      >
                        รีเซ็ตรหัส
                      </Btn>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

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

      {resetModalUser && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(10,22,40,0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 200,
            padding: 16,
          }}
        >
          <GCard style={{ maxWidth: 420, width: '100%' }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 16, color: gDS.text }}>
              รีเซ็ตรหัสผ่าน
            </h3>
            <div style={{ fontSize: 13, color: gDS.muted, marginBottom: 14 }}>
              บัญชี: {resetModalUser.credential}
            </div>

            {resetResult ? (
              <div>
                <div
                  style={{
                    background: gDS.okBg,
                    color: gDS.ok,
                    fontSize: 13,
                    padding: '10px 12px',
                    borderRadius: gDS.r.s,
                    marginBottom: 12,
                  }}
                >
                  ตั้งรหัสผ่านใหม่สำเร็จ กรุณาแจ้งรหัสนี้ให้ผู้ใช้ทางโทรศัพท์ —
                  เมื่อปิดหน้าต่างนี้แล้วจะไม่สามารถดูรหัสนี้ซ้ำได้อีก
                </div>
                <div
                  style={{
                    display: 'flex',
                    gap: 8,
                    alignItems: 'center',
                    background: gDS.bg,
                    border: `1px solid ${gDS.border}`,
                    borderRadius: gDS.r.s,
                    padding: '10px 12px',
                    marginBottom: 14,
                  }}
                >
                  <span
                    style={{
                      flex: 1,
                      fontFamily: 'monospace',
                      fontSize: 16,
                      fontWeight: 700,
                      color: gDS.text,
                      wordBreak: 'break-all',
                    }}
                  >
                    {resetResult}
                  </span>
                  <Btn
                    variant="secondary"
                    onClick={copyResetResult}
                    style={{ padding: '6px 12px', fontSize: 13 }}
                  >
                    {copied ? 'คัดลอกแล้ว' : 'คัดลอก'}
                  </Btn>
                </div>
                <Btn onClick={closeResetModal}>ปิดหน้าต่าง</Btn>
              </div>
            ) : (
              <div>
                <InpBox
                  label="รหัสผ่านใหม่"
                  value={resetPw1}
                  onChange={setResetPw1}
                  type="password"
                  placeholder="อย่างน้อย 8 ตัวอักษร"
                />
                <InpBox
                  label="ยืนยันรหัสผ่านใหม่อีกครั้ง"
                  value={resetPw2}
                  onChange={setResetPw2}
                  type="password"
                  placeholder="พิมพ์รหัสผ่านอีกครั้ง"
                />
                {resetError && (
                  <div
                    style={{
                      background: gDS.errBg,
                      color: gDS.err,
                      fontSize: 13,
                      padding: '10px 12px',
                      borderRadius: gDS.r.s,
                      marginBottom: 14,
                    }}
                  >
                    {resetError}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <Btn onClick={submitReset} disabled={resetSubmitting}>
                    {resetSubmitting ? 'กำลังบันทึก...' : 'ยืนยันรีเซ็ตรหัส'}
                  </Btn>
                  <Btn variant="secondary" onClick={closeResetModal} disabled={resetSubmitting}>
                    ยกเลิก
                  </Btn>
                </div>
              </div>
            )}
          </GCard>
        </div>
      )}
    </div>
  );
}
