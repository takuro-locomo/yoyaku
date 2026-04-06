import { useState } from 'react';

interface Props {
  menuName: string;
  value: string;
  onNext: (date: string) => void;
  onBack: () => void;
}

const DOW_LABELS = ['日', '月', '火', '水', '木', '金', '土'];
const MONTH_LABELS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function DateStep({ menuName, value, onNext, onBack }: Props) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 予約は翌日以降・2ヶ月先まで
  const minDate = new Date(today);
  minDate.setDate(today.getDate() + 1);
  const maxDate = new Date(today);
  maxDate.setMonth(today.getMonth() + 2);

  const [view, setView] = useState(() => {
    // 初期表示月: 翌日が翌月なら翌月を表示
    const base = new Date(minDate);
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  const year  = view.getFullYear();
  const month = view.getMonth();

  const firstDow    = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const canGoPrev = new Date(year, month - 1, 1) >= new Date(today.getFullYear(), today.getMonth(), 1);
  const canGoNext = new Date(year, month + 1, 1) <= new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);

  const prevMonth = () => { if (canGoPrev) setView(new Date(year, month - 1, 1)); };
  const nextMonth = () => { if (canGoNext) setView(new Date(year, month + 1, 1)); };

  return (
    <div>
      <h2 className="font-bold text-stone-800 text-lg mb-1">日付を選択</h2>
      <p className="text-stone-400 text-sm mb-5">{menuName}</p>

      <div className="bg-white rounded-2xl p-4 shadow-sm border border-stone-100 mb-4">
        {/* Month navigation */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={prevMonth}
            disabled={!canGoPrev}
            className="w-9 h-9 rounded-full hover:bg-stone-100 disabled:opacity-20 flex items-center justify-center text-stone-600 text-lg transition-colors"
          >
            ‹
          </button>
          <span className="font-semibold text-stone-800">
            {year}年 {MONTH_LABELS[month]}
          </span>
          <button
            onClick={nextMonth}
            disabled={!canGoNext}
            className="w-9 h-9 rounded-full hover:bg-stone-100 disabled:opacity-20 flex items-center justify-center text-stone-600 text-lg transition-colors"
          >
            ›
          </button>
        </div>

        {/* Day of week header */}
        <div className="grid grid-cols-7 mb-1">
          {DOW_LABELS.map((d, i) => (
            <div
              key={d}
              className={`text-center text-xs font-medium py-1 ${
                i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-stone-400'
              }`}
            >
              {d}
            </div>
          ))}
        </div>

        {/* Days grid */}
        <div className="grid grid-cols-7 gap-y-1">
          {/* Leading empty cells */}
          {Array.from({ length: firstDow }, (_, i) => <div key={`e${i}`} />)}

          {Array.from({ length: daysInMonth }, (_, i) => {
            const day  = i + 1;
            const date = new Date(year, month, day);
            const ymd  = toYMD(date);
            const disabled = date < minDate || date > maxDate;
            const selected = value === ymd;
            const dow = date.getDay();

            return (
              <button
                key={day}
                disabled={disabled}
                onClick={() => onNext(ymd)}
                className={`aspect-square flex items-center justify-center text-sm rounded-full
                            mx-auto w-9 transition-colors ${
                  selected
                    ? 'bg-rose-500 text-white font-bold shadow-sm'
                    : disabled
                    ? 'text-stone-200 cursor-not-allowed'
                    : dow === 0
                    ? 'text-red-500 hover:bg-red-50'
                    : dow === 6
                    ? 'text-blue-500 hover:bg-blue-50'
                    : 'text-stone-700 hover:bg-stone-100'
                }`}
              >
                {day}
              </button>
            );
          })}
        </div>
      </div>

      <button
        onClick={onBack}
        className="w-full py-3 text-stone-500 text-sm hover:text-stone-700 transition-colors"
      >
        ← 戻る
      </button>
    </div>
  );
}
