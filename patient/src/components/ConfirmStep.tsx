import { useState } from 'react';
import { gasPost } from '../api/gasClient';
import type { Booking, ReservationResult } from '../types';

interface Props {
  booking: Booking;
  onSuccess: (result: ReservationResult) => void;
  onBack: () => void;
}

function formatDate(ymd: string): string {
  const dow = ['日', '月', '火', '水', '木', '金', '土'][new Date(ymd).getDay()];
  const [y, m, d] = ymd.split('-');
  return `${y}年${Number(m)}月${Number(d)}日（${dow}）`;
}

export default function ConfirmStep({ booking, onSuccess, onBack }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const handleSubmit = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await gasPost<ReservationResult>('createPatientReservation', {
        menuId:      booking.menu.id,
        date:        booking.date,
        startTime:   booking.slot,
        patientName: booking.name,
        phone:       booking.phone,
        lineUserId:  booking.lineUserId,
      });
      onSuccess(result);
    } catch (e) {
      setError(
        (e as Error).message ||
        '予約の送信に失敗しました。時間をおいて再度お試しください。'
      );
      setLoading(false);
    }
  };

  const rows = [
    { label: 'メニュー',  value: booking.menu.name },
    { label: '所要時間',  value: `${booking.menu.durationMin}分` },
    { label: '日付',      value: formatDate(booking.date) },
    { label: '時間',      value: `${booking.slot} 〜` },
    { label: 'お名前',    value: booking.name },
    { label: '電話番号',  value: booking.phone },
  ];

  return (
    <div>
      <h2 className="font-bold text-stone-800 text-lg mb-1">予約内容の確認</h2>
      <p className="text-stone-400 text-sm mb-5">内容をご確認の上、確定してください</p>

      <div className="bg-white rounded-2xl p-5 shadow-sm border border-stone-100 mb-5">
        <div className="divide-y divide-stone-100">
          {rows.map(({ label, value }) => (
            <div key={label} className="flex justify-between items-center py-3 text-sm">
              <span className="text-stone-400">{label}</span>
              <span className="text-stone-800 font-semibold text-right">{value}</span>
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3.5 mb-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={loading}
        className="w-full py-4 rounded-2xl bg-rose-500 text-white font-bold text-base
                   hover:bg-rose-600 disabled:opacity-50 active:scale-[0.98] transition-all"
      >
        {loading ? '送信中…' : '予約を確定する'}
      </button>
      <button
        onClick={onBack}
        disabled={loading}
        className="w-full py-3 text-stone-500 text-sm mt-2 disabled:opacity-30
                   hover:text-stone-700 transition-colors"
      >
        ← 戻る
      </button>
    </div>
  );
}
