'use client';

// การ์ดคำขอนำรถเข้าโรงงานบนหน้า admin
//
// ทำตามแบบ ManagerSummary: component ที่คืน GCard ก้อนเดียว จบในตัว fetch เอง
// ไม่ยัดเข้า AdminFlow.tsx (962 บรรทัด) และไม่สร้าง component แท็บ ตามกฎบ้าน
// ใน agent-prompt-user-list.md ที่ให้เพิ่ม section เป็น GCard อีกก้อนพร้อม <h3>

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { gDS, matchesCompanyFilter } from '@/lib/constants';
import { Badge, Btn, GCard } from '@/components/atoms';
import SyncCell, { type SyncAction } from '@/components/SyncCell';
import { MAX_ATTEMPTS, SYNC_LABELS } from '@/lib/sync';
import { PLANT_LABELS, VEHICLE_LABELS, minutesUntil } from '@/lib/vehicle';

export interface VehicleRow {
  id: string;
  plant: string;
  company: string;
  driverName: string;
  plateNumber: string;
  plateProvince: string;
  location: string;
  reason: string;
  contactTel: string | null;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  createdAt: string;
  createdBy: string;
  author?: { credential: string };
  syncStatus: string;
  syncAttempt: number;
  lastSyncError: string | null;
  syncedAt: string | null;
  confirmedAt: string | null;
  confirmedBy: string | null;
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

const alertStyle: React.CSSProperties = {
  padding: '12px 16px',
  borderRadius: gDS.r.m,
  marginBottom: 12,
  fontSize: 14,
  fontWeight: 600,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexWrap: 'wrap',
};

// เตือนเมื่อเวลาเริ่มเหลือน้อยกว่านี้ — กฎ 1 ชม.ของ EPRO นับตอน RPA กดบันทึก
// ถ้า admin ยืนยันช้า คำขอจะถูก EPRO ปฏิเสธและ retry ไม่ช่วยเพราะเวลาเดินหน้า
const URGENT_MINUTES = 90;

// สถานะที่ยังต้องส่งเข้า EPRO — ใช้ตัดสินว่าใบไหน "ใกล้หมดเวลา" อย่างมีความหมาย
const NOT_YET_SENT = ['PENDING', 'CONFIRMED', 'FAILED', 'NEEDS_REVIEW'];

export default function VehicleRequests({
  companyFilter,
  customCompany,
}: {
  companyFilter: string;
  customCompany: string;
}) {
  const [rows, setRows] = useState<VehicleRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/vehicle-requests');
      if (res.ok) setRows(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function action(id: string, name: SyncAction) {
    const res = await fetch(`/api/vehicle-requests/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: name }),
    });
    if (res.ok) {
      load();
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error || 'เกิดข้อผิดพลาด');
    }
  }

  // ใช้ตรรกะตัวกรองเดียวกับตารางลงทะเบียนแรงงาน ไม่งั้นการ์ดจะขัดกับตัวกรองเงียบๆ
  const filtered = useMemo(
    () => rows.filter((r) => matchesCompanyFilter(r.company, companyFilter, customCompany)),
    [rows, companyFilter, customCompany],
  );

  const pendingCount = filtered.filter((r) => r.syncStatus === 'PENDING').length;
  const syncedCount = filtered.filter((r) => r.syncStatus === 'SYNCED').length;
  const needsReviewCount = filtered.filter((r) => r.syncStatus === 'NEEDS_REVIEW').length;
  const permanentFailedCount = filtered.filter(
    (r) => r.syncStatus === 'FAILED' && r.syncAttempt >= MAX_ATTEMPTS,
  ).length;
  const problemCount = needsReviewCount + permanentFailedCount;

  const urgent = filtered.filter((r) => {
    if (!NOT_YET_SENT.includes(r.syncStatus)) return false;
    const mins = minutesUntil(r.startDate, r.startTime);
    return mins !== null && mins < URGENT_MINUTES;
  });

  function exportExcel() {
    const data = filtered.map((r) => ({
      [VEHICLE_LABELS.plateNumber]: r.plateNumber,
      [VEHICLE_LABELS.plateProvince]: r.plateProvince,
      [VEHICLE_LABELS.driverName]: r.driverName,
      [VEHICLE_LABELS.company]: r.company,
      [VEHICLE_LABELS.plant]: PLANT_LABELS[r.plant] ?? r.plant,
      [VEHICLE_LABELS.location]: r.location,
      [VEHICLE_LABELS.startDate]: `${r.startDate} ${r.startTime}`,
      [VEHICLE_LABELS.endDate]: `${r.endDate} ${r.endTime}`,
      [VEHICLE_LABELS.reason]: r.reason,
      [VEHICLE_LABELS.contactTel]: r.contactTel || '-',
      วันที่บันทึก: r.createdAt,
      'สถานะ EPRO': SYNC_LABELS[r.syncStatus] || r.syncStatus,
      'วันที่ส่ง EPRO': r.syncedAt ? r.syncedAt.slice(0, 10) : '-',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'VehicleRequests');
    XLSX.writeFile(wb, `vehicle-requests-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <GCard style={{ marginBottom: 20 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
          marginBottom: 12,
        }}
      >
        <h3 style={{ margin: 0, fontSize: 16, color: gDS.text }}>
          🚗 คำขอนำรถเข้าโรงงาน ({filtered.length})
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {pendingCount > 0 && <Badge color="gray">รอยืนยัน {pendingCount}</Badge>}
          {syncedCount > 0 && <Badge color="green">ส่งแล้ว {syncedCount}</Badge>}
          {problemCount > 0 && <Badge color="red">มีปัญหา {problemCount}</Badge>}
          <Btn variant="ok" onClick={exportExcel} disabled={filtered.length === 0}>
            ⬇ ส่งออก Excel (คำขอนำรถ)
          </Btn>
        </div>
      </div>

      {/* แถบเตือนแดงคือกลไก alert เดียวของโปรเจกต์ (ไม่มี email/LINE) การ์ดนี้จึงต้องมีของตัวเอง */}
      {problemCount > 0 && (
        <div style={{ ...alertStyle, background: gDS.errBg, color: gDS.err }}>
          ⚠️ มีคำขอนำรถที่ต้องดำเนินการ:{' '}
          {needsReviewCount > 0 && `${needsReviewCount} คำขอรอตรวจสอบ`}
          {needsReviewCount > 0 && permanentFailedCount > 0 && ' | '}
          {permanentFailedCount > 0 && `${permanentFailedCount} คำขอส่งไม่สำเร็จ`}
        </div>
      )}

      {urgent.length > 0 && (
        <div style={{ ...alertStyle, background: '#fef3c7', color: '#92400e' }}>
          ⏰ {urgent.length} คำขอใกล้ถึงเวลาเข้าแล้ว (เหลือน้อยกว่า {URGENT_MINUTES} นาที) —
          EPRO ไม่รับคำขอที่เวลาเริ่มเหลือน้อยกว่า 1 ชั่วโมง กรุณายืนยันด่วนหรือยกเลิก
        </div>
      )}

      <div style={{ overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle}>สถานะ EPRO</th>
              <th style={thStyle}>วันที่ส่ง EPRO</th>
              <th style={thStyle}>{VEHICLE_LABELS.plateNumber}</th>
              <th style={thStyle}>{VEHICLE_LABELS.plateProvince}</th>
              <th style={thStyle}>{VEHICLE_LABELS.driverName}</th>
              <th style={thStyle}>{VEHICLE_LABELS.company}</th>
              <th style={thStyle}>{VEHICLE_LABELS.plant}</th>
              <th style={thStyle}>{VEHICLE_LABELS.location}</th>
              <th style={thStyle}>เข้า</th>
              <th style={thStyle}>ออก</th>
              <th style={thStyle}>{VEHICLE_LABELS.contactTel}</th>
              <th style={thStyle}>วันที่บันทึก</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td style={{ ...tdStyle, color: gDS.muted }} colSpan={12}>
                  กำลังโหลดข้อมูล...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td style={{ ...tdStyle, color: gDS.muted }} colSpan={12}>
                  ไม่มีข้อมูล
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                // เหตุผลเป็นข้อความยาว ไม่ทำเป็นคอลัมน์ (พัง layout) ใส่เป็น tooltip แทน
                <tr key={r.id} title={`${VEHICLE_LABELS.reason}: ${r.reason}`}>
                  <td style={tdStyle}>
                    <SyncCell
                      status={r.syncStatus}
                      syncedAt={r.syncedAt}
                      lastSyncError={r.lastSyncError}
                      onAction={(a) => action(r.id, a)}
                    />
                  </td>
                  <td style={tdStyle}>{r.syncedAt ? r.syncedAt.slice(0, 10) : '-'}</td>
                  <td style={tdStyle}>{r.plateNumber}</td>
                  <td style={tdStyle}>{r.plateProvince}</td>
                  <td style={tdStyle}>{r.driverName}</td>
                  <td style={tdStyle}>{r.company}</td>
                  <td style={tdStyle}>{PLANT_LABELS[r.plant] ?? r.plant}</td>
                  <td style={tdStyle}>{r.location}</td>
                  <td style={tdStyle}>
                    {r.startDate} {r.startTime}
                  </td>
                  <td style={tdStyle}>
                    {r.endDate} {r.endTime}
                  </td>
                  <td style={tdStyle}>{r.contactTel || '-'}</td>
                  <td style={tdStyle}>{r.createdAt}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </GCard>
  );
}
