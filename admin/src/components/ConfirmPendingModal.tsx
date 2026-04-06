import { useState, useEffect } from 'react';
import type { ScheduleReservation, ScheduleStaff, Machine } from '../types';
import { mockTreatments } from '../mock/scheduleData';
import { useUpsertScheduleReservation } from '../api/hooks';

interface Props {
  open:        boolean;
  onClose:     () => void;
  reservation: ScheduleReservation;
  date:        string;
  machines:    Machine[];
  staff:       ScheduleStaff[];
}

export default function ConfirmPendingModal({ open, onClose, reservation, date, machines, staff }: Props) {
  const [staffId,     setStaffId]     = useState('');
  const [treatmentId, setTreatmentId] = useState('');
  const [error,       setError]       = useState<string | null>(null);

  const upsert = useUpsertScheduleReservation();

  useEffect(() => {
    if (open) {
      setStaffId(reservation.staffId || '');
      setTreatmentId(reservation.treatmentId || '');
      setError(null);
    }
  }, [open, reservation.id]);

  if (!open) return null;

  const machine = machines.find(m => m.id === reservation.machineId);

  const handleConfirm = () => {
    setError(null);
    upsert.mutate(
      { ...reservation, staffId, treatmentId, status: 'confirmed', date },
      {
        onSuccess: () => onClose(),
        onError:   (err: Error) => setError(err.message),
      },
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="bg-orange-100 text-orange-700 text-xs font-bold px-2 py-0.5 rounded-full">仮予約</span>
          <h2 className="text-lg font-bold text-slate-800">仮予約を確定する</h2>
        </div>

        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-5 text-sm space-y-1.5">
          <div>
            <span className="text-slate-500 text-xs">患者名</span>
            <p className="font-semibold text-slate-800">{reservation.patientName}</p>
          </div>
          <div className="flex gap-4">
            <div>
              <span className="text-slate-500 text-xs">機械</span>
              <p className="text-slate-700 whitespace-pre-line leading-tight">{machine?.name ?? reservation.machineId}</p>
            </div>
            <div>
              <span className="text-slate-500 text-xs">日時</span>
              <p className="text-slate-700">{date} {reservation.timeSlot}</p>
            </div>
          </div>
          {reservation.note && (
            <div>
              <span className="text-slate-500 text-xs">メモ</span>
              <p className="text-slate-600 text-xs">{reservation.note}</p>
            </div>
          )}
        </div>

        <div className="space-y-3 mb-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">担当スタッフ</label>
            <select
              value={staffId}
              onChange={e => setStaffId(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400"
            >
              <option value="">（未設定）</option>
              {staff.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">施術</label>
            <select
              value={treatmentId}
              onChange={e => setTreatmentId(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400"
            >
              <option value="">（未設定）</option>
              {mockTreatments.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg mb-3">{error}</div>
        )}

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 border border-slate-200 text-slate-600 text-sm font-medium px-4 py-2 rounded-lg hover:bg-slate-50 transition-colors"
          >
            閉じる
          </button>
          <button
            onClick={handleConfirm}
            disabled={upsert.isPending}
            className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            {upsert.isPending ? '更新中...' : '確定する'}
          </button>
        </div>
      </div>
    </div>
  );
}
