'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { gDS } from '@/lib/constants';
import { Btn, InpBox, GCard } from '@/components/atoms';

export default function LoginScreen() {
  const [credential, setCredential] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!credential || !password) {
      setError('กรุณากรอกข้อมูลให้ครบถ้วน');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'เข้าสู่ระบบไม่สำเร็จ');
        setLoading(false);
        return;
      }
      window.location.href = data.role === 'admin' ? '/admin' : '/contractor';
    } catch {
      setError('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        background: gDS.bg,
        fontFamily: gDS.font,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          padding: '20px 20px 0',
        }}
      >
        <Image
          src="/sys-logo.jpg"
          alt="SYS"
          width={220}
          height={124}
          style={{ width: 220, height: 'auto', borderRadius: gDS.r.m, marginBottom: 28 }}
          priority
        />
        <GCard style={{ width: '100%', maxWidth: 400, padding: 28 }}>
          <div style={{ textAlign: 'center', marginBottom: 22 }}>
            <h1
              style={{
                margin: 0,
                fontSize: 22,
                fontWeight: 700,
                color: gDS.primary,
                fontFamily: gDS.font,
              }}
            >
              ระบบ Gate Pass
            </h1>
            <p
              style={{
                margin: '6px 0 0',
                color: gDS.muted,
                fontSize: 14,
                fontFamily: gDS.font,
              }}
            >
              เข้าสู่ระบบ
            </p>
          </div>
          <form onSubmit={submit}>
            <InpBox
              label="เบอร์โทรหรืออีเมล"
              value={credential}
              onChange={setCredential}
              placeholder="เช่น 0891234567"
            />
            <InpBox
              label="รหัสผ่าน"
              value={password}
              onChange={setPassword}
              type="password"
              placeholder="รหัสผ่าน"
            />
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
            <Btn type="submit" disabled={loading} style={{ width: '100%' }}>
              {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
            </Btn>
          </form>
        </GCard>
      </div>
      <Image
        src="/workers.png"
        alt=""
        width={1203}
        height={444}
        style={{ width: '100%', maxWidth: 560, height: 'auto', display: 'block' }}
      />
    </div>
  );
}
