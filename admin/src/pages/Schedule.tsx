import { useState, useMemo } from 'react';
import type { ScheduleReservation } from '../types';
import { MORNING_SLOTS, AFTERNOON_SLOTS, MACHINE_AREAS, mockScheduleStaff, sortMachineAreas } from '../mock/scheduleData';
import ScheduleGrid from '../components/ScheduleGrid';
import ReservationModal from '../components/ReservationModal';
import ConfirmPendingModal from '../components/ConfirmPendingModal';
import HistoryPanel from '../components/HistoryPanel';
import { useMasters, useScheduleReservations, useUpsertScheduleReservation, useDeleteScheduleReservation } from '../api/hooks';

type Period = 'morning' | 'afternoon';

const DOW_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

function getWeekDays(dateStr: string): string[] {
  const d = new Date(dateStr + 'T00:00:00');
  const dow = d.getDay();
  const mon = new Date(d);
  mon.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(mon);
    day.setDate(mon.getDate() + i);
    return day.toLocaleDateString('sv');
  });
}

function shiftWeek(dateStr: string, weeks: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + weeks * 7);
  return d.toLocaleDateString('sv');
}

function shiftMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  return d.toLocaleDateString('sv');
}

function DayTab({
  day, isSelected, isToday, onClick,
}: {
  day: string; isSelected: boolean; isToday: boolean; onClick: () => void;
}) {
  const { data: rows = [] } = useScheduleReservations(day);
  const count = rows.filter(r => (r.date ?? '').substring(0, 10) === day).length;

  const d   = new Date(day + 'T00:00:00');
  const dow = d.getDay();
  const isSat = dow === 6;
  const isSun = dow === 0;
  const label = `${d.getMonth() + 1}/${d.getDate()}`;

  let base = 'border-2 rounded-xl flex flex-col items-center px-2 py-1.5 min-w-[44px] transition-all cursor-pointer select-none';

  if (isSelected && isToday) {
    base += ' bg-indigo-600 border-indigo-600 text-white shadow-md scale-105';
  } else if (isSelected) {
    base += ' bg-slate-700 border-slate-700 text-white shadow-md scale-105';
  } else if (isToday) {
    base += ' bg-indigo-50 border-indigo-400 text-indigo-700';
  } else {
    base += ' bg-white border-slate-200 hover:border-indigo-300 hover:shadow-sm text-slate-600';
  }

  const dowColor = isSelected
    ? 'text-white/70'
    : isSun ? 'text-red-500' : isSat ? 'text-blue-500' : 'text-slate-400';

  return (
    <button className={base} onClick={onClick}>
      <span className={`text-[10px] font-bold ${dowColor}`}>{DOW_LABELS[dow]}</span>
      <span className="text-sm font-bold leading-snug">{label}</span>
      <span className={`text-[9px] font-bold mt-0.5 h-[14px] flex items-center ${
        count > 0
          ? isSelected ? 'text-white/80' : 'text-indigo-600'
          : 'text-transparent'
      }`}>
        {count > 0 ? `${count}件` : '─'}
      </span>
    </button>
  );
}

export default function Schedule() {
  const today = new Date().toLocaleDateString('sv');

  const [date, setDate]               = useState(today);
  const [period, setPeriod]           = useState<Period>('morning');
  const [activeStaffId, setActiveStaffId] = useState('');
  const [toolbarExpanded, setToolbarExpanded] = useState(false);

  const [modalOpen,      setModalOpen]      = useState(false);
  const [editingR,       setEditingR]       = useState<ScheduleReservation | undefined>();
  const [clickedMachine, setClickedMachine] = useState<string | undefined>();
  const [clickedSlot,    setClickedSlot]    = useState<string | undefined>();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingR,    setPendingR]    = useState<ScheduleReservation | undefined>();

  const [historyOpen, setHistoryOpen] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const weekDays = useMemo(() => getWeekDays(date), [date]);

  const { data: masters }              = useMasters();
  const { data: apiReservations = [] } = useScheduleReservations(date);
  const upsert = useUpsertScheduleReservation();
  const del    = useDeleteScheduleReservation();

  const mutationOpts = {
    onError: (err: Error) => setError(err.message),
    onSuccess: () => setError(null),
  };

  const machineAreas  = sortMachineAreas(masters?.machineAreas ?? MACHINE_AREAS);
  const scheduleStaff = masters?.staff ?? mockScheduleStaff;
  const allMachines   = machineAreas.flatMap(a => a.machines);
  const timeSlots     = period === 'morning' ? MORNING_SLOTS : AFTERNOON_SLOTS;

  const dayReservations = useMemo(
    () => apiReservations.filter(r => (r.date ?? '').substring(0, 10) === date),
    [apiReservations, date],
  );

  const openNew = (machineId: string, timeSlot: string) => {
    setEditingR(undefined);
    setClickedMachine(machineId);
    setClickedSlot(timeSlot);
    setModalOpen(true);
  };

  const openEdit = (r: ScheduleReservation) => {
    if (r.status === 'pending') {
      setPendingR(r);
      setConfirmOpen(true);
      return;
    }
    setEditingR(r);
    setClickedMachine(r.machineId);
    setClickedSlot(r.timeSlot);
    setModalOpen(true);
  };

  const handleSave = (data: Omit<ScheduleReservation, 'id'> & { id?: string }) => {
    setError(null);
    upsert.mutate({ ...data, date }, mutationOpts);
  };

  const handleDelete = (id: string) => {
    setError(null);
    del.mutate({ id, date }, mutationOpts);
  };

  const weekLabel = (() => {
    const s = new Date(weekDays[0] + 'T00:00:00');
    const e = new Date(weekDays[6] + 'T00:00:00');
    return `${s.getMonth() + 1}/${s.getDate()}(月) 〜 ${e.getMonth() + 1}/${e.getDate()}(日)`;
  })();

  const dateLabel   = new Date(date + 'T00:00:00').toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
  });
  const periodLabel = period === 'morning' ? '午前' : '午後';

  return (
    <div className="flex flex-col h-full">

      {/* ── ツールバー ── */}
      <div className="print:hidden bg-white border-b border-slate-100 shrink-0">

        {/* ── モバイル用コンパクトバー ── */}
        <div className="md:hidden">
          {/* 主要操作行 */}
          <div className="flex items-center gap-1.5 px-2 py-2">
            {/* 週ナビ */}
            <button onClick={() => setDate(shiftWeek(date, -1))} className="p-1.5 rounded-lg bg-slate-100 text-slate-600 text-xs">◀</button>
            <button onClick={() => setDate(shiftWeek(date, 1))}  className="p-1.5 rounded-lg bg-slate-100 text-slate-600 text-xs">▶</button>
            <button
              onClick={() => setDate(today)}
              className={`text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors ${
                date === today ? 'bg-indigo-600 text-white' : 'bg-indigo-50 text-indigo-600'
              }`}
            >今日</button>

            <div className="flex-1" />

            {/* 午前/午後トグル */}
            <div className="flex bg-slate-100 rounded-lg p-0.5 text-xs">
              {(['morning', 'afternoon'] as Period[]).map(p => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors whitespace-nowrap ${
                    period === p ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'
                  }`}
                >
                  {p === 'morning' ? '午前' : '午後'}
                </button>
              ))}
            </div>

            {/* 件数 */}
            <span className="bg-indigo-50 text-indigo-700 px-2 py-1 rounded-full font-semibold text-xs whitespace-nowrap">
              {dayReservations.length}件
            </span>

            {/* 変更履歴ボタン */}
            <button
              onClick={() => setHistoryOpen(true)}
              className="p-1.5 rounded-lg bg-slate-100 text-slate-500 text-xs"
              title="変更履歴"
            >🕘</button>

            {/* 詳細展開ボタン */}
            <button
              onClick={() => setToolbarExpanded(v => !v)}
              className="p-1.5 rounded-lg bg-slate-100 text-slate-500 text-xs"
            >
              {toolbarExpanded ? '▲' : '▼'}
            </button>
          </div>

          {/* 展開エリア（担当・月ジャンプ） */}
          {toolbarExpanded && (
            <div className="px-2 pb-2 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2">
              <span className="text-xs text-slate-400 font-medium">担当</span>
              {scheduleStaff.map(s => (
                <button
                  key={s.id}
                  onClick={() => setActiveStaffId(prev => prev === s.id ? '' : s.id)}
                  className={`text-xs px-2.5 py-1 rounded-full font-medium transition-all border-2 ${
                    activeStaffId === s.id
                      ? 'border-slate-500 text-slate-800 shadow-sm'
                      : 'border-transparent text-slate-500 bg-slate-100'
                  }`}
                  style={activeStaffId === s.id ? { backgroundColor: s.color } : {}}
                >
                  {s.name}
                </button>
              ))}
              <div className="w-px h-4 bg-slate-200" />
              {[1, 2].map(n => {
                const target = shiftMonths(today, n);
                const label  = new Date(target + 'T00:00:00').toLocaleDateString('ja-JP', { month: 'long' });
                return (
                  <button key={n} onClick={() => setDate(target)}
                    className="text-xs px-2.5 py-1 rounded-lg font-medium bg-slate-100 text-slate-600 whitespace-nowrap">
                    {label}
                  </button>
                );
              })}
            </div>
          )}

          {/* 日付タブ（横スクロール） */}
          <div className="flex gap-1.5 px-2 pb-2 overflow-x-auto">
            {weekDays.map(day => (
              <DayTab key={day} day={day} isSelected={day === date} isToday={day === today} onClick={() => setDate(day)} />
            ))}
          </div>
        </div>

        {/* ── PC用ツールバー（既存） ── */}
        <div className="hidden md:block">
          {/* 行1 */}
          <div className="flex items-center gap-2 px-5 pt-3 pb-2 flex-wrap">
            <h1 className="text-xl font-bold text-slate-800 mr-1">予約入力</h1>
            <button onClick={() => setDate(shiftWeek(date, -1))} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors text-sm">◀</button>
            <span className="text-sm text-slate-600 font-medium min-w-[172px] text-center">{weekLabel}</span>
            <button onClick={() => setDate(shiftWeek(date, 1))}  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors text-sm">▶</button>
            <button
              onClick={() => setDate(today)}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                date === today ? 'bg-indigo-600 text-white' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'
              }`}
            >今日</button>

            <div className="w-px h-5 bg-slate-200" />

            {[1, 2].map(n => {
              const target = shiftMonths(today, n);
              const label  = new Date(target + 'T00:00:00').toLocaleDateString('ja-JP', { month: 'long' });
              const active = shiftMonths(date, 0).substring(0, 7) === target.substring(0, 7);
              return (
                <button key={n} onClick={() => setDate(target)}
                  className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap ${
                    active ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >{label}</button>
              );
            })}

            <div className="flex-1" />

            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-400 font-medium whitespace-nowrap">担当</span>
              {scheduleStaff.map(s => (
                <button key={s.id}
                  onClick={() => setActiveStaffId(prev => prev === s.id ? '' : s.id)}
                  className={`text-xs px-2.5 py-1 rounded-full font-medium transition-all border-2 ${
                    activeStaffId === s.id ? 'border-slate-500 text-slate-800 shadow-sm scale-105' : 'border-transparent text-slate-500 hover:border-slate-300 bg-slate-100'
                  }`}
                  style={activeStaffId === s.id ? { backgroundColor: s.color } : {}}
                >{s.name}</button>
              ))}
            </div>

            <button onClick={() => setHistoryOpen(true)}
              className="flex items-center gap-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              🕘 変更履歴
            </button>

            <button onClick={() => window.print()}
              className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-800 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              🖨️ 印刷
            </button>
          </div>

          {/* 行2 */}
          <div className="flex items-end gap-3 px-5 pb-3 flex-wrap">
            <div className="flex gap-1.5">
              {weekDays.map(day => (
                <DayTab key={day} day={day} isSelected={day === date} isToday={day === today} onClick={() => setDate(day)} />
              ))}
            </div>
            <div className="flex-1" />
            <div className="flex items-center gap-2 self-center">
              <div className="flex bg-slate-100 rounded-lg p-1 text-sm">
                {(['morning', 'afternoon'] as Period[]).map(p => (
                  <button key={p} onClick={() => setPeriod(p)}
                    className={`px-4 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap ${
                      period === p ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >{p === 'morning' ? '午前 9:00〜12:45' : '午後 13:00〜18:45'}</button>
                ))}
              </div>
              <span className="bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-full font-semibold text-xs whitespace-nowrap">
                {dayReservations.length}件
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── エラーバナー ── */}
      {error && (
        <div className="bg-red-50 border-b border-red-200 px-5 py-2 flex items-center gap-2 text-sm text-red-700 print:hidden">
          <span className="font-medium">保存エラー:</span> {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">×</button>
        </div>
      )}

      {/* ── 印刷ヘッダー ── */}
      <div className="hidden print:block mb-3">
        <div className="flex items-center justify-between border-b-2 border-slate-800 pb-2 mb-1">
          <h1 className="text-base font-bold">{dateLabel} {periodLabel}の部</h1>
          <p className="text-xs text-slate-500">スタッフ予約表</p>
        </div>
        <div className="flex gap-3 text-xs text-slate-600">
          {scheduleStaff.map(s => (
            <span key={s.id} className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: s.color }} />
              {s.name}
            </span>
          ))}
        </div>
      </div>

      {/* ── グリッド ── */}
      <div className="flex-1 overflow-hidden p-4 md:p-4 p-1 print:p-0 print:overflow-visible">
        <ScheduleGrid
          machineAreas={machineAreas}
          staff={scheduleStaff}
          timeSlots={timeSlots}
          reservations={dayReservations}
          onCellClick={openNew}
          onReservationClick={openEdit}
        />
      </div>

      <ReservationModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
        onDelete={handleDelete}
        initialMachineId={clickedMachine}
        initialTimeSlot={clickedSlot}
        initialStaffId={activeStaffId}
        reservation={editingR}
        date={date}
        machines={allMachines}
        staff={scheduleStaff}
      />

      {pendingR && (
        <ConfirmPendingModal
          open={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          reservation={pendingR}
          date={date}
          machines={allMachines}
          staff={scheduleStaff}
        />
      )}

      <HistoryPanel
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        machines={allMachines}
        staff={scheduleStaff}
      />
    </div>
  );
}
