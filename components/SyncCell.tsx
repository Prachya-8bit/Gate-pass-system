'use client';

// คอลัมน์ "สถานะ EPRO" — ใช้ร่วมกันระหว่างตารางรายการลงทะเบียนแรงงาน (AdminFlow)
// และตารางคำขอนำรถเข้าโรงงาน (VehicleRequests) ทั้งสองตารางใช้ state machine
// เดียวกัน จึงต้องใช้ป้าย/ปุ่ม/สีชุดเดียวกัน ถ้าแยกกันแล้ว drift จะทำให้ admin
// แก้รายการที่ค้างของฝั่งใดฝั่งหนึ่งไม่ได้
import React from 'react';
import { Badge, Btn } from '@/components/atoms';
import { SYNC_LABELS } from '@/lib/sync';

const smallBtnStyle: React.CSSProperties = {
  padding: '4px 10px',
  fontSize: 12,
};

const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6 };

export type SyncAction =
  | 'confirm'
  | 'unconfirm'
  | 'retry'
  | 'resolveSynced'
  | 'resolveNotSynced'
  | 'cancel';

export default function SyncCell({
  status,
  syncedAt,
  lastSyncError,
  onAction,
}: {
  status: string;
  syncedAt?: string | null;
  lastSyncError?: string | null;
  // ไม่ส่ง onAction = แสดงป้ายเฉยๆ ไม่มีปุ่ม (สำหรับมุมมองอ่านอย่างเดียว)
  onAction?: (action: SyncAction) => void;
}) {
  switch (status) {
    case 'PENDING':
      return (
        <div style={rowStyle}>
          <Badge color="gray">{SYNC_LABELS.PENDING}</Badge>
          {onAction && (
            <Btn variant="accent" style={smallBtnStyle} onClick={() => onAction('confirm')}>
              ยืนยัน
            </Btn>
          )}
        </div>
      );
    case 'CONFIRMED':
      return (
        <div style={rowStyle}>
          <Badge color="amber">{SYNC_LABELS.CONFIRMED}</Badge>
          {onAction && (
            <Btn variant="secondary" style={smallBtnStyle} onClick={() => onAction('unconfirm')}>
              ยกเลิก
            </Btn>
          )}
        </div>
      );
    case 'SYNCING':
      return <Badge color="blue">{SYNC_LABELS.SYNCING}</Badge>;
    case 'SYNCED':
      return (
        <span title={syncedAt ? syncedAt.slice(0, 10) : undefined}>
          <Badge color="green">{SYNC_LABELS.SYNCED}</Badge>
        </span>
      );
    case 'FAILED':
      return (
        <div style={rowStyle} title={lastSyncError || undefined}>
          <Badge color="red">{SYNC_LABELS.FAILED}</Badge>
          {onAction && (
            <Btn variant="danger" style={smallBtnStyle} onClick={() => onAction('retry')}>
              ลองใหม่
            </Btn>
          )}
        </div>
      );
    case 'NEEDS_REVIEW':
      return (
        <div style={{ ...rowStyle, flexWrap: 'wrap' }}>
          <Badge color="red">{SYNC_LABELS.NEEDS_REVIEW}</Badge>
          {onAction && (
            <>
              <Btn variant="ok" style={smallBtnStyle} onClick={() => onAction('resolveSynced')}>
                ส่งแล้ว
              </Btn>
              <Btn
                variant="secondary"
                style={smallBtnStyle}
                onClick={() => onAction('resolveNotSynced')}
              >
                ยังไม่ส่ง
              </Btn>
            </>
          )}
        </div>
      );
    case 'CANCELLED':
      return <Badge color="gray">{SYNC_LABELS.CANCELLED}</Badge>;
    default:
      return <Badge color="gray">{status}</Badge>;
  }
}
