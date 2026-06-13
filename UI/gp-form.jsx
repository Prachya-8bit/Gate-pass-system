/* gp-form.jsx — Contractor 3-step registration form */

const { useState: useStateF, useCallback: useCBF } = React;

function newPerson() {
  return { id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: '', idCard: '' };
}

// ── Step 1: People list ───────────────────────────────────────────────────────
function Step1({ data, setData, onNext }) {
  const [errs, setErrs] = useStateF({});

  const addPerson = () => {
    if (data.people.length >= 10) return;
    setData(d => ({ ...d, people: [...d.people, newPerson()] }));
  };

  const removePerson = (id) => {
    if (data.people.length <= 1) return;
    setData(d => ({ ...d, people: d.people.filter(p => p.id !== id) }));
    setErrs(e => { const n = { ...e }; delete n[id + 'n']; delete n[id + 'i']; return n; });
  };

  const update = (id, field, raw) => {
    const value = field === 'idCard' ? raw.replace(/\D/g, '').slice(0, 13) : raw;
    setData(d => ({ ...d, people: d.people.map(p => p.id === id ? { ...p, [field]: value } : p) }));
    setErrs(e => { const n = { ...e }; delete n[id + (field === 'name' ? 'n' : 'i')]; return n; });
  };

  const validate = () => {
    const e = {};
    data.people.forEach(p => {
      if (!p.name.trim())              e[p.id + 'n'] = true;
      if (!/^\d{13}$/.test(p.idCard))  e[p.id + 'i'] = true;
    });
    setErrs(e);
    return Object.keys(e).length === 0;
  };

  return (
    <div style={{ fontFamily: gDS.font }}>
      <StepBar step={1} total={3} />
      <div style={{ padding: '14px 16px 24px' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: gDS.text }}>รายชื่อผู้เข้าทำงาน</div>
          <div style={{ fontSize: 12, background: '#f0f4f8', border: `1px solid ${gDS.border}`, color: gDS.muted, borderRadius: 12, padding: '3px 11px' }}>
            {data.people.length} / 10 คน
          </div>
        </div>

        {/* Column headers */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 6, paddingLeft: 26 }}>
          <div style={{ flex: 5, fontSize: 12, color: gDS.muted, fontWeight: 600 }}>ชื่อ-นามสกุล</div>
          <div style={{ flex: 4, fontSize: 12, color: gDS.muted, fontWeight: 600 }}>เลขบัตรประชาชน</div>
          <div style={{ width: 30 }}></div>
        </div>

        {data.people.map((p, i) => (
          <div key={p.id} style={{ marginBottom: 6 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {/* Row number */}
              <div style={{ width: 20, fontSize: 12, color: gDS.muted, textAlign: 'center', flexShrink: 0, fontWeight: 600 }}>{i + 1}</div>

              {/* Name input */}
              <input
                value={p.name}
                onChange={e => update(p.id, 'name', e.target.value)}
                placeholder="ชื่อ-นามสกุล"
                style={{
                  flex: 5, border: `2px solid ${errs[p.id + 'n'] ? gDS.err : gDS.border}`,
                  borderRadius: gDS.r.s, padding: '9px 10px', fontFamily: gDS.font,
                  fontSize: 14, color: gDS.text, background: '#fff', outline: 'none', boxSizing: 'border-box',
                }}
                onFocus={e => e.target.style.borderColor = errs[p.id + 'n'] ? gDS.err : gDS.primary}
                onBlur={e => e.target.style.borderColor = errs[p.id + 'n'] ? gDS.err : gDS.border}
              />

              {/* ID Card input — numbers only */}
              <input
                value={p.idCard}
                onChange={e => update(p.id, 'idCard', e.target.value)}
                placeholder="1234567890123"
                inputMode="numeric"
                maxLength={13}
                style={{
                  flex: 4, border: `2px solid ${errs[p.id + 'i'] ? gDS.err : gDS.border}`,
                  borderRadius: gDS.r.s, padding: '9px 10px', fontFamily: gDS.font,
                  fontSize: 13, color: gDS.text, background: '#fff', outline: 'none',
                  boxSizing: 'border-box', letterSpacing: 1,
                }}
                onFocus={e => e.target.style.borderColor = errs[p.id + 'i'] ? gDS.err : gDS.primary}
                onBlur={e => e.target.style.borderColor = errs[p.id + 'i'] ? gDS.err : gDS.border}
              />

              {/* Remove button */}
              <button onClick={() => removePerson(p.id)} disabled={data.people.length === 1} style={{
                width: 30, height: 30, border: `1.5px solid ${gDS.border}`, borderRadius: '50%',
                background: '#fff', color: data.people.length === 1 ? '#ccc' : '#888',
                cursor: data.people.length === 1 ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, flexShrink: 0, padding: 0,
              }}>×</button>
            </div>

            {/* Inline validation messages */}
            {(errs[p.id + 'n'] || errs[p.id + 'i']) && (
              <div style={{ display: 'flex', gap: 6, marginTop: 3, paddingLeft: 26 }}>
                <div style={{ flex: 5, fontSize: 11, color: errs[p.id + 'n'] ? gDS.err : 'transparent' }}>กรอกชื่อ-นามสกุล</div>
                <div style={{ flex: 4, fontSize: 11, color: errs[p.id + 'i'] ? gDS.err : 'transparent' }}>ต้องเป็นตัวเลข 13 หลัก</div>
                <div style={{ width: 30 }}></div>
              </div>
            )}
          </div>
        ))}

        {/* Add person button */}
        <button
          onClick={addPerson}
          disabled={data.people.length >= 10}
          style={{
            width: '100%', border: `2px dashed ${data.people.length >= 10 ? '#e2e8f0' : '#94a3b8'}`,
            borderRadius: gDS.r.m, padding: '10px 0', background: 'transparent',
            color: data.people.length >= 10 ? '#ccc' : gDS.muted,
            fontFamily: gDS.font, fontSize: 14,
            cursor: data.people.length >= 10 ? 'not-allowed' : 'pointer',
            marginTop: 6, marginBottom: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >+ เพิ่มคน {data.people.length < 10 ? `(เหลืออีก ${10 - data.people.length} คน)` : '(ครบ 10 คนแล้ว)'}</button>

        <div style={{ fontSize: 12, color: gDS.muted, marginBottom: 18, display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ color: gDS.accent, fontSize: 14 }}>✦</span>
          กรอกเลขบัตรประชาชนเฉพาะตัวเลข 13 หลักเท่านั้น ไม่ต้องใส่ขีด
        </div>

        <Btn label="ถัดไป →" fw onClick={() => { if (validate()) onNext(); }} />
      </div>
    </div>
  );
}

// ── Step 2: Work details ──────────────────────────────────────────────────────
function Step2({ data, setData, onNext, onBack }) {
  const [errs, setErrs] = useStateF({});
  const [showOther, setShowOther] = useStateF(false);
  const md = calcMD(data.startDate, data.endDate);

  const upd = (k, v) => {
    setData(d => ({ ...d, [k]: v }));
    setErrs(e => { const n = { ...e }; delete n[k]; return n; });
  };

  const handleCoChange = (v) => {
    if (v === 'other') {
      setShowOther(true);
      upd('company', '');
    } else {
      setShowOther(false);
      upd('company', v);
    }
  };

  const validate = () => {
    const e = {};
    if (!data.company || data.company.startsWith('—')) e.company = 'กรุณาเลือกบริษัท';
    if (!data.startDate)        e.startDate = 'เลือกวันที่เข้าทำงาน';
    if (!data.endDate)          e.endDate = 'เลือกวันที่สิ้นสุด';
    if (data.startDate && data.endDate && data.endDate < data.startDate)
      e.endDate = 'วันออกต้องไม่ก่อนวันเข้า';
    setErrs(e);
    return Object.keys(e).length === 0;
  };

  return (
    <div style={{ fontFamily: gDS.font }}>
      <StepBar step={2} total={3} />
      <div style={{ padding: '14px 16px 24px' }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: gDS.text, marginBottom: 18 }}>รายละเอียดงาน</div>

        <SelBox
          lbl="บริษัทที่สังกัด"
          val={showOther ? 'other' : data.company}
          set={handleCoChange}
          opts={[...COMPANIES, { v: 'other', l: 'อื่นๆ (กรอกเอง)' }]}
        />
        {showOther && (
          <div style={{ marginTop: -10, marginBottom: 14 }}>
            <InpBox val={data.company} set={v => upd('company', v)} ph="กรอกชื่อบริษัท..." />
          </div>
        )}
        {errs.company && <div style={{ marginTop: -10, marginBottom: 10, fontSize: 12, color: gDS.err }}>{errs.company}</div>}

        <InpBox lbl="งานที่ทำ / ตำแหน่ง (ไม่จำเป็น)" val={data.job} set={v => upd('job', v)}
          ph="เช่น ช่างไฟฟ้า, ช่างสี, แรงงาน..." />

        <InpBox lbl="พื้นที่ทำงาน (Zone)" val={data.zone} set={v => upd('zone', v)}
          ph="เช่น Zone A, อาคาร 2, ชั้น 3..." />

        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <DatePick lbl="วันที่เข้าทำงาน" val={data.startDate} set={v => upd('startDate', v)} />
            {errs.startDate && <div style={{ marginTop: -10, marginBottom: 10, fontSize: 12, color: gDS.err }}>{errs.startDate}</div>}
          </div>
          <div style={{ flex: 1 }}>
            <DatePick lbl="วันที่สิ้นสุด" val={data.endDate} set={v => upd('endDate', v)} />
            {errs.endDate && <div style={{ marginTop: -10, marginBottom: 10, fontSize: 12, color: gDS.err }}>{errs.endDate}</div>}
          </div>
        </div>

        {/* Man-day preview */}
        {md > 0 && (
          <div style={{ background: '#f0fdf4', border: `1.5px solid #bbf7d0`, borderRadius: gDS.r.m, padding: '14px 16px', marginBottom: 18 }}>
            <div style={{ fontSize: 12, color: '#166534', fontWeight: 600, marginBottom: 4 }}>ประมาณการ Man-day</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 32, fontWeight: 800, color: gDS.ok, lineHeight: 1 }}>{md}</span>
              <span style={{ fontSize: 14, color: '#16a34a' }}>วัน / คน</span>
            </div>
            <div style={{ fontSize: 13, color: '#16a34a', marginTop: 4 }}>
              รวม {data.people.length} คน = <strong>{md * data.people.length} Man-days</strong>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <Btn label="← ย้อนกลับ" v="secondary" fw onClick={onBack} />
          <Btn label="ถัดไป →" fw onClick={() => { if (validate()) onNext(); }} />
        </div>
      </div>
    </div>
  );
}

// ── Step 3: Confirm ───────────────────────────────────────────────────────────
function Step3({ data, onSubmit, onBack }) {
  const [confirmed, setConfirmed] = useStateF(false);
  const md = calcMD(data.startDate, data.endDate);

  const fmt = d => d
    ? new Date(d + 'T12:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
    : '—';

  return (
    <div style={{ fontFamily: gDS.font }}>
      <StepBar step={3} total={3} />
      <div style={{ padding: '14px 16px 24px' }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: gDS.text, marginBottom: 16 }}>ตรวจสอบก่อนบันทึก</div>

        {/* Work summary card */}
        <GCard>
          <div style={{ fontSize: 12, color: gDS.muted, marginBottom: 2 }}>บริษัทที่สังกัด</div>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>{data.company}</div>
          <div style={{ display: 'flex' }}>
            {[['วันเข้า', fmt(data.startDate)], ['วันออก', fmt(data.endDate)], ['Man-day/คน', md + ' วัน']].map(([l, v], i) => (
              <div key={l} style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: gDS.muted }}>{l}</div>
                <div style={{ fontWeight: 700, fontSize: 14, color: i === 2 ? gDS.ok : gDS.text }}>{v}</div>
              </div>
            ))}
          </div>
          {data.zone && (
            <div style={{ marginTop: 10, fontSize: 12, color: gDS.muted, borderTop: `1px dashed ${gDS.border}`, paddingTop: 8 }}>
              พื้นที่: <span style={{ color: gDS.text, fontWeight: 600 }}>{data.zone}</span>
              {data.job && <>
                &emsp;งาน: <span style={{ color: gDS.text, fontWeight: 600 }}>{data.job}</span>
              </>}
            </div>
          )}
        </GCard>

        {/* People list */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: gDS.text }}>ผู้เข้าทำงาน</div>
            <Badge c="blue">{data.people.length} คน · {md * data.people.length} Man-days</Badge>
          </div>
          {data.people.map((p, i) => (
            <div key={p.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 12px', background: i % 2 === 0 ? '#fafafa' : '#fff',
              border: `1px solid ${gDS.border}`, borderRadius: gDS.r.s, marginBottom: 4,
            }}>
              <div style={{
                width: 22, height: 22, background: gDS.primary, color: '#fff', borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700, flexShrink: 0,
              }}>{i + 1}</div>
              <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{p.name}</div>
              <div style={{ fontSize: 11, color: gDS.muted, letterSpacing: 0.5, flexShrink: 0 }}>
                {p.idCard.slice(0, 3)}·······{p.idCard.slice(-3)}
              </div>
            </div>
          ))}
        </div>

        {/* Safety confirmation */}
        <button onClick={() => setConfirmed(c => !c)} style={{
          width: '100%', border: `2px solid ${confirmed ? gDS.ok : gDS.border}`,
          borderRadius: gDS.r.m, padding: '12px 14px',
          background: confirmed ? '#f0fdf4' : '#fff', cursor: 'pointer',
          display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 18, textAlign: 'left',
          transition: 'all 0.15s',
        }}>
          <div style={{
            width: 20, height: 20, border: `2px solid ${confirmed ? gDS.ok : '#aaa'}`,
            borderRadius: 4, background: confirmed ? gDS.ok : '#fff', flexShrink: 0, marginTop: 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, color: '#fff', transition: 'all 0.15s',
          }}>{confirmed && '✓'}</div>
          <span style={{ fontSize: 13, color: gDS.text, lineHeight: 1.6, fontFamily: gDS.font }}>
            ข้าพเจ้าขอรับรองว่าข้อมูลข้างต้นถูกต้อง และผู้เข้าทำงานทุกคน
            <strong> ไม่มีประวัติอุบัติเหตุ </strong>ในระหว่างช่วงเวลาที่ระบุ
          </span>
        </button>

        <div style={{ display: 'flex', gap: 10 }}>
          <Btn label="← ย้อนกลับ" v="secondary" fw onClick={onBack} />
          <Btn label={`✓ บันทึก ${data.people.length} คน`} fw onClick={confirmed ? onSubmit : undefined} disabled={!confirmed} />
        </div>
      </div>
    </div>
  );
}

// ── Success screen ────────────────────────────────────────────────────────────
function SuccessScreen({ result, onDone }) {
  const passNo = 'GP-' + new Date().getFullYear() + '-' + String(Math.floor(Math.random() * 9000) + 1000);
  const md = calcMD(result.startDate, result.endDate);

  return (
    <div style={{ padding: 20, fontFamily: gDS.font }}>
      <div style={{
        background: gDS.ok, color: '#fff', borderRadius: gDS.r.l,
        padding: '22px 20px', marginBottom: 20,
        display: 'flex', alignItems: 'center', gap: 16,
      }}>
        <div style={{
          width: 52, height: 52, background: 'rgba(255,255,255,0.22)',
          borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 26, flexShrink: 0,
        }}>✓</div>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>บันทึกสำเร็จ!</div>
          <div style={{ fontSize: 13, opacity: 0.9, marginTop: 2 }}>เลขที่อ้างอิง: {passNo}</div>
        </div>
      </div>

      <GCard>
        <div style={{ fontSize: 12, color: gDS.muted, marginBottom: 2 }}>บริษัท</div>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>{result.company}</div>
        <div style={{ display: 'flex', gap: 20, marginBottom: 14 }}>
          {[
            ['คนทั้งหมด', result.people.length + ' คน'],
            ['Man-days รวม', (md * result.people.length) + ' วัน'],
          ].map(([l, v]) => (
            <div key={l}>
              <div style={{ fontSize: 11, color: gDS.muted }}>{l}</div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{ borderTop: `1px dashed ${gDS.border}`, paddingTop: 10 }}>
          {result.people.map((p, i) => (
            <div key={i} style={{ fontSize: 13, color: gDS.muted, padding: '2px 0' }}>
              {i + 1}. {p.name}
            </div>
          ))}
        </div>
      </GCard>

      <Btn label="+ ลงทะเบียนชุดใหม่" v="accent" fw onClick={onDone} />
    </div>
  );
}

// ── Main contractor flow ──────────────────────────────────────────────────────
function ContractorFlow({ user, onLogout }) {
  const initData = () => ({ people: [newPerson()], company: '', job: '', zone: '', startDate: '', endDate: '' });
  const [step, setStep] = useStateF(1);
  const [data, setData] = useStateF(initData);
  const [result, setResult] = useStateF(null);

  const handleSubmit = () => {
    const md = calcMD(data.startDate, data.endDate);
    const now = new Date().toISOString().slice(0, 10);
    const batch = data.people.map(p => ({
      id: `r-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: p.name, idCard: p.idCard,
      company: data.company, job: data.job, zone: data.zone,
      startDate: data.startDate, endDate: data.endDate, manDays: md,
      createdAt: now, createdBy: user.credential, accident: false,
    }));
    addBatch(batch);
    setResult({ ...data, people: data.people });
    setStep('success');
  };

  const handleDone = () => { setData(initData()); setStep(1); setResult(null); };

  const logoutBtn = (
    <button onClick={onLogout} style={{
      background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff',
      borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontFamily: gDS.font, fontSize: 13, flexShrink: 0,
    }}>ออกจากระบบ</button>
  );

  const titles = { 1: 'ลงทะเบียนผู้รับเหมา', 2: 'รายละเอียดงาน', 3: 'ยืนยันข้อมูล', success: 'บันทึกสำเร็จ' };

  return (
    <div style={{ background: gDS.bg, minHeight: '100vh', fontFamily: gDS.font }}>
      <TopBar
        title={titles[step] || 'ลงทะเบียน'}
        sub={user.credential}
        onBack={step > 1 && step !== 'success' ? () => setStep(s => s - 1) : undefined}
        right={logoutBtn}
      />
      <div style={{ maxWidth: 520, margin: '0 auto' }}>
        {step === 1 && <Step1 data={data} setData={setData} onNext={() => setStep(2)} />}
        {step === 2 && <Step2 data={data} setData={setData} onNext={() => setStep(3)} onBack={() => setStep(1)} />}
        {step === 3 && <Step3 data={data} onSubmit={handleSubmit} onBack={() => setStep(2)} />}
        {step === 'success' && <SuccessScreen result={result} onDone={handleDone} />}
      </div>
    </div>
  );
}

window.ContractorFlow = ContractorFlow;
