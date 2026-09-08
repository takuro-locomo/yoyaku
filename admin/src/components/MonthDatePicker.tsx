import { useEffect, useState } from 'react';
import { useClosures } from '../api/hooks';

/**
 * 予約入力ページ用の月カレンダー日付ピッカー。
 * 日付をタップするとその日にジャンプする。
 * 終日不在 (琢郎不在など) が設定されている日は赤いドットで示す。
 */

const DOW_LABELS = ['月', '火', '水', '木', '金', '土', '日'];

function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${y}年${m}月`;
}

function shiftMonth(month: string, diff: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + diff, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** 月曜始まりのカレンダー用セル (YYYY-MM-DD or null) */
function buildCalendar(month: string): (string | null)[] {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const daysInMonth = new Date(y, m, 0).getDate();
  const leading = (first.getDay() + 6) % 7;
  const cells: (string | null)[] = Array(leading).fill(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${month}-${String(d).padStart(2, '0')}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** 現在選択中の日付 (YYYY-MM-DD) */
  value: string;
  onSelect: (date: string) => void;
}

export default function MonthDatePicker({ open, onClose, value, onSelect }: Props) {
  const today = new Date().toLocaleDateString('sv');
  const [month, setMonth] = useState(value.substring(0, 7));

  // 開くたびに選択中の日付の月へ合わせる
  useEffect(() => {
    if (open) setMonth(value.substring(0, 7));
  }, [open, value]);

  const { data: closures = [] } = useClosures(month);

  if (!open) return null;

  const closedSet = new Set(closures.map(c => c.date));
  const cells = buildCalendar(month);

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-[380px] max-h-[90vh] overflow-y-auto p-6"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-800">📅 日付を選ぶ</h2>
          <button
            onClick={() => { onSelect(today); onClose(); }}
            className="text-xs px-3 py-1.5 rounded-lg font-medium bg-indigo-50 text-indigo-600 hover:bg-indigo-100"
          >今日へ</button>
        </div>

        {/* Month nav */}
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => setMonth(shiftMonth(month, -1))}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 text-sm"
          >◀</button>
          <span className="text-sm font-bold text-slate-700">{monthLabel(month)}</span>
          <button
            onClick={() => setMonth(shiftMonth(month, 1))}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 text-sm"
          >▶</button>
        </div>

        {/* Calendar */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {DOW_LABELS.map((d, i) => (
            <div
              key={d}
              className={`text-center text-[10px] font-bold py-1 ${
                i === 5 ? 'text-blue-500' : i === 6 ? 'text-red-500' : 'text-slate-400'
              }`}
            >{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((date, i) => {
            if (!date) return <div key={`empty-${i}`} />;
            const isSelected = date === value;
            const isToday    = date === today;
            const isPast     = date < today;
            const isClosed   = closedSet.has(date);
            const dayNum     = Number(date.substring(8, 10));
            return (
              <button
                key={date}
                onClick={() => { onSelect(date); onClose(); }}
                className={`relative rounded-lg border-2 py-1.5 flex flex-col items-center transition-all select-none ${
                  isSelected
                    ? 'bg-indigo-600 border-indigo-600 text-white shadow-md'
                    : isToday
                      ? 'bg-indigo-50 border-indigo-300 text-indigo-700 hover:border-indigo-400'
                      : `bg-white border-slate-100 hover:border-indigo-300 ${isPast ? 'text-slate-300' : 'text-slate-700'}`
                }`}
              >
                <span className="text-sm font-bold leading-tight">{dayNum}</span>
                <span className={`text-[8px] font-bold leading-tight h-[10px] ${
                  isClosed ? (isSelected ? 'text-white/90' : 'text-rose-500') : 'text-transparent'
                }`}>
                  不在
                </span>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex justify-end mt-4">
          <button
            onClick={onClose}
            className="bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-medium px-5 py-2 rounded-lg transition-colors"
          >閉じる</button>
        </div>
      </div>
    </div>
  );
}
