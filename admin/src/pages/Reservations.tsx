import { useState, useMemo } from 'react';
import { mockTreatments } from '../mock/scheduleData';
import { useMasters, useScheduleReservationsRange } from '../api/hooks';
import type { ScheduleReservation } from '../types';

type RangeKey = 'today' | 'week' | 'month' | 'nextMonth';

function getToday(): string {
  return new Date().toLocaleDateString('sv');
}

function getWeekDates(base: string): string[] {
  const d = new Date(base + 'T00:00:00');
  const dow = d.getDay();
  const mon = new Date(d);
  mon.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(mon);
    day.setDate(mon.getDate() + i);
    return day.toLocaleDateString('sv');
  });
}

function getMonthDates(base: string): string[] {
  const d = new Date(base + 'T00:00:00');
  const year = d.getFullYear();
  const month = d.getMonth();
  const days = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: days }, (_, i) => {
    const day = new Date(year, month, i + 1);
    return day.toLocaleDateString('sv');
  });
}

function getNextMonthDates(base: string): string[] {
  const d = new Date(base + 'T00:00:00');
  d.setDate(1);
  d.setMonth(d.getMonth() + 1);
  return getMonthDates(d.toLocaleDateString('sv'));
}

function buildDates(key: RangeKey, today: string): string[] {
  if (key === 'today')     return [today];
  if (key === 'week')      return getWeekDates(today);
  if (key === 'month')     return getMonthDates(today);
  if (key === 'nextMonth') return getNextMonthDates(today);
  return [today];
}

function rangeLabel(key: RangeKey, today: string): string {
  if (key === 'today') return '本日';
  if (key === 'week') {
    const days = getWeekDates(today);
    const s = new Date(days[0] + 'T00:00:00');
    const e = new Date(days[6] + 'T00:00:00');
    return `${s.getMonth()+1}/${s.getDate()}〜${e.getMonth()+1}/${e.getDate()}`;
  }
  if (key === 'month') {
    const d = new Date(today + 'T00:00:00');
    return `${d.getMonth()+1}月`;
  }
  if (key === 'nextMonth') {
    const d = new Date(today + 'T00:00:00');
    return `${d.getMonth()+2}月`;
  }
  return '';
}

function fmtTime(timeSlot: string, durationSlots: number): string {
  const startTime = timeSlot.includes('T') ? timeSlot.split('T')[1].slice(0, 5) : timeSlot;
  const [h, m] = startTime.split(':').map(Number);
  const endMin = h * 60 + m + durationSlots * 15;
  const eh = Math.floor(endMin / 60);
  const em = endMin % 60;
  return `${startTime}–${String(eh).padStart(2,'0')}:${String(em).padStart(2,'0')}`;
}

const RANGE_BUTTONS: { key: RangeKey; label: string }[] = [
  { key: 'today',     label: '本日' },
  { key: 'week',      label: '今週' },
  { key: 'month',     label: '今月' },
  { key: 'nextMonth', label: '来月' },
];

export default function Reservations() {
  const today = getToday();
  const [rangeKey,      setRangeKey]      = useState<RangeKey>('today');
  const [selectedDate,  setSelectedDate]  = useState<string | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<Set<string>>(new Set());
  const [query,         setQuery]         = useState('');

  const handleRangeKey = (key: RangeKey) => {
    setRangeKey(key);
    setSelectedDate(null);
  };

  const { data: masters } = useMasters();
  const dates = useMemo(() => buildDates(rangeKey, today), [rangeKey, today]);
  const { data: apiReservations, isLoading } = useScheduleReservationsRange(dates);

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

  const filtered = useMemo(() => {
    return [...apiReservations]
      .filter((r: ScheduleReservation) => {
        const rDate = (r.date ?? '').substring(0, 10);
        if (!dates.includes(rDate)) return false;
        if (selectedDate && rDate !== selectedDate) return false;
        if (selectedStaff.size > 0 && !selectedStaff.has(r.staffId)) return false;
        if (query && !r.patientName.includes(query)) return false;
        return true;
      })
      .sort((a, b) => {
        const da = (a.date ?? '') + a.timeSlot;
        const db = (b.date ?? '') + b.timeSlot;
        return da < db ? -1 : da > db ? 1 : 0;
      });
  }, [apiReservations, dates, selectedDate, selectedStaff, query]);

  // 予約がある日付一覧（今月/来月表示時の日付タブ用）
  const datesWithReservations = useMemo(() => {
    if (rangeKey !== 'month' && rangeKey !== 'nextMonth') return [];
    const set = new Set<string>();
    apiReservations.forEach(r => {
      const d = (r.date ?? '').substring(0, 10);
      if (dates.includes(d)) set.add(d);
    });
    return [...set].sort();
  }, [apiReservations, dates, rangeKey]);

  const label = rangeLabel(rangeKey, today);

  return (
    <div className="flex flex-col h-full">

      {/* ── ツールバー ── */}
      <div className="print:hidden bg-white border-b border-slate-100 shrink-0">
        <div className="flex items-center gap-2 px-3 md:px-5 py-3 flex-wrap">
          <h1 className="text-lg md:text-xl font-bold text-slate-800">予約一覧</h1>

          {/* 期間ボタン */}
          <div className="flex bg-slate-100 rounded-xl p-1 gap-0.5">
            {RANGE_BUTTONS.map(({ key, label: btnLabel }) => (
              <button
                key={key}
                onClick={() => handleRangeKey(key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                  rangeKey === key
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {btnLabel}
              </button>
            ))}
          </div>

          <span className="text-xs text-slate-400 font-medium">{label}</span>

          {/* 件数 */}
          <span className="bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-full font-semibold text-xs">
            {isLoading ? '…' : `${filtered.length}件`}
          </span>

          <div className="flex-1" />

          {/* スタッフフィルタ */}
          <div className="flex gap-1 flex-wrap">
            {scheduleStaff.map(s => (
              <button
                key={s.id}
                onClick={() => toggleStaff(s.id)}
                className={`text-xs px-2.5 py-1 rounded-full text-slate-700 font-medium transition-all ${
                  selectedStaff.size === 0 || selectedStaff.has(s.id) ? 'opacity-100' : 'opacity-30'
                }`}
                style={{ backgroundColor: s.color }}
              >
                {s.name}
              </button>
            ))}
          </div>

          <button
            onClick={() => window.print()}
            className="hidden md:flex items-center gap-1.5 bg-slate-700 hover:bg-slate-800 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            🖨️ 印刷
          </button>
        </div>

        {/* 検索 */}
        <div className="px-3 md:px-5 pb-2">
          <input
            type="text"
            placeholder="患者名で検索"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full max-w-xs border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-indigo-400 transition-colors"
          />
        </div>

        {/* 日付タブ（今月/来月のみ） */}
        {datesWithReservations.length > 0 && (
          <div className="flex gap-1.5 px-3 md:px-5 pb-2 overflow-x-auto">
            <button
              onClick={() => setSelectedDate(null)}
              className={`shrink-0 text-xs px-3 py-1 rounded-full font-medium transition-colors border ${
                selectedDate === null
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300'
              }`}
            >全て</button>
            {datesWithReservations.map(d => {
              const dt  = new Date(d + 'T00:00:00');
              const dow = ['日','月','火','水','木','金','土'][dt.getDay()];
              const lbl = `${dt.getMonth()+1}/${dt.getDate()}(${dow})`;
              const isSelected = selectedDate === d;
              return (
                <button
                  key={d}
                  onClick={() => setSelectedDate(prev => prev === d ? null : d)}
                  className={`shrink-0 text-xs px-3 py-1 rounded-full font-medium transition-colors border ${
                    isSelected
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300'
                  }`}
                >{lbl}</button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 印刷ヘッダー ── */}
      <div className="hidden print:block mb-3">
        <div className="flex items-center justify-between border-b-2 border-slate-800 pb-2">
          <h1 className="text-base font-bold">予約一覧 {label}</h1>
          <p className="text-xs text-slate-500">{filtered.length}件</p>
        </div>
      </div>

      {/* ── リスト（モバイル）／テーブル（PC）── */}
      <div className="flex-1 overflow-auto p-2 md:p-4 print:p-0">

        {isLoading && (
          <p className="text-center text-slate-400 py-12 text-sm">読み込み中…</p>
        )}

        {/* モバイル：カードリスト */}
        {!isLoading && (
          <div className="md:hidden space-y-2">
            {filtered.length === 0 && (
              <p className="text-center text-slate-400 py-12 text-sm">該当する予約がありません</p>
            )}
            {filtered.map((r: ScheduleReservation) => {
              const treatment   = mockTreatments.find(t => t.id === r.treatmentId);
              const staffColor  = staffColorMap[r.staffId] ?? '#f1f5f9';
              const staffName   = scheduleStaff.find(s => s.id === r.staffId)?.name ?? r.staffId;
              const machineName = machineNameMap[r.machineId] ?? r.machineId;
              const dateStr     = new Date(r.date + 'T00:00:00').toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' });
              return (
                <div key={r.id} className="bg-white rounded-xl border border-slate-100 px-4 py-3 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-slate-800 text-sm">{r.patientName || '（名前なし）'}</div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {rangeKey !== 'today' && <span className="mr-1">{dateStr}</span>}
                        <span className="font-mono">{fmtTime(r.timeSlot, r.durationSlots)}</span>
                      </div>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full text-slate-700 font-medium shrink-0"
                      style={{ backgroundColor: staffColor }}>{staffName}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {treatment && (
                      <span className="text-xs px-2 py-0.5 rounded-full text-slate-700"
                        style={{ backgroundColor: treatment.color }}>{treatment.shortName}</span>
                    )}
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">{machineName}</span>
                    {r.note && <span className="text-xs text-slate-400">{r.note}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* PC：テーブル */}
        {!isLoading && (
          <div className="hidden md:block print:block bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden print:shadow-none print:border-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left">
                  {(rangeKey !== 'today' ? ['日付', '時間', '患者名', '施術', '機械', 'スタッフ', '備考'] : ['時間', '患者名', '施術', '機械', 'スタッフ', '備考']).map(h => (
                    <th key={h} className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r: ScheduleReservation) => {
                  const treatment  = mockTreatments.find(t => t.id === r.treatmentId);
                  const staffColor = staffColorMap[r.staffId] ?? '#f1f5f9';
                  const staffName  = scheduleStaff.find(s => s.id === r.staffId)?.name ?? r.staffId;
                  const dateStr    = new Date(r.date + 'T00:00:00').toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' });
                  return (
                    <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                      {rangeKey !== 'today' && (
                        <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">{dateStr}</td>
                      )}
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap font-mono text-xs">
                        {fmtTime(r.timeSlot, r.durationSlots)}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-800">{r.patientName}</td>
                      <td className="px-4 py-3">
                        {treatment ? (
                          <span className="text-xs px-2 py-0.5 rounded-full text-slate-700"
                            style={{ backgroundColor: treatment.color }}>{treatment.shortName}</span>
                        ) : (
                          <span className="text-slate-400 text-xs">{r.treatmentId}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{machineNameMap[r.machineId] ?? r.machineId}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-1 rounded-full text-slate-700 font-medium"
                          style={{ backgroundColor: staffColor }}>{staffName}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs max-w-32 truncate">{r.note || '—'}</td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={rangeKey !== 'today' ? 7 : 6} className="px-4 py-12 text-center text-slate-400">
                      該当する予約がありません
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
