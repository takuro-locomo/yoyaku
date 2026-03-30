import { useState, useMemo } from 'react';
import type { ScheduleReservation } from '../types';
import { MORNING_SLOTS, AFTERNOON_SLOTS, MACHINE_AREAS, mockScheduleStaff } from '../mock/scheduleData';
import ScheduleGrid from '../components/ScheduleGrid';
import ReservationModal from '../components/ReservationModal';
import { useMasters, useScheduleReservations, useUpsertScheduleReservation, useDeleteScheduleReservation } from '../api/hooks';

type Period = 'morning' | 'afternoon';

export default function Schedule() {
  const [date, setDate]     = useState('2026-03-30');
  const [period, setPeriod] = useState<Period>('morning');

  const [modalOpen,      setModalOpen]      = useState(false);
  const [editingR,       setEditingR]       = useState<ScheduleReservation | undefined>();
  const [clickedMachine, setClickedMachine] = useState<string | undefined>();
  const [clickedSlot,    setClickedSlot]    = useState<string | undefined>();

  // ── GAS API ──
  const { data: masters }            = useMasters();
  const { data: apiReservations = [] } = useScheduleReservations(date);
  const upsert = useUpsertScheduleReservation();
  const del    = useDeleteScheduleReservation();

  // API が取得できた場合はそちらを優先、未取得時はフォールバック
  const machineAreas = masters?.machineAreas ?? MACHINE_AREAS;
  const scheduleStaff = masters?.staff        ?? mockScheduleStaff;
  const allMachines   = machineAreas.flatMap(a => a.machines);

  const timeSlots = period === 'morning' ? MORNING_SLOTS : AFTERNOON_SLOTS;

  const dayReservations = useMemo(
    () => apiReservations.filter(r => r.date === date),
    [apiReservations, date],
  );

  const confirmedCount = dayReservations.length;

  const openNew = (machineId: string, timeSlot: string) => {
    setEditingR(undefined);
    setClickedMachine(machineId);
    setClickedSlot(timeSlot);
    setModalOpen(true);
  };

  const openEdit = (r: ScheduleReservation) => {
    setEditingR(r);
    setClickedMachine(r.machineId);
    setClickedSlot(r.timeSlot);
    setModalOpen(true);
  };

  const handleSave = (data: Omit<ScheduleReservation, 'id'> & { id?: string }) => {
    upsert.mutate({ ...data, date });
  };

  const handleDelete = (id: string) => {
    del.mutate({ id, date });
  };

  const periodLabel = period === 'morning' ? '午前' : '午後';
  const dateLabel   = new Date(date + 'T00:00:00').toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
  });

  return (
    <div className="flex flex-col h-full">
      {/* ── Screen toolbar ── */}
      <div className="print:hidden flex items-center gap-3 px-5 py-3 border-b border-slate-100 bg-white shrink-0 flex-wrap">
        <h1 className="text-xl font-bold text-slate-800 mr-2">予約表</h1>

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

        <div className="flex items-center gap-2 ml-auto text-sm text-slate-500">
          <span className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full font-semibold text-xs">
            本日 {confirmedCount}件
          </span>
          <div className="flex gap-1">
            {scheduleStaff.map(s => (
              <span
                key={s.id}
                className="text-xs px-2 py-1 rounded-full text-slate-700 font-medium"
                style={{ backgroundColor: s.color }}
              >
                {s.name}
              </span>
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

      {/* ── Grid ── */}
      <div className="flex-1 overflow-auto p-4 print:p-0 print:overflow-visible">
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
        reservation={editingR}
        date={date}
        machines={allMachines}
        staff={scheduleStaff}
      />
    </div>
  );
}
