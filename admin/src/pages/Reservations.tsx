import { useState, useMemo } from 'react';
import { mockTreatments } from '../mock/scheduleData';
import { useMasters, useScheduleReservations } from '../api/hooks';
import type { ScheduleReservation } from '../types';

const STAFF_COLORS: Record<string, string> = {
  // GAS APIのstaffIdとカラーのマッピングはAPIから取得したものを使う
  // フォールバック色
  default: '#f1f5f9',
};

type Period = 'morning' | 'afternoon';

function fmtSlot(date: string, timeSlot: string, durationSlots: number): string {
  // GASがSheetsの時刻をISO8601で返す場合 ("1899-12-30T09:30:00+09:00") に対応
  const startTime = timeSlot.includes('T') ? timeSlot.split('T')[1].slice(0, 5) : timeSlot;
  const [h, m] = startTime.split(':').map(Number);
  const endMin = h * 60 + m + durationSlots * 15;
  const eh = Math.floor(endMin / 60);
  const em = endMin % 60;
  const endTime = `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
  return `${date.replace(/-/g, '/')} ${startTime} – ${endTime}`;
}

export default function Reservations() {
  const [date,          setDate]          = useState('2026-03-30');
  const [period,        setPeriod]        = useState<Period>('morning');
  const [selectedStaff, setSelectedStaff] = useState<Set<string>>(new Set());
  const [query,         setQuery]         = useState('');

  const { data: masters }              = useMasters();
  const { data: apiReservations = [] } = useScheduleReservations(date);

  const scheduleStaff = masters?.staff ?? [];

  const staffColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    scheduleStaff.forEach(s => { map[s.id] = s.color; });
    return map;
  }, [scheduleStaff]);

  const machineNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    (masters?.machineAreas ?? []).forEach(area =>
      area.machines.forEach(m => { map[m.id] = m.name.replace(/\n/g, ' '); })
    );
    return map;
  }, [masters]);

  const toggleStaff = (id: string) => {
    setSelectedStaff(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const filtered = useMemo(() => apiReservations.filter((r: ScheduleReservation) => {
    if (r.date !== date) return false;
    const [h] = r.timeSlot.split(':').map(Number);
    if (period === 'morning'   && h >= 13) return false;
    if (period === 'afternoon' && h < 13)  return false;
    if (selectedStaff.size > 0 && !selectedStaff.has(r.staffId)) return false;
    if (query && !r.patientName.includes(query)) return false;
    return true;
  }), [apiReservations, date, period, selectedStaff, query]);

  const dateLabel = new Date(date + 'T00:00:00').toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
  });

  return (
    <div className="flex flex-col h-full">
      {/* ── Screen toolbar ── */}
      <div className="print:hidden flex items-center gap-3 px-5 py-3 border-b border-slate-100 bg-white shrink-0 flex-wrap">
        <h1 className="text-xl font-bold text-slate-800 mr-2">予約一覧</h1>

        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-indigo-400"
        />

        <div className="flex bg-slate-100 rounded-lg p-1 text-sm">
          {(['morning', 'afternoon'] as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-1.5 rounded-md font-medium transition-colors ${
                period === p
                  ? 'bg-white shadow-sm text-slate-800'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {p === 'morning' ? '午前 (9:00〜12:45)' : '午後 (13:00〜18:45)'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 ml-auto text-xs">
          <span className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full font-semibold">
            {filtered.length}件
          </span>
          <div className="flex gap-1">
            {scheduleStaff.map(s => (
              <button
                key={s.id}
                onClick={() => toggleStaff(s.id)}
                className={`text-xs px-2 py-1 rounded-full text-slate-700 font-medium transition-all ${
                  selectedStaff.size === 0 || selectedStaff.has(s.id) ? 'opacity-100' : 'opacity-30'
                }`}
                style={{ backgroundColor: s.color }}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => window.print()}
          className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-800 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          🖨️ 印刷
        </button>
      </div>

      {/* ── Print header ── */}
      <div className="hidden print:block mb-3">
        <div className="flex items-center justify-between border-b-2 border-slate-800 pb-2">
          <h1 className="text-base font-bold">{dateLabel} {period === 'morning' ? '午前' : '午後'} 予約一覧</h1>
          <p className="text-xs text-slate-500">{filtered.length}件</p>
        </div>
      </div>

      {/* ── Search ── */}
      <div className="print:hidden bg-white border-b border-slate-100 px-5 py-3">
        <input
          type="text"
          placeholder="患者名で検索"
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="w-full max-w-xs border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400 transition-colors"
        />
      </div>

      {/* ── Table ── */}
      <div className="flex-1 overflow-auto p-4 print:p-0">
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left">
                {['時間', '患者名', '施術', '機械', 'スタッフ', '備考'].map(h => (
                  <th key={h} className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r: ScheduleReservation) => {
                const treatment  = mockTreatments.find(t => t.id === r.treatmentId);
                const staffColor = staffColorMap[r.staffId] ?? STAFF_COLORS.default;
                const staffName  = scheduleStaff.find(s => s.id === r.staffId)?.name ?? r.staffId;
                return (
                  <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap font-mono text-xs">
                      {fmtSlot(r.date, r.timeSlot, r.durationSlots)}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800">{r.patientName}</td>
                    <td className="px-4 py-3">
                      {treatment ? (
                        <span
                          className="text-xs px-2 py-0.5 rounded-full text-slate-700"
                          style={{ backgroundColor: treatment.color }}
                        >
                          {treatment.shortName}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs">{r.treatmentId}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">
                      {machineNameMap[r.machineId] ?? r.machineId}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="text-xs px-2 py-1 rounded-full text-slate-700 font-medium"
                        style={{ backgroundColor: staffColor }}
                      >
                        {staffName}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs max-w-32 truncate">{r.note || '—'}</td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                    該当する予約がありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
