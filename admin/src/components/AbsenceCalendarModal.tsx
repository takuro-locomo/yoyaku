import { useState } from 'react';
import { useClosures, useToggleClosure } from '../api/hooks';

/**
 * 終日不在（休診日）をカレンダーのタップで一括設定するモーダル。
 * 対象は特定の1列（既定: 整形診察室）。
 * 日付をタップすると「琢郎不在」で終日埋まり、もう一度タップすると解除される。
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

/** 月曜始まりのカレンダー用に、その月の日付 (YYYY-MM-DD) と前後の空きを返す */
function buildCalendar(month: string): (string | null)[] {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const daysInMonth = new Date(y, m, 0).getDate();
  const leading = (first.getDay() + 6) % 7; // 月曜=0
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
  machineId: string;
  /** 列の見出し表示用 (例: 整形診察室) */
  columnName: string;
  /** マスに表示するラベル (既定: 琢郎不在) */
  label?: string;
}

export default function AbsenceCalendarModal({ open, onClose, machineId, columnName, label = '琢郎不在' }: Props) {
  const today = new Date().toLocaleDateString('sv');
  const [month, setMonth] = useState(today.substring(0, 7));

  const { data: closures = [], isLoading } = useClosures(month);
  const toggle = useToggleClosure();
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const closedSet = new Set(
    closures.filter(c => c.machineId === machineId).map(c => c.date),
  );
  const cells = buildCalendar(month);

  const handleTap = (date: string) => {
    setError(null);
    toggle.mutate(
      { date, machineId, label },
      { onError: (err: Error) => setError(err.message) },
    );
  };

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
        <h2 className="text-lg font-bold text-slate-800 mb-1">🚫 不在日の設定</h2>
        <p className="text-xs text-slate-500 mb-4">
          <span className="font-semibold text-slate-700">{columnName}</span> の列を「{label}」で終日埋めます。
          日付をタップで設定、もう一度タップで解除。
        </p>

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
        <div className={`grid grid-cols-7 gap-1 ${isLoading ? 'opacity-50 pointer-events-none' : ''}`}>
          {cells.map((date, i) => {
            if (!date) return <div key={`empty-${i}`} />;
            const closed  = closedSet.has(date);
            const isToday = date === today;
            const isPast  = date < today;
            const dayNum  = Number(date.substring(8, 10));
            return (
              <button
                key={date}
                onClick={() => handleTap(date)}
                className={`relative rounded-lg border-2 py-1.5 flex flex-col items-center transition-all select-none ${
                  closed
                    ? 'bg-rose-500 border-rose-500 text-white shadow-sm'
                    : isToday
                      ? 'bg-indigo-50 border-indigo-300 text-indigo-700 hover:border-rose-300'
                      : `bg-white border-slate-100 hover:border-rose-300 ${isPast ? 'text-slate-300' : 'text-slate-700'}`
                }`}
              >
                <span className="text-sm font-bold leading-tight">{dayNum}</span>
                <span className={`text-[8px] font-bold leading-tight h-[10px] ${closed ? 'text-white/90' : 'text-transparent'}`}>
                  不在
                </span>
              </button>
            );
          })}
        </div>

        {/* Error */}
        {error && (
          <div className="mt-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between mt-4">
          <span className="text-[10px] text-slate-400">
            {monthLabel(month)}の不在: {cells.filter(d => d && closedSet.has(d)).length}日
          </span>
          <button
            onClick={onClose}
            className="bg-slate-700 hover:bg-slate-800 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
          >閉じる</button>
        </div>
      </div>
    </div>
  );
}
