/* gp-auth.jsx — Login screen */

function LoginScreen({ onLogin }) {
  const [tab, setTab] = React.useState('phone');
  const [cred, setCred] = React.useState('');
  const [pass, setPass] = React.useState('');
  const [role, setRole] = React.useState('contractor');
  const [err, setErr] = React.useState('');

  const switchTab = (t) => { setTab(t); setCred(''); setErr(''); };

  const handleLogin = () => {
    setErr('');
    if (!cred.trim()) { setErr('กรุณากรอก' + (tab === 'phone' ? 'เบอร์มือถือ' : 'อีเมล')); return; }
    if (!pass.trim()) { setErr('กรุณากรอกรหัสผ่าน'); return; }
    if (tab === 'phone' && !/^\d{9,10}$/.test(cred.trim())) { setErr('เบอร์โทรศัพท์ต้องเป็นตัวเลข 9–10 หลัก'); return; }
    if (tab === 'email' && !/.+@.+\..+/.test(cred.trim())) { setErr('รูปแบบอีเมลไม่ถูกต้อง'); return; }
    const user = { id: Date.now().toString(), credential: cred.trim(), role, loginType: tab };
    onLogin(user);
  };

  const handleKey = (e) => { if (e.key === 'Enter') handleLogin(); };

  return (
    <div style={{
      minHeight: '100vh', background: gDS.primary,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '24px 20px', fontFamily: gDS.font,
    }}>
      <Logo lg inv />

      <div style={{
        background: '#fff', borderRadius: gDS.r.l, padding: '28px 24px',
        width: '100%', maxWidth: 420, marginTop: 32,
        boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
      }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: gDS.text, marginBottom: 6 }}>เข้าสู่ระบบ</div>
        <div style={{ fontSize: 13, color: gDS.muted, marginBottom: 22 }}>กรุณากรอกข้อมูลเพื่อเข้าใช้งาน</div>

        {/* Tab switcher */}
        <div style={{ display: 'flex', background: '#f0f4f8', borderRadius: gDS.r.m, padding: 4, marginBottom: 20, gap: 4 }}>
          {[['phone', 'เบอร์มือถือ'], ['email', 'อีเมล']].map(([v, l]) => (
            <button key={v} onClick={() => switchTab(v)} style={{
              flex: 1, padding: '9px 0', border: 'none', borderRadius: 7,
              background: tab === v ? '#fff' : 'transparent',
              color: tab === v ? gDS.text : gDS.muted,
              fontWeight: tab === v ? 600 : 400, cursor: 'pointer',
              fontFamily: gDS.font, fontSize: 14,
              boxShadow: tab === v ? gDS.sh : 'none',
              transition: 'all 0.15s',
            }}>{l}</button>
          ))}
        </div>

        <InpBox
          lbl={tab === 'phone' ? 'เบอร์มือถือ' : 'อีเมล'}
          val={cred} set={setCred}
          ph={tab === 'phone' ? '0812345678' : 'name@company.com'}
          type={tab === 'phone' ? 'tel' : 'email'}
          im={tab === 'phone' ? 'numeric' : 'email'}
          max={tab === 'phone' ? 10 : 100}
          autoFocus
        />
        <div onKeyDown={handleKey}>
          <InpBox lbl="รหัสผ่าน" val={pass} set={setPass} ph="••••••••" type="password" />
        </div>

        <SelBox
          lbl="เข้าใช้งานในฐานะ"
          val={role} set={setRole}
          opts={[
            { v: 'contractor', l: 'ผู้รับเหมา / ช่าง' },
            { v: 'admin',      l: 'เจ้าหน้าที่ / Admin' },
          ]}
        />

        {err && (
          <div style={{
            background: gDS.errBg, border: `1px solid #fecaca`,
            color: gDS.err, borderRadius: gDS.r.s, padding: '10px 14px',
            marginBottom: 14, fontSize: 13,
          }}>{err}</div>
        )}

        <Btn label="เข้าสู่ระบบ" v="accent" fw onClick={handleLogin} />

        <div style={{ marginTop: 20, padding: '12px 14px', background: '#f8fafc', borderRadius: gDS.r.s, border: `1px solid ${gDS.border}` }}>
          <div style={{ fontSize: 12, color: gDS.muted, fontWeight: 600, marginBottom: 4 }}>ทดสอบระบบ (Demo)</div>
          <div style={{ fontSize: 12, color: gDS.muted, lineHeight: 1.6 }}>
            ผู้รับเหมา: เบอร์ใดก็ได้ + รหัสใดก็ได้<br />
            Admin: เลือก "เจ้าหน้าที่" + กรอกข้อมูลใดก็ได้
          </div>
        </div>
      </div>

      <div style={{ marginTop: 20, color: 'rgba(255,255,255,0.3)', fontSize: 12, textAlign: 'center' }}>
        SYS Gate Pass Management System · v1.0
      </div>
    </div>
  );
}

window.LoginScreen = LoginScreen;
