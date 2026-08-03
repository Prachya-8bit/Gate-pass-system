'use client';

import React, { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { gDS } from '@/lib/constants';
import { Btn, DatePick, GCard } from '@/components/atoms';
import type { RecordRow } from '@/components/AdminFlow';

function groupByManDays(records: RecordRow[], keyOf: (r: RecordRow) => string) {
  const map = new Map<string, number>();
  for (const r of records) {
    const key = keyOf(r);
    map.set(key, (map.get(key) || 0) + r.manDays);
  }
  return Array.from(map.entries())
    .map(([name, manDays]) => ({ name, manDays }))
    .sort((a, b) => b.manDays - a.manDays);
}

function ChartBlock({
  title,
  data,
  color,
}: {
  title: string;
  data: { name: string; manDays: number }[];
  color: string;
}) {
  return (
    <div style={{ flex: 1, minWidth: 260 }}>
      <h4 style={{ margin: '0 0 10px', fontSize: 13, color: gDS.text, fontWeight: 600 }}>
        {title}
      </h4>
      {data.length === 0 ? (
        <div style={{ fontSize: 13, color: gDS.muted, padding: '24px 0', textAlign: 'center' }}>
          ไม่มีข้อมูล
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} margin={{ top: 4, right: 8, left: -8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gDS.border} vertical={false} />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 11, fill: gDS.muted }}
              interval={0}
              angle={-20}
              textAnchor="end"
              height={50}
            />
            <YAxis tick={{ fontSize: 11, fill: gDS.muted }} allowDecimals={false} />
            <Tooltip
              formatter={(value) => [`${value} วัน`, 'Man-day']}
              contentStyle={{
                fontSize: 12,
                borderRadius: gDS.r.s,
                border: `1px solid ${gDS.border}`,
              }}
            />
            <Bar dataKey="manDays" fill={color} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export default function ManagerSummary({ records }: { records: RecordRow[] }) {
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const dateFiltered = useMemo(() => {
    return records.filter((r) => {
      if (fromDate && r.startDate < fromDate) return false;
      if (toDate && r.startDate > toDate) return false;
      return true;
    });
  }, [records, fromDate, toDate]);

  const byCompany = useMemo(
    () => groupByManDays(dateFiltered, (r) => r.company),
    [dateFiltered],
  );
  const byProject = useMemo(
    () => groupByManDays(dateFiltered, (r) => r.job || 'ไม่ระบุ'),
    [dateFiltered],
  );
  const byMonth = useMemo(() => {
    const grouped = groupByManDays(dateFiltered, (r) => r.startDate.slice(0, 7));
    return grouped.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  }, [dateFiltered]);

  return (
    <GCard style={{ marginBottom: 16 }}>
      <h3 style={{ margin: '0 0 12px', fontSize: 16, color: gDS.text }}>
        สรุป Man-day ตามช่วงเวลา
      </h3>
      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'flex-end',
          flexWrap: 'wrap',
          marginBottom: 16,
        }}
      >
        <div style={{ width: 180 }}>
          <DatePick label="ตั้งแต่วันที่" value={fromDate} onChange={setFromDate} max={toDate || undefined} />
        </div>
        <div style={{ width: 180 }}>
          <DatePick label="ถึงวันที่" value={toDate} onChange={setToDate} min={fromDate || undefined} />
        </div>
        {(fromDate || toDate) && (
          <Btn
            variant="ghost"
            style={{ marginBottom: 14 }}
            onClick={() => {
              setFromDate('');
              setToDate('');
            }}
          >
            ล้างตัวกรอง
          </Btn>
        )}
      </div>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <ChartBlock title="ตามบริษัท" data={byCompany} color={gDS.primary} />
        <ChartBlock title="ตามโครงการ" data={byProject} color={gDS.accent} />
        <ChartBlock title="ตามเดือน" data={byMonth} color="#2563eb" />
      </div>
    </GCard>
  );
}
