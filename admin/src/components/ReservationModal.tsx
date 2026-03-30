import { useState, useEffect } from 'react';
import type { Machine, ScheduleReservation, ScheduleStaff } from '../types';
import { mockTreatments } from '../mock/scheduleData';

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (data: Omit<ScheduleReservation, 'id'> & { id?: string }) => void;
  onDelete: (id: string) => void;
  initialMachineId?: string;
  initialTimeSlot?: string;
  reservation?: ScheduleReservation;
  date: string;
  machines: Machine[];
  staff:    ScheduleStaff[];
}

export default function ReservationModal({
  open, onClose, onSave, onDelete,
  initialMachineId, initialTimeSlot, reservation, date, machines, staff,
}: Props) {
  const [patientName,    setPatientName]    = useState('');
  const [treatmentId,    setTreatmentId]    = useState(mockTreatments[0].id);
  const [staffId,        setStaffId]        = useState('');
  const [durationSlots,  setDurationSlots]  = useState(mockTreatments[0].defaultDurationSlots);
  const [note,           setNote]           = useState('');

  const isEdit = !!reservation;

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
      setTreatmentId(mockTreatments[0].id);
      setStaffId(staff[0]?.id ?? '');
      setDurationSlots(mockTreatments[0].defaultDurationSlots);
      setNote('');
    }
  }, [open, reservation]);

  const handleTreatmentChange = (id: string) => {
    setTreatmentId(id);
    const t = mockTreatments.find(t => t.id === id);
    if (t) setDurationSlots(t.defaultDurationSlots);
  };

  const handleSave = () => {
    if (!patientName.trim()) return;
    onSave({
      id:            reservation?.id,
      date,
      machineId:     reservation?.machineId ?? initialMachineId ?? '',
      timeSlot:      reservation?.timeSlot  ?? initialTimeSlot  ?? '',
      durationSlots,
      patientName:   patientName.trim(),
      treatmentId,
      staffId,
      note,
    });
    onClose();
  };

  if (!open) return null;

  const machine    = machines.find(m => m.id === (reservation?.machineId ?? initialMachineId));
  const treatment  = mockTreatments.find(t => t.id === treatmentId);
  const slot       = reservation?.timeSlot ?? initialTimeSlot ?? '';
  const durationMin = durationSlots * 15;

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-[420px] max-h-[90vh] overflow-y-auto p-6"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <h2 className="text-lg font-bold text-slate-800 mb-4">
          {isEdit ? '予約を編集' : '予約を追加'}
        </h2>

        {/* Context pill */}
        <div className="flex gap-3 bg-slate-50 rounded-xl px-4 py-2.5 mb-5 text-sm text-slate-600">
          <span>🕐 {slot}</span>
          <span>·</span>
          <span>💆 {machine?.name.replace(/\n/g, ' ')}</span>
        </div>

        <div className="space-y-4">
          {/* Patient name */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              患者名 <span className="text-red-400">*</span>
            </label>
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

          {/* Treatment */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              施術内容 <span className="text-red-400">*</span>
            </label>
            <select
              value={treatmentId}
              onChange={e => handleTreatmentChange(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400 bg-white"
            >
              {mockTreatments.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            {treatment && (
              <div
                className="mt-1.5 inline-block text-xs px-2 py-0.5 rounded-full text-slate-600"
                style={{ backgroundColor: treatment.color }}
              >
                {treatment.shortName} · デフォルト {treatment.defaultDurationSlots * 15}分
              </div>
            )}
          </div>

          {/* Staff */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              担当スタッフ <span className="text-red-400">*</span>
            </label>
            <div className="flex gap-2">
              {staff.map(s => (
                <button
                  key={s.id}
                  onClick={() => setStaffId(s.id)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all border-2 ${
                    staffId === s.id
                      ? 'border-indigo-400 text-slate-800 shadow-sm'
                      : 'border-transparent text-slate-500 hover:border-slate-200'
                  }`}
                  style={{ backgroundColor: staffId === s.id ? s.color : '#f8fafc' }}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>

          {/* Duration */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              所要時間 — <span className="text-indigo-600 font-bold">{durationMin}分</span>
              <span className="text-slate-400 font-normal ml-1">({durationSlots}コマ)</span>
            </label>
            <input
              type="range"
              min={1}
              max={16}
              value={durationSlots}
              onChange={e => setDurationSlots(Number(e.target.value))}
              className="w-full accent-indigo-500"
            />
            <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
              <span>15分</span>
              <span>1時間</span>
              <span>2時間</span>
              <span>4時間</span>
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
            disabled={!patientName.trim()}
            className="px-5 py-2 rounded-lg text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            {isEdit ? '保存' : '追加'}
          </button>
        </div>
      </div>
    </div>
  );
}
