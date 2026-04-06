import { useState, useEffect } from 'react';
import { gasGet } from '../api/gasClient';

interface Props {
  menuId: string;
  menuName: string;
  date: string;
  onNext: (slot: string) => void;
  onBack: () => void;
}

function formatDate(ymd: string): string {
  const [y, m, d] = ymd.split('-');
  const dow = ['日', '月', '火', '水', '木', '金', '土'][new Date(ymd).getDay()];
  return `${y}年${Number(m)}月${Number(d)}日（${dow}）`;
}

export default function SlotStep({ menuId, menuName, date, onNext, onBack }: Props) {
  const [slots, setSlots]     = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [selected, setSelected] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    setSelected('');
    gasGet<string[]>('getPatientSlots', { menuId, date })
      .then(setSlots)
      .catch(() => setError('空き枠の取得に失敗しました。時間をおいて再度お試しください。'))
      .finally(() => setLoading(false));
  }, [menuId, date]);

  return (
    <div>
      <h2 className="font-bold text-stone-800 text-lg mb-1">時間を選択</h2>
      <p className="text-stone-400 text-sm mb-1">{menuName}</p>
      <p className="text-stone-600 text-sm font-medium mb-5">{formatDate(date)}</p>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-rose-200 border-t-rose-500 rounded-full animate-spin" />
        </div>
      )}

      {!loading && error && (
        <div className="text-center py-12">
          <p className="text-red-500 text-sm mb-4">{error}</p>
        </div>
      )}

      {!loading && !error && slots.length === 0 && (
        <div className="text-center py-12">
          <p className="text-4xl mb-3">😔</p>
          <p className="text-stone-600 font-medium mb-1">この日は空き枠がありません</p>
          <p className="text-stone-400 text-sm mb-5">別の日をお選びください</p>
          <button
            onClick={onBack}
            className="text-rose-600 font-semibold text-sm"
          >
            ← 日付を選び直す
          </button>
        </div>
      )}

      {!loading && !error && slots.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-2 mb-6">
            {slots.map(slot => (
              <button
                key={slot}
                onClick={() => setSelected(slot)}
                className={`py-3.5 rounded-xl text-sm font-semibold border-2 transition-all active:scale-95 ${
                  selected === slot
                    ? 'bg-rose-500 text-white border-rose-500 shadow-md'
                    : 'bg-white text-stone-700 border-stone-200 hover:border-rose-300 hover:text-rose-600'
                }`}
              >
                {slot}
              </button>
            ))}
          </div>

          <button
            disabled={!selected}
            onClick={() => { if (selected) onNext(selected); }}
            className="w-full py-4 rounded-2xl bg-rose-500 text-white font-bold text-base
                       disabled:opacity-30 hover:bg-rose-600 active:scale-[0.98] transition-all"
          >
            次へ →
          </button>
        </>
      )}

      {!loading && (
        <button
          onClick={onBack}
          className="w-full py-3 text-stone-500 text-sm mt-2 hover:text-stone-700 transition-colors"
        >
          ← 戻る
        </button>
      )}
    </div>
  );
}
