'use client';

import React, { useState } from 'react';
import { gDS, COMPANIES, calcMD } from '@/lib/constants';
import {
  Btn,
  InpBox,
  SelBox,
  DatePick,
  GCard,
  StepBar,
  Badge,
  TopBar,
} from '@/components/atoms';

interface Worker {
  name: string;
  idCard: string;
}

const STEPS = ['ข้อมูลงาน', 'รายชื่อแรงงาน', 'ยืนยันข้อมูล'];

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  fontSize: 12,
  color: gDS.muted,
  fontWeight: 600,
  padding: '8px 10px',
  borderBottom: `1px solid ${gDS.border}`,
  whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  fontSize: 13,
  color: gDS.text,
  padding: '8px 10px',
  borderBottom: `1px solid ${gDS.border}`,
};

export default function ContractorFlow({
  credential,
  role,
}: {
  credential: string;
  role: string;
}) {
  const [step, setStep] = useState(0);
  const [company, setCompany] = useState(COMPANIES[0]);
  const [job, setJob] = useState('');
  const [zone, setZone] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [workers, setWorkers] = useState<Worker[]>([{ name: '', idCard: '' }]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const manDays = calcMD(startDate, endDate);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }

  function next() {
    setError('');
    if (step === 0) {
      if (!company || company === COMPANIES[0]) {
        setError('กรุณาเลือกบริษัท');
        return;
      }
      if (!startDate || !endDate) {
        setError('กรุณาระบุวันที่เริ่มและวันที่สิ้นสุด');
        return;
      }
      if (new Date(endDate) < new Date(startDate)) {
        setError('วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่ม');
        return;
      }
    }
    if (step === 1) {
      for (const w of workers) {
        if (!w.name.trim()) {
          setError('กรุณากรอกชื่อ-นามสกุลให้ครบทุกคน');
          return;
        }
        if (!/^\d{13}$/.test(w.idCard)) {
          setError('เลขบัตรประชาชนต้องเป็นตัวเลข 13 หลัก');
          return;
        }
      }
    }
    setStep(step + 1);
  }

  function updateWorker(i: number, field: keyof Worker, value: string) {
    setWorkers(workers.map((w, idx) => (idx === i ? { ...w, [field]: value } : w)));
  }

  async function submit() {
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          workers.map((w) => ({
            name: w.name.trim(),
            idCard: w.idCard,
            company,
            job: job.trim(),
            zone: zone.trim(),
            startDate,
            endDate,
          })),
        ),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'บันทึกข้อมูลไม่สำเร็จ');
        setSubmitting(false);
        return;
      }
      setDone(true);
    } catch {
      setError('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
      setSubmitting(false);
    }
  }

  function reset() {
    setStep(0);
    setCompany(COMPANIES[0]);
    setJob('');
    setZone('');
    setStartDate('');
    setEndDate('');
    setWorkers([{ name: '', idCard: '' }]);
    setError('');
    setSubmitting(false);
    setDone(false);
  }

  return (
    <div style={{ minHeight: '100vh', background: gDS.bg, fontFamily: gDS.font }}>
      <TopBar credential={credential} role={role} onLogout={logout} />
      <div style={{ maxWidth: 520, margin: '0 auto', padding: '84px 16px 40px' }}>
        {done ? (
          <GCard style={{ textAlign: 'center', padding: 32 }}>
            <div style={{ fontSize: 44, marginBottom: 8 }}>✅</div>
            <h2 style={{ margin: '0 0 6px', fontSize: 20, color: gDS.text }}>
              บันทึกข้อมูลสำเร็จ
            </h2>
            <p style={{ color: gDS.muted, fontSize: 14, margin: '0 0 20px' }}>
              ลงทะเบียนแรงงาน {workers.length} คน เรียบร้อยแล้ว
            </p>
            <Btn variant="accent" onClick={reset}>
              ลงทะเบียนใหม่
            </Btn>
          </GCard>
        ) : (
          <GCard>
            <StepBar steps={STEPS} current={step} />

            {step === 0 && (
              <div>
                <h2 style={{ margin: '0 0 14px', fontSize: 18, color: gDS.text }}>
                  ข้อมูลงาน
                </h2>
                <SelBox label="บริษัท" value={company} onChange={setCompany} options={COMPANIES} />
                <InpBox
                  label="ตำแหน่งงาน"
                  value={job}
                  onChange={setJob}
                  placeholder="เช่น ช่างไฟฟ้า"
                />
                <InpBox
                  label="โซนปฏิบัติงาน"
                  value={zone}
                  onChange={setZone}
                  placeholder="เช่น Zone A"
                />
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <DatePick label="วันที่เริ่ม" value={startDate} onChange={setStartDate} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <DatePick label="วันที่สิ้นสุด" value={endDate} onChange={setEndDate} />
                  </div>
                </div>
                {manDays > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <Badge color="blue">จำนวนแรงงาน {manDays} วัน/คน</Badge>
                  </div>
                )}
              </div>
            )}

            {step === 1 && (
              <div>
                <h2 style={{ margin: '0 0 14px', fontSize: 18, color: gDS.text }}>
                  รายชื่อแรงงาน ({workers.length} คน)
                </h2>
                {workers.map((w, i) => (
                  <div
                    key={i}
                    style={{
                      border: `1px solid ${gDS.border}`,
                      borderRadius: gDS.r.s,
                      padding: 12,
                      marginBottom: 12,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 8,
                      }}
                    >
                      <span style={{ fontSize: 13, fontWeight: 600, color: gDS.muted }}>
                        คนที่ {i + 1}
                      </span>
                      {workers.length > 1 && (
                        <Btn
                          variant="danger"
                          onClick={() => setWorkers(workers.filter((_, idx) => idx !== i))}
                          style={{ padding: '4px 12px', fontSize: 12 }}
                        >
                          ลบ
                        </Btn>
                      )}
                    </div>
                    <InpBox
                      label="ชื่อ-นามสกุล"
                      value={w.name}
                      onChange={(v) => updateWorker(i, 'name', v)}
                      placeholder="เช่น นายสมชาย ใจดี"
                    />
                    <InpBox
                      label="เลขบัตรประชาชน (13 หลัก)"
                      value={w.idCard}
                      onChange={(v) => updateWorker(i, 'idCard', v.replace(/\D/g, '').slice(0, 13))}
                      placeholder="เช่น 1100112345678"
                      error={
                        w.idCard && !/^\d{13}$/.test(w.idCard)
                          ? 'ต้องเป็นตัวเลข 13 หลัก'
                          : undefined
                      }
                    />
                  </div>
                ))}
                <Btn
                  variant="secondary"
                  onClick={() => setWorkers([...workers, { name: '', idCard: '' }])}
                  style={{ width: '100%' }}
                >
                  + เพิ่มแรงงาน
                </Btn>
              </div>
            )}

            {step === 2 && (
              <div>
                <h2 style={{ margin: '0 0 14px', fontSize: 18, color: gDS.text }}>
                  ยืนยันข้อมูล
                </h2>
                <div
                  style={{
                    background: gDS.bg,
                    borderRadius: gDS.r.s,
                    padding: 12,
                    fontSize: 13,
                    color: gDS.text,
                    marginBottom: 14,
                    lineHeight: 1.9,
                  }}
                >
                  <div>
                    <strong>บริษัท:</strong> {company}
                  </div>
                  {job && (
                    <div>
                      <strong>ตำแหน่งงาน:</strong> {job}
                    </div>
                  )}
                  {zone && (
                    <div>
                      <strong>โซน:</strong> {zone}
                    </div>
                  )}
                  <div>
                    <strong>ช่วงวันที่:</strong> {startDate} ถึง {endDate}
                  </div>
                </div>
                <div style={{ overflowX: 'auto', marginBottom: 14 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={thStyle}>#</th>
                        <th style={thStyle}>ชื่อ-นามสกุล</th>
                        <th style={thStyle}>เลขบัตร</th>
                        <th style={thStyle}>แรงงาน (วัน)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {workers.map((w, i) => (
                        <tr key={i}>
                          <td style={tdStyle}>{i + 1}</td>
                          <td style={tdStyle}>{w.name}</td>
                          <td style={tdStyle}>{w.idCard}</td>
                          <td style={tdStyle}>{manDays}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ marginBottom: 14 }}>
                  <Badge color="amber">
                    รวมทั้งหมด {workers.length * manDays} แรงงาน-วัน ({workers.length} คน)
                  </Badge>
                </div>
              </div>
            )}

            {error && (
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
                {error}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              {step > 0 ? (
                <Btn variant="ghost" onClick={() => setStep(step - 1)}>
                  ← ย้อนกลับ
                </Btn>
              ) : (
                <span />
              )}
              {step < 2 ? (
                <Btn variant="accent" onClick={next}>
                  ถัดไป →
                </Btn>
              ) : (
                <Btn variant="ok" onClick={submit} disabled={submitting}>
                  {submitting ? 'กำลังบันทึก...' : 'ยืนยันการลงทะเบียน'}
                </Btn>
              )}
            </div>
          </GCard>
        )}
      </div>
    </div>
  );
}
