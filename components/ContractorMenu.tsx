'use client';

// หน้าเมนูของผู้รับเหมา — /contractor เดิมเปิดมาเจอฟอร์มคนงานทันที ตอนนี้มี 2 ฟอร์ม
// จึงต้องมีหน้าเลือกก่อน bookmark /contractor เดิมจะมาลงที่นี่ซึ่งถูกต้องแล้ว
// ไม่ต้องทำ redirect

import React from 'react';
import { gDS, MAX_WORKERS_PER_SUBMIT } from '@/lib/constants';
import { Btn, GCard, TopBar } from '@/components/atoms';

function MenuCard({
  icon,
  title,
  detail,
  href,
  style,
}: {
  icon: string;
  title: string;
  detail: string;
  href: string;
  style?: React.CSSProperties;
}) {
  return (
    <GCard style={style}>
      <h3 style={{ margin: '0 0 6px', fontSize: 16, color: gDS.text }}>
        {icon} {title}
      </h3>
      <p style={{ margin: '0 0 14px', fontSize: 13, color: gDS.muted, lineHeight: 1.7 }}>
        {detail}
      </p>
      <Btn
        variant="accent"
        style={{ width: '100%' }}
        onClick={() => {
          window.location.href = href;
        }}
      >
        เริ่มกรอกข้อมูล →
      </Btn>
    </GCard>
  );
}

export default function ContractorMenu({
  credential,
  role,
}: {
  credential: string;
  role: string;
}) {
  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }

  return (
    <div style={{ minHeight: '100vh', background: gDS.bg, fontFamily: gDS.font }}>
      <TopBar credential={credential} role={role} onLogout={logout} />
      <div style={{ maxWidth: 520, margin: '0 auto', padding: '84px 16px 40px' }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 20, color: gDS.text }}>
          เลือกรายการที่ต้องการดำเนินการ
        </h2>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: gDS.muted }}>
          แตะปุ่มด้านล่างเพื่อเริ่มกรอกแบบฟอร์ม
        </p>

        <MenuCard
          icon="👷"
          title="ลงทะเบียนแรงงานเข้าปฏิบัติงาน"
          detail={`กรอกรายชื่อแรงงาน ช่วงวันที่ปฏิบัติงาน และข้อมูลโครงการ — ลงทะเบียนได้สูงสุด ${MAX_WORKERS_PER_SUBMIT} คนต่อครั้ง`}
          href="/contractor/workers"
          style={{ marginBottom: 16 }}
        />

        <MenuCard
          icon="🚗"
          title="ขออนุมัตินำรถยนต์เข้ามาปฏิบัติงานภายในโรงงาน"
          detail="กรอกข้อมูลรถ ผู้ขับขี่ และช่วงวัน-เวลาที่ต้องการนำรถเข้าโรงงาน — 1 คันต่อ 1 คำขอ"
          href="/contractor/vehicle"
        />
      </div>
    </div>
  );
}
