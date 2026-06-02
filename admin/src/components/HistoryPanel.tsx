import { useMemo } from 'react';
import type { Machine, ScheduleStaff } from '../types';
import { mockTreatments } from '../mock/scheduleData';
import { useScheduleHistory } from '../api/hooks';

interface Props {
  open: boolean;
  onClose: () => void;
  machines: Machine[];
  staff: ScheduleStaff[];
}

const ACTION_META: Record<string, { label: string; cls: string }> = {
  create: { label: '追加', cls: 'bg-emerald-100 text-emerald-700' },
  update: { label: '変更', cls: 'bg-amber-100 text-amber-700' },
  delete: { label: '削除', cls: 'bg-rose-100 text-rose-700' },
};

/** ISO文字列を "今日 14:32" / "6/1 09:15" のように整形する */
function formatAt(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const yest = new Date(today); yest.setDate(today.getDate() - 1);
  const isYest = d.toDateString() === yest.toDateString();
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (sameDay) return `今日 ${hm}`;
  if (isYest)  return `昨日 ${hm}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
}

/** 予約日 (YYYY-MM-DD) を "6/1(月)" に整形する */
function formatResDate(date: string): string {
  if (!date) return '';
  const d = new Date(date + 'T00:00:00');
  if (isNaN(d.getTime())) return date;
  const w = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
  return `${d.getMonth() + 1}/${d.getDate()}(${w})`;
}

export default function HistoryPanel({ open, onClose, machines, staff }: Props) {
  const { data: history = [], isLoading, isError, refetch } = useScheduleHistory(7, open);

  const machineName = useMemo(() => {
    const m = new Map(machines.map(x => [x.id, x.name.replace(/\n/g, ' ')]));
    return (id: string) => m.get(id) ?? id;
  }, [machines]);

  const staffName = useMemo(() => {
    const m = new Map(staff.map(x => [x.id, x.name]));
    return (id: string) => m.get(id) ?? '';
  }, [staff]);

  const treatmentName = (id: string) =>
    mockTreatments.find(t => t.id === id)?.shortName ?? '';

  return (
    <>
      {/* オーバーレイ */}
      <div
        className={`fixed inset-0 bg-black/30 z-40 transition-opacity ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* スライドパネル */}
      <aside
        className={`fixed top-0 right-0 h-full w-full max-w-sm bg-white shadow-2xl z-50 flex flex-col transition-transform duration-300 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* ヘッダー */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 shrink-0">
          <h2 className="text-base font-bold text-slate-800">予約の変更履歴</h2>
          <span className="text-xs text-slate-400">直近7日</span>
          <button
            onClick={() => refetch()}
            className="ml-auto p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 text-sm"
            title="再読み込み"
          >↻</button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 text-lg leading-none"
          >×</button>
        </div>

        {/* 本文 */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {isLoading && (
            <p className="text-sm text-slate-400 text-center py-8">読み込み中…</p>
          )}
          {isError && (
            <p className="text-sm text-rose-500 text-center py-8">
              履歴を取得できませんでした
            </p>
          )}
          {!isLoading && !isError && history.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-8">
              直近7日の変更履歴はありません
            </p>
          )}

          <ul className="space-y-2">
            {history.map(h => {
              const meta = ACTION_META[h.action] ?? { label: h.action, cls: 'bg-slate-100 text-slate-600' };
              const treatment = treatmentName(h.treatmentId);
              const sName = staffName(h.staffId);
              return (
                <li
                  key={h.id}
                  className="border border-slate-100 rounded-xl px-3 py-2.5 bg-slate-50/50"
                >
                  <div className="flex items-center gap-2">
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${meta.cls}`}>
                      {meta.label}
                    </span>
                    <span className="text-sm font-semibold text-slate-800 truncate">
                      {h.patientName || '(名前なし)'}
                    </span>
                    <span className="ml-auto text-[11px] text-slate-400 whitespace-nowrap">
                      {formatAt(h.at)}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-slate-500 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="text-slate-600 font-medium">
                      {formatResDate(h.date)} {h.timeSlot}
                    </span>
                    <span>·</span>
                    <span>{machineName(h.machineId)}</span>
                    {treatment && (<><span>·</span><span>{treatment}</span></>)}
                    {sName && (<><span>·</span><span>{sName}</span></>)}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </aside>
    </>
  );
}
