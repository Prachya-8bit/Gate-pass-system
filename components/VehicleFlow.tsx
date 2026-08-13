'use client';

// ฟอร์มขออนุมัตินำรถยนต์เข้ามาปฏิบัติงานภายในโรงงาน
//
// 2 ขั้น (กรอก → ยืนยัน) ไม่ใช่ 3 ขั้นเหมือนฟอร์มคนงาน เพราะขั้นกลางของฟอร์มนั้น
// มีอยู่เพื่อแยกรายชื่อคนงาน N คนออกมา ฝั่งรถมี 1 คันไม่มีอะไรซ้ำ แต่ยังคง
// ขั้นยืนยันไว้เพื่อรักษาจังหวะ "ทานก่อนกดจริง" ที่ผู้ใช้คุ้นจากฟอร์มคนงาน

import React, { useEffect, useState } from 'react';
import { addDays, gDS, MAX_SPAN_DAYS, MIN_SPAN_DAYS, calcMD, spanDays } from '@/lib/constants';
import {
  BackLink,
  Badge,
  Btn,
  Combobox,
  DatePick,
  GCard,
  InpBox,
  SelBox,
  StepBar,
  TopBar,
  TxtBox,
} from '@/components/atoms';
import {
  PLANTS,
  PLANT_VALUE_BY_LABEL,
  PLATE_PROVINCES,
  TIME_HOURS,
  TIME_MINUTES,
  VEHICLE_LABELS,
  VEHICLE_RISKY_LEAD_MINUTES,
  minutesUntil,
  type VehicleField,
} from '@/lib/vehicle';
import {
  MAX_DRIVER_NAME,
  MAX_LOCATION,
  MAX_PLATE,
  MAX_REASON,
  validateVehicleInput,
} from '@/lib/vehicle-validate';

const STEPS = ['กรอกข้อมูล', 'ยืนยันข้อมูล'];

interface VehicleForm {
  plant: string;
  company: string;
  driverName: string;
  plateNumber: string;
  plateProvince: string;
  location: string;
  reason: string;
  contactTel: string;
  startDate: string;
  startHour: string;
  startMin: string;
  endDate: string;
  endHour: string;
  endMin: string;
}

const EMPTY: VehicleForm = {
  // เก็บเป็น label เพราะ SelBox เก็บค่าเท่ากับที่แสดง — แปลงเป็น value ใน toPayload
  plant: PLANTS[0].label,
  company: '',
  driverName: '',
  plateNumber: '',
  plateProvince: '',
  location: '',
  reason: '',
  contactTel: '',
  startDate: '',
  startHour: '08',
  startMin: '00',
  endDate: '',
  endHour: '17',
  endMin: '00',
};

const subHead: React.CSSProperties = {
  margin: '18px 0 8px',
  fontSize: 13,
  color: gDS.muted,
  fontWeight: 600,
};

// แปลง state ของฟอร์มเป็น body ที่ API รับ (เวลารวมเป็น HH:MM)
function toPayload(f: VehicleForm) {
  return {
    plant: PLANT_VALUE_BY_LABEL[f.plant] ?? '',
    company: f.company.trim(),
    driverName: f.driverName.trim(),
    plateNumber: f.plateNumber,
    plateProvince: f.plateProvince,
    location: f.location.trim(),
    reason: f.reason.trim(),
    contactTel: f.contactTel.trim(),
    startDate: f.startDate,
    startTime: `${f.startHour}:${f.startMin}`,
    endDate: f.endDate,
    endTime: `${f.endHour}:${f.endMin}`,
  };
}

export default function VehicleFlow({
  credential,
  role,
}: {
  credential: string;
  role: string;
}) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<VehicleForm>(EMPTY);
  const [companies, setCompanies] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [savedPlate, setSavedPlate] = useState('');

  useEffect(() => {
    fetch('/api/companies')
      .then((res) => (res.ok ? res.json() : []))
      .then(setCompanies)
      .catch(() => {});
  }, []);

  function set<K extends keyof VehicleForm>(k: K, v: VehicleForm[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  // เปลี่ยนวันเริ่ม แล้ววันสิ้นสุดเดิมหลุดช่วง ให้ล้าง — เหมือนฟอร์มคนงาน
  function changeStartDate(v: string) {
    setForm((f) => {
      const span = f.endDate ? spanDays(v, f.endDate) : null;
      const keep = span !== null && span >= MIN_SPAN_DAYS && span <= MAX_SPAN_DAYS;
      return { ...f, startDate: v, endDate: keep ? f.endDate : '' };
    });
  }

  const endMin = form.startDate ? addDays(form.startDate, MIN_SPAN_DAYS) : undefined;
  const endMax = form.startDate ? addDays(form.startDate, MAX_SPAN_DAYS) : undefined;

  const payload = toPayload(form);
  const lead = form.startDate ? minutesUntil(form.startDate, payload.startTime) : null;
  // เตือนแบบไม่บล็อก: กฎ EPRO วัดตอน RPA กดบันทึก ไม่ใช่ตอนกรอก ระหว่างนั้นมี
  // เจ้าหน้าที่ยืนยัน + cron 15 นาที ถ้าเวลาชิดขั้นต่ำมากมีโอกาสถูกปฏิเสธ
  const riskyLead = lead !== null && lead >= 0 && lead < VEHICLE_RISKY_LEAD_MINUTES;

  function next() {
    setError('');
    const invalid = validateVehicleInput(payload);
    if (invalid) {
      setError(invalid);
      return;
    }
    setStep(1);
  }

  async function submit() {
    setError('');
    const invalid = validateVehicleInput(payload);
    if (invalid) {
      setError(invalid);
      setStep(0);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/vehicle-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'บันทึกคำขอไม่สำเร็จ');
        setSubmitting(false);
        return;
      }
      setSavedPlate(payload.plateNumber);
      setDone(true);
    } catch {
      setError('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
      setSubmitting(false);
    }
  }

  // ขอคันถัดไป: คงข้อมูลงาน (บริษัท/สถานที่/ช่วงวัน-เวลา) ล้างข้อมูลรถกับคนขับ
  function nextVehicle() {
    setForm((f) => ({
      ...f,
      driverName: '',
      plateNumber: '',
      plateProvince: '',
      reason: '',
    }));
    setSavedPlate('');
    setError('');
    setSubmitting(false);
    setDone(false);
    setStep(0);
  }

  function reset() {
    setForm(EMPTY);
    setSavedPlate('');
    setError('');
    setSubmitting(false);
    setDone(false);
    setStep(0);
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }

  const days = calcMD(form.startDate, form.endDate);

  const summary: [VehicleField, string][] = [
    ['plant', form.plant], // form.plant เป็น label อยู่แล้ว
    ['company', form.company.trim()],
    ['plateNumber', form.plateNumber],
    ['plateProvince', form.plateProvince],
    ['driverName', form.driverName.trim()],
    ['location', form.location.trim()],
    ['reason', form.reason.trim()],
    ['contactTel', form.contactTel.trim()],
  ];

  return (
    <div style={{ minHeight: '100vh', background: gDS.bg, fontFamily: gDS.font }}>
      <TopBar credential={credential} role={role} onLogout={logout} />
      <div style={{ maxWidth: 520, margin: '0 auto', padding: '84px 16px 40px' }}>
        <BackLink href="/contractor">← กลับหน้าเมนู</BackLink>

        {done ? (
          <GCard style={{ textAlign: 'center', padding: 32 }}>
            <div style={{ fontSize: 44, marginBottom: 8 }}>🚗</div>
            <h2 style={{ margin: '0 0 6px', fontSize: 20, color: gDS.text }}>
              บันทึกคำขอสำเร็จ
            </h2>
            <p style={{ color: gDS.muted, fontSize: 14, margin: '0 0 8px' }}>
              ส่งคำขอนำรถทะเบียน {savedPlate} เข้าโรงงานเรียบร้อยแล้ว
            </p>
            <p style={{ color: gDS.muted, fontSize: 13, margin: '0 0 20px' }}>
              เจ้าหน้าที่จะตรวจสอบและยืนยันคำขอก่อนส่งเข้าระบบ EPRO
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Btn variant="accent" onClick={nextVehicle}>
                ขออนุมัติคันถัดไป
              </Btn>
              <Btn variant="secondary" onClick={reset}>
                เริ่มกรอกใหม่
              </Btn>
              <Btn
                variant="ghost"
                onClick={() => {
                  window.location.href = '/contractor';
                }}
              >
                ← กลับหน้าเมนู
              </Btn>
            </div>
          </GCard>
        ) : (
          <GCard>
            <StepBar steps={STEPS} current={step} />

            {step === 0 && (
              <>
                <h2 style={{ margin: '0 0 4px', fontSize: 18, color: gDS.text }}>
                  ข้อมูลคำขอนำรถเข้าโรงงาน
                </h2>
                <p style={{ margin: '0 0 8px', fontSize: 12, color: gDS.muted }}>
                  1 คำขอ = รถ 1 คัน (ไม่อนุญาตให้มีผู้โดยสาร)
                </p>

                <h3 style={subHead}>ข้อมูลงาน</h3>
                <SelBox
                  label={VEHICLE_LABELS.plant}
                  value={form.plant}
                  onChange={(v) => set('plant', v)}
                  options={PLANTS.map((p) => p.label)}
                />
                <Combobox
                  label={VEHICLE_LABELS.company}
                  value={form.company}
                  onChange={(v) => set('company', v)}
                  options={companies}
                  placeholder="เลือกหรือพิมพ์ชื่อบริษัท"
                />
                <InpBox
                  label={VEHICLE_LABELS.location}
                  value={form.location}
                  onChange={(v) => set('location', v.slice(0, MAX_LOCATION))}
                  placeholder="เช่น อาคาร SP หรือ โซน RM"
                />

                <h3 style={subHead}>ช่วงวัน-เวลาที่นำรถเข้า</h3>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <DatePick
                      label={VEHICLE_LABELS.startDate}
                      value={form.startDate}
                      onChange={changeStartDate}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <DatePick
                      label={VEHICLE_LABELS.endDate}
                      value={form.endDate}
                      onChange={(v) => set('endDate', v)}
                      min={endMin}
                      max={endMax}
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ flex: 1, display: 'flex', gap: 6 }}>
                    <div style={{ flex: 1 }}>
                      <SelBox
                        label={VEHICLE_LABELS.startTime}
                        value={form.startHour}
                        onChange={(v) => set('startHour', v)}
                        options={TIME_HOURS}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <SelBox
                        label="นาที"
                        value={form.startMin}
                        onChange={(v) => set('startMin', v)}
                        options={TIME_MINUTES}
                      />
                    </div>
                  </div>
                  <div style={{ flex: 1, display: 'flex', gap: 6 }}>
                    <div style={{ flex: 1 }}>
                      <SelBox
                        label={VEHICLE_LABELS.endTime}
                        value={form.endHour}
                        onChange={(v) => set('endHour', v)}
                        options={TIME_HOURS}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <SelBox
                        label="นาที"
                        value={form.endMin}
                        onChange={(v) => set('endMin', v)}
                        options={TIME_MINUTES}
                      />
                    </div>
                  </div>
                </div>
                <p style={{ margin: '-6px 0 10px', fontSize: 12, color: gDS.muted }}>
                  วันที่สิ้นสุดต้องอยู่หลังวันที่เริ่ม {MIN_SPAN_DAYS}–{MAX_SPAN_DAYS} วัน ·
                  เวลาเริ่มต้องห่างจากปัจจุบันอย่างน้อย 1 ชั่วโมง
                </p>
                {riskyLead && (
                  <div
                    style={{
                      background: '#fef3c7',
                      color: '#92400e',
                      fontSize: 12,
                      lineHeight: 1.6,
                      padding: '10px 12px',
                      borderRadius: gDS.r.s,
                      marginBottom: 12,
                    }}
                  >
                    เวลาเริ่มชิดขั้นต่ำ (อีก {lead} นาที) — ระบบ EPRO นับ 1 ชั่วโมงจากตอน
                    ที่ส่งเข้าระบบจริง ถ้าเจ้าหน้าที่ยืนยันไม่ทัน คำขอจะถูกปฏิเสธ
                    แนะนำให้เผื่อเวลามากกว่านี้
                  </div>
                )}
                {days > 0 && <Badge color="blue">นำรถเข้า {days} วัน</Badge>}

                <h3 style={subHead}>ข้อมูลรถและผู้ขับขี่</h3>
                <InpBox
                  label={VEHICLE_LABELS.plateNumber}
                  value={form.plateNumber}
                  onChange={(v) => set('plateNumber', v.replace(/\s+/g, ' ').slice(0, MAX_PLATE))}
                  placeholder="เช่น 1กก 1234 หรือ 70-1234"
                />
                <SelBox
                  label={VEHICLE_LABELS.plateProvince}
                  value={form.plateProvince}
                  onChange={(v) => set('plateProvince', v)}
                  options={PLATE_PROVINCES}
                  placeholder="— เลือกจังหวัด —"
                />
                <InpBox
                  label={VEHICLE_LABELS.driverName}
                  value={form.driverName}
                  onChange={(v) => set('driverName', v.slice(0, MAX_DRIVER_NAME))}
                  placeholder="เช่น นายสมชาย ใจดี"
                />
                <InpBox
                  label={`${VEHICLE_LABELS.contactTel} (ไม่บังคับ)`}
                  value={form.contactTel}
                  onChange={(v) => set('contactTel', v.replace(/\D/g, '').slice(0, 10))}
                  placeholder="เช่น 0891234567"
                  inputMode="tel"
                  error={
                    form.contactTel && !/^0\d{8,9}$/.test(form.contactTel)
                      ? 'ต้องเป็นตัวเลข 9–10 หลัก'
                      : undefined
                  }
                />

                <h3 style={subHead}>เหตุผล</h3>
                <TxtBox
                  label={VEHICLE_LABELS.reason}
                  value={form.reason}
                  onChange={(v) => set('reason', v.slice(0, MAX_REASON))}
                  placeholder="เช่น ขนส่งวัสดุก่อสร้างเข้าไซต์งาน"
                  rows={3}
                />
              </>
            )}

            {step === 1 && (
              <>
                <h2 style={{ margin: '0 0 14px', fontSize: 18, color: gDS.text }}>
                  ตรวจสอบข้อมูลก่อนส่ง
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
                    <strong>ช่วงวัน-เวลา:</strong> {form.startDate} {payload.startTime} ถึง{' '}
                    {form.endDate} {payload.endTime}
                  </div>
                  {summary
                    .filter(([, v]) => v)
                    .map(([k, v]) => (
                      <div key={k}>
                        <strong>{VEHICLE_LABELS[k]}:</strong> {v}
                      </div>
                    ))}
                </div>
                <Badge color="amber">นำรถเข้า {days} วัน</Badge>
              </>
            )}

            {error && (
              <div
                style={{
                  background: gDS.errBg,
                  color: gDS.err,
                  fontSize: 13,
                  padding: '10px 12px',
                  borderRadius: gDS.r.s,
                  margin: '14px 0 0',
                }}
              >
                {error}
              </div>
            )}

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: 18,
              }}
            >
              {step > 0 ? (
                <Btn variant="ghost" onClick={() => setStep(0)}>
                  ← ย้อนกลับ
                </Btn>
              ) : (
                <span />
              )}
              {step === 0 ? (
                <Btn variant="accent" onClick={next}>
                  ถัดไป →
                </Btn>
              ) : (
                <Btn variant="ok" onClick={submit} disabled={submitting}>
                  {submitting ? 'กำลังบันทึก...' : 'ยืนยันการขออนุมัติ'}
                </Btn>
              )}
            </div>
          </GCard>
        )}
      </div>
    </div>
  );
}
