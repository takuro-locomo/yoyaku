import { useState, useMemo } from 'react';
import type { ScheduleReservation } from '../types';
import { MORNING_SLOTS, AFTERNOON_SLOTS, MACHINE_AREAS, mockScheduleStaff } from '../mock/scheduleData';
import ScheduleGrid from '../components/ScheduleGrid';
import ReservationModal from '../components/ReservationModal';
import { useMasters, useScheduleReservations, useUpsertScheduleReservation, useDeleteScheduleReservation } from '../api/hooks';

type Period = 'morning' | 'afternoon';

export default function Dashboard() {
  const [date, setDate]     = useState('2026-03-30');
  const [period, setPeriod] = useState<Period>('morning');
  const [selectedStaff, setSelectedStaff] = useState<Set<string>>(new Set());

  const [modalOpen,      setModalOpen]      = useState(false);
  const [editingR,       setEditingR]       = useState<ScheduleReservation | undefined>();
  const [clickedMachine, setClickedMachine] = useState<string | undefined>();
  const [clickedSlot,    setClickedSlot]    = useState<string | undefined>();

  const [error, setError] = useState<string | null>(null);

  // ── GAS API ──
  const { data: masters }              = useMasters();
  const { data: apiReservations = [] } = useScheduleReservations(date);
  const upsert = useUpsertScheduleReservation();
  const del    = useDeleteScheduleReservation();

  const mutationOpts = {
    onError: (err: Error) => setError(err.message),
    onSuccess: () => setError(null),
  };

  const machineAreas  = masters?.machineAreas ?? MACHINE_AREAS;
  const scheduleStaff = masters?.staff        ?? mockScheduleStaff;
  const allMachines   = machineAreas.flatMap(a => a.machines);

  const timeSlots = period === 'morning' ? MORNING_SLOTS : AFTERNOON_SLOTS;

  const dayReservations = useMemo(
    () => apiReservations.filter(r => (r.date ?? '').substring(0, 10) === date),
    [apiReservations, date],
  );

  const filteredReservations = useMemo(
    () => selectedStaff.size === 0
      ? dayReservations
      : dayReservations.filter(r => selectedStaff.has(r.staffId)),
    [dayReservations, selectedStaff],
  );

  const toggleStaff = (id: string) => {
    setSelectedStaff(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

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
    setError(null);
    upsert.mutate({ ...data, date }, mutationOpts);
  };

  const handleDelete = (id: string) => {
    setError(null);
    del.mutate({ id, date }, mutationOpts);
  };

  const amCount = dayReservations.filter(r => MORNING_SLOTS.includes(r.timeSlot)).length;
  const pmCount = dayReservations.filter(r => AFTERNOON_SLOTS.includes(r.timeSlot)).length;

  const dateLabel   = new Date(date + 'T00:00:00').toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
  });
  const periodLabel = period === 'morning' ? '午前' : '午後';

  return (
    <div className="flex flex-col h-full">
      {/* ── Screen toolbar ── */}
      <div className="print:hidden flex items-center gap-3 px-5 py-3 border-b border-slate-100 bg-white shrink-0 flex-wrap">
        <h1 className="text-xl font-bold text-slate-800 mr-2">今日の予約</h1>

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
          <span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-full">午前 {amCount}件</span>
          <span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-full">午後 {pmCount}件</span>
          <span className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full font-semibold">
            計 {dayReservations.length}件
          </span>
          <div className="flex gap-1 ml-1">
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

      {/* ── Error banner ── */}
      {error && (
        <div className="bg-red-50 border-b border-red-200 px-5 py-2 flex items-center gap-2 text-sm text-red-700 print:hidden">
          <span className="font-medium">保存エラー:</span> {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">×</button>
        </div>
      )}

      {/* ── Print header ── */}
      <div className="hidden print:block mb-3">
        <div className="flex items-center justify-between border-b-2 border-slate-800 pb-2 mb-1">
          <h1 className="text-base font-bold">{dateLabel} {periodLabel}の部</h1>
          <p className="text-xs text-slate-500">今日の予約</p>
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
          reservations={filteredReservations}
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
