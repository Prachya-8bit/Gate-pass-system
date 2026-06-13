/* gp-admin.jsx — Admin dashboard with company stats and CSV/Excel export */

const { useState: useStateAD, useEffect: useEffectAD } = React;

// ── Export helpers ────────────────────────────────────────────────────────────
function doCSV(records, filename) {
  const hdr = ['ชื่อ-นามสกุล', 'เลขบัตรประชาชน', 'บริษัท', 'งานที่ทำ', 'Zone', 'วันเข้า', 'วันออก', 'Man-days', 'วันที่บันทึก', 'อุบัติเหตุ'];
  const rows = records.map(r => [
    r.name, r.idCard, r.company, r.job || '', r.zone || '',
    r.startDate, r.endDate, r.manDays,
    r.createdAt, r.accident ? 'มี' : 'ไม่มี',
  ]);
  const csv = [hdr, ...rows]
    .map(row => row.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename || 'gate-pass-records.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function doExcel(records, filename) {
  if (!window.XLSX) { alert('ไม่พบ XLSX library — ลอง Export CSV แทนได้ครับ'); return; }
  const hdr = ['ชื่อ-นามสกุล', 'เลขบัตรประชาชน', 'บริษัท', 'งานที่ทำ', 'Zone', 'วันเข้า', 'วันออก', 'Man-days', 'วันที่บันทึก', 'อุบัติเหตุ'];
  const rows = records.map(r => [
    r.name, r.idCard, r.company, r.job || '', r.zone || '',
    r.startDate, r.endDate, r.manDays,
    r.createdAt, r.accident ? 'มี' : 'ไม่มี',
  ]);
  const ws = XLSX.utils.aoa_to_sheet([hdr, ...rows]);
  ws['!cols'] = [22, 16, 26, 18, 10, 12, 12, 10, 12, 10].map(w => ({ wch: w }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Gate Pass Records');
  XLSX.writeFile(wb, filename || 'gate-pass-records.xlsx');
}

// ── Company detail panel ──────────────────────────────────────────────────────
function CompanyRows({ company, records }) {
  const rows = records.filter(r => r.company === company);
  if (!rows.length) return null;
  return (
    <div style={{ marginTop: 8, border: `1px solid ${gDS.border}`, borderRadius: gDS.r.s, overflow: 'hidden' }}>
      <div style={{
        display: 'grid', gridTemplateColumns: '2fr 1.4fr 0.8fr 0.8fr 0.8fr',
        padding: '6px 12px', background: '#f8fafc',
        borderBottom: `1px solid ${gDS.border}`, gap: 4,
      }}>
        {['ชื่อ', 'เลขบัตร', 'วันเข้า', 'M-D', 'สถานะ'].map(h => (
          <div key={h} style={{ fontSize: 11, fontWeight: 600, color: gDS.muted }}>{h}</div>
        ))}
      </div>
      {rows.map((r, i) => (
        <div key={r.id} style={{
          display: 'grid', gridTemplateColumns: '2fr 1.4fr 0.8fr 0.8fr 0.8fr',
          padding: '8px 12px', background: i % 2 === 0 ? '#fff' : '#fafafa',
          borderBottom: i < rows.length - 1 ? `1px solid #f0f4f8` : 'none', gap: 4,
          alignItems: 'center',
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: gDS.text }}>{r.name}</div>
          <div style={{ fontSize: 11, color: gDS.muted }}>{r.idCard.slice(0, 3)}·····{r.idCard.slice(-3)}</div>
          <div style={{ fontSize: 11, color: gDS.muted }}>{r.startDate}</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1d4ed8' }}>{r.manDays}</div>
          <div><Badge c={r.accident ? 'red' : 'green'}>{r.accident ? '⚠' : '✓'}</Badge></div>
        </div>
      ))}
    </div>
  );
}

// ── Main admin dashboard ──────────────────────────────────────────────────────
function AdminFlow({ user, onLogout }) {
  const [records, setRecords] = useStateAD(getRecords);
  const [filterCo, setFilterCo] = useStateAD('');
  const [expanded, setExpanded] = useStateAD(null);

  // Refresh when window regains focus (contractor may have submitted)
  useEffectAD(() => {
    const refresh = () => setRecords(getRecords());
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, []);

  const filtered = filterCo ? records.filter(r => r.company === filterCo) : records;

  // Aggregate per company
  const coMap = {};
  records.forEach(r => {
    if (!coMap[r.company]) coMap[r.company] = { name: r.company, md: 0, workers: new Set(), acc: 0 };
    coMap[r.company].md += r.manDays || 0;
    coMap[r.company].workers.add(r.idCard);
    if (r.accident) coMap[r.company].acc++;
  });
  const coList = Object.values(coMap).sort((a, b) => b.md - a.md);
  const maxMD = coList.length ? coList[0].md : 1;

  const totalMD      = records.reduce((s, r) => s + (r.manDays || 0), 0);
  const totalWorkers = new Set(records.map(r => r.idCard)).size;
  const totalAcc     = records.filter(r => r.accident).length;
  const safeDays     = (() => {
    if (!records.length) return 0;
    const latest = records.reduce((m, r) => r.createdAt > m ? r.createdAt : m, '');
    const d = Math.ceil((new Date() - new Date(latest)) / 86400000);
    return Math.max(0, d);
  })();

  const today = new Date().toISOString().slice(0, 10);
  const fname  = `gate-pass-${today}`;

  const logoutBtn = (
    <button onClick={onLogout} style={{
      background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff',
      borderRadius: 6, padding: '5px 12px', cursor: 'pointer',
      fontFamily: gDS.font, fontSize: 13, flexShrink: 0,
    }}>ออกจากระบบ</button>
  );

  return (
    <div style={{ background: gDS.bg, minHeight: '100vh', fontFamily: gDS.font }}>
      <TopBar title="Admin Dashboard" sub={'Man-day Safety Tracker · ' + user.credential} right={logoutBtn} />

      <div style={{ maxWidth: 860, margin: '0 auto', padding: 16 }}>

        {/* KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
          {[
            [totalMD.toLocaleString(), 'Man-days รวม',    '#1d4ed8', false],
            [totalWorkers.toString(),  'ผู้รับเหมา',       gDS.primary, false],
            [safeDays + ' วัน',        'ปลอดอุบัติเหตุ',  gDS.ok,     false],
            [totalAcc.toString(),      'อุบัติเหตุ',       totalAcc > 0 ? gDS.err : gDS.ok, totalAcc > 0],
          ].map(([n, l, c, warn]) => (
            <GCard key={l} style={{ margin: 0, textAlign: 'center', padding: '14px 8px', border: warn ? `1.5px solid #fecaca` : undefined }}>
              <div style={{ fontSize: 26, fontWeight: 800, color: c, lineHeight: 1.1 }}>{n}</div>
              <div style={{ fontSize: 11, color: gDS.muted, marginTop: 4, lineHeight: 1.3 }}>{l}</div>
            </GCard>
          ))}
        </div>

        {/* Company breakdown */}
        <GCard>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Man-day แยกตามบริษัท</div>
          {coList.length === 0 && <div style={{ color: gDS.muted, fontSize: 13, padding: '10px 0' }}>ยังไม่มีข้อมูล</div>}
          {coList.map(c => (
            <div key={c.name} style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <button onClick={() => setExpanded(expanded === c.name ? null : c.name)} style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontFamily: gDS.font, fontSize: 13, fontWeight: 600,
                  color: gDS.text, padding: 0, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 5,
                }}>
                  <span style={{ color: gDS.muted, fontSize: 11 }}>{expanded === c.name ? '▼' : '▶'}</span>
                  {c.name}
                  <span style={{ fontSize: 11, color: gDS.muted, fontWeight: 400 }}>({c.workers.size} คน)</span>
                </button>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: 13, color: gDS.muted, fontWeight: 700 }}>{c.md} MD</span>
                  <Badge c={c.acc > 0 ? 'red' : 'green'}>{c.acc > 0 ? `⚠ ${c.acc} อุบัติเหตุ` : '✓ ปลอดภัย'}</Badge>
                </div>
              </div>
              {/* Bar */}
              <div style={{ height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${(c.md / maxMD) * 100}%`,
                  background: c.acc > 0 ? gDS.err : '#1d4ed8', borderRadius: 4,
                  transition: 'width 0.5s ease',
                }} />
              </div>
              {expanded === c.name && <CompanyRows company={c.name} records={records} />}
            </div>
          ))}
        </GCard>

        {/* Records table */}
        <GCard>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>รายการทั้งหมด</div>
              <div style={{ fontSize: 12, color: gDS.muted, marginTop: 2 }}>{filtered.length} รายการ{filterCo ? ` · ${filterCo}` : ''}</div>
            </div>
            <SelBox
              val={filterCo} set={setFilterCo} mb={0}
              opts={[{ v: '', l: 'ทุกบริษัท' }, ...COMPANIES.slice(1).map(c => ({ v: c, l: c }))]}
            />
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${gDS.primary}` }}>
                  {['ชื่อ-นามสกุล', 'บริษัท', 'งานที่ทำ', 'วันเข้า', 'วันออก', 'Man-day', 'สถานะ'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '7px 8px', fontWeight: 600, color: gDS.text, whiteSpace: 'nowrap', fontFamily: gDS.font }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.slice().reverse().map((r, i) => (
                  <tr key={r.id} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc', borderBottom: `1px solid #f0f4f8` }}>
                    <td style={{ padding: '8px', fontWeight: 600 }}>{r.name}</td>
                    <td style={{ padding: '8px', color: gDS.muted, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.company}</td>
                    <td style={{ padding: '8px', color: gDS.muted }}>{r.job}</td>
                    <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>{r.startDate}</td>
                    <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>{r.endDate}</td>
                    <td style={{ padding: '8px', fontWeight: 700, color: '#1d4ed8', textAlign: 'center' }}>{r.manDays}</td>
                    <td style={{ padding: '8px' }}><Badge c={r.accident ? 'red' : 'green'}>{r.accident ? '⚠ มี' : '✓ ปลอด'}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div style={{ textAlign: 'center', color: gDS.muted, padding: '24px 0', fontSize: 13 }}>ไม่มีข้อมูล</div>
            )}
          </div>
        </GCard>

        {/* Export buttons */}
        <div style={{ display: 'flex', gap: 10 }}>
          <Btn label="⬇ Export CSV" v="secondary" fw onClick={() => doCSV(filtered, fname + '.csv')} />
          <Btn label="⬇ Export Excel (.xlsx)" fw onClick={() => doExcel(filtered, fname + '.xlsx')} />
        </div>
        <div style={{ marginTop: 8, fontSize: 12, color: gDS.muted, textAlign: 'center' }}>
          Export {filtered.length} รายการ{filterCo ? ` (${filterCo})` : ' (ทั้งหมด)'}
        </div>

      </div>
    </div>
  );
}

window.AdminFlow = AdminFlow;
