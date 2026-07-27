import { useState, useEffect } from 'react';
import type { Machine, ScheduleReservation, ScheduleStaff } from '../types';
import { mockTreatments, resolveTreatmentIds } from '../mock/scheduleData';

const DURATION_OPTIONS = [
  { label: '15分',  slots: 1 },
  { label: '30分',  slots: 2 },
  { label: '45分',  slots: 3 },
  { label: '60分',  slots: 4 },
  { label: '90分',  slots: 6 },
  { label: '120分', slots: 8 },
];

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (data: Omit<ScheduleReservation, 'id'> & { id?: string }) => void;
  onDelete: (id: string) => void;
  initialMachineId?: string;
  initialTimeSlot?: string;
  initialStaffId?: string;
  reservation?: ScheduleReservation;
  date: string;
  machines: Machine[];
  staff:    ScheduleStaff[];
}

export default function ReservationModal({
  open, onClose, onSave, onDelete,
  initialMachineId, initialTimeSlot, initialStaffId, reservation, date, machines, staff,
}: Props) {
  const [patientName,   setPatientName]   = useState('');
  const [treatmentId,   setTreatmentId]   = useState('');
  const [staffId,       setStaffId]       = useState('');
  const [durationSlots, setDurationSlots] = useState(1);
  const [note,          setNote]          = useState('');

  const isEdit = !!reservation;
  const machine = machines.find(m => m.id === (reservation?.machineId ?? initialMachineId));

  // 複数施術が登録された列のみドロップダウンを表示
  // GAS API 取得時に treatmentIds が付かない場合は機械名キーワードで補完
  const resolvedIds = machine ? resolveTreatmentIds(machine) : undefined;
  const treatmentOptions = resolvedIds && resolvedIds.length > 1
    ? mockTreatments.filter(t => resolvedIds.includes(t.id))
    : [];
  const showTreatment = treatmentOptions.length > 1;

  useEffect(() => {
    if (!open) return;
    if (reservation) {
      setPatientName(reservation.patientName);
      setTreatmentId(reservation.treatmentId);
      setStaffId(reservation.staffId);
      setDurationSlots(reservation.durationSlots);
      setNote(reservation.note);
    } else {
      setPatientName('');
      setTreatmentId(resolvedIds?.[0] ?? '');
      setStaffId(initialStaffId ?? '');
      setDurationSlots(1);
      setNote('');
    }
  }, [open, reservation, initialStaffId]);

  const handleTreatmentChange = (id: string) => {
    setTreatmentId(id);
    // 施術切替時に対応するデフォルト所要時間を自動選択
    const t = mockTreatments.find(t => t.id === id);
    if (t && DURATION_OPTIONS.some(d => d.slots === t.defaultDurationSlots)) {
      setDurationSlots(t.defaultDurationSlots);
    }
  };

  const handleSave = () => {
    onSave({
      id:           reservation?.id,
      date,
      machineId:    reservation?.machineId ?? initialMachineId ?? '',
      timeSlot:     reservation?.timeSlot  ?? initialTimeSlot  ?? '',
      durationSlots,
      patientName:  patientName.trim(),
      treatmentId,
      staffId,
      note,
    });
    onClose();
  };

  if (!open) return null;

  const slot           = reservation?.timeSlot ?? initialTimeSlot ?? '';
  const selectedStaff  = staff.find(s => s.id === staffId);

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-[400px] max-h-[90vh] overflow-y-auto p-6"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <h2 className="text-lg font-bold text-slate-800 mb-4">
          {isEdit ? '予約を編集' : '予約を追加'}
        </h2>

        {/* Context pill */}
        <div className="flex flex-wrap items-center gap-2 bg-slate-50 rounded-xl px-4 py-2.5 mb-5 text-sm text-slate-600">
          <span>🕐 {slot}</span>
          <span className="text-slate-300">·</span>
          <span>💆 {machine?.name.replace(/\n/g, ' / ')}</span>
          {selectedStaff && (
            <>
              <span className="text-slate-300">·</span>
              <span
                className="text-xs px-2 py-0.5 rounded-full text-slate-700 font-medium"
                style={{ backgroundColor: selectedStaff.color }}
              >
                {selectedStaff.name}
              </span>
            </>
          )}
        </div>

        <div className="space-y-4">
          {/* Patient name */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">患者名</label>
            <input
              type="text"
              value={patientName}
              onChange={e => setPatientName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              placeholder="山田 花子"
              autoFocus
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200 transition-all"
            />
          </div>

          {/* Treatment — 複数施術列のみ表示 */}
          {showTreatment && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                施術内容
              </label>
              <select
                value={treatmentId}
                onChange={e => handleTreatmentChange(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400 bg-white"
              >
                {treatmentOptions.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Staff (術者) */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-2">術者</label>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setStaffId('')}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border-2 ${
                  staffId === ''
                    ? 'border-slate-500 bg-slate-200 text-slate-800 shadow-sm'
                    : 'border-slate-200 bg-white text-slate-400 hover:border-slate-300'
                }`}
              >
                なし
              </button>
              {staff.map(s => (
                <button
                  key={s.id}
                  onClick={() => setStaffId(s.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border-2 ${
                    staffId === s.id
                      ? 'border-slate-500 text-slate-800 shadow-sm'
                      : 'border-transparent bg-slate-100 text-slate-500 hover:border-slate-300'
                  }`}
                  style={staffId === s.id ? { backgroundColor: s.color } : {}}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>

          {/* Duration buttons */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-2">所要時間</label>
            <div className="flex gap-1.5">
              {DURATION_OPTIONS.map(({ label, slots }) => (
                <button
                  key={slots}
                  onClick={() => setDurationSlots(slots)}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all border-2 ${
                    durationSlots === slots
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                      : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Note */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">備考</label>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={2}
              placeholder="特記事項があれば..."
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400 transition-all resize-none"
            />
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 mt-6">
          {isEdit && (
            <button
              onClick={() => { onDelete(reservation!.id); onClose(); }}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
            >
              削除
            </button>
          )}
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
          >
            キャンセル
          </button>
          <button
            onClick={handleSave}
            disabled={false}
            className="px-5 py-2 rounded-lg text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            {isEdit ? '保存' : '追加'}
          </button>
        </div>
      </div>
    </div>
  );
}
