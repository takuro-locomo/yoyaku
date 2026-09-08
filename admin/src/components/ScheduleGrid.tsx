import { useRef, useState } from 'react';
import type { MachineArea, ScheduleReservation, ScheduleStaff } from '../types';
import { mockTreatments } from '../mock/scheduleData';

const ZOOM_KEY  = 'scheduleGridZoom';
const ZOOM_MIN  = 0.4;
const ZOOM_MAX  = 1;
const ZOOM_STEP = 0.1;

function loadZoom(): number {
  const v = Number(localStorage.getItem(ZOOM_KEY));
  if (v >= ZOOM_MIN && v <= ZOOM_MAX) return v;
  // 未設定時の初期値: 携帯は40% (1画面で見渡せるように)、PCは等倍
  return window.innerWidth < 768 ? 0.4 : 1;
}

interface Props {
  machineAreas: MachineArea[];
  staff:        ScheduleStaff[];
  timeSlots: string[];
  reservations: ScheduleReservation[];
  /** この日に終日不在の列 (machineId → ラベル)。該当列は1マスに結合して塗りつぶす */
  closures?: { machineId: string; label: string }[];
  onCellClick: (machineId: string, timeSlot: string) => void;
  onReservationClick: (reservation: ScheduleReservation) => void;
}

export default function ScheduleGrid({ machineAreas, staff, timeSlots, reservations, closures = [], onCellClick, onReservationClick }: Props) {
  const ALL_MACHINES = machineAreas.flatMap(a => a.machines);
  const closureMap = new Map(closures.map(c => [c.machineId, c.label]));
  // --- Build lookup maps ---
  const reservationMap = new Map<string, ScheduleReservation>();
  reservations.forEach(r => reservationMap.set(`${r.machineId}-${r.timeSlot}`, r));

  const occupiedSet = new Set<string>();
  reservations.forEach(r => {
    const startIdx = timeSlots.indexOf(r.timeSlot);
    if (startIdx === -1) return;
    for (let i = 1; i < r.durationSlots; i++) {
      if (startIdx + i < timeSlots.length) {
        occupiedSet.add(`${r.machineId}-${timeSlots[startIdx + i]}`);
      }
    }
  });

  const getTreatment = (id: string) => mockTreatments.find(t => t.id === id);
  const getStaff     = (id: string) => staff.find(s => s.id === id);

  // 終日不在の列: 予約が入っていない「空き区間」だけを斜線マスで結合して埋める。
  // 既存予約のマスはそのまま表示する (不在設定は予約を消さない)。
  // ラベルは一番長い空き区間に1回だけ表示する。
  const closureSegments = new Map<string, { start: number; len: number; withLabel: boolean }[]>();
  closureMap.forEach((_label, machineId) => {
    const busy = new Set<number>();
    timeSlots.forEach((slot, idx) => {
      const k = `${machineId}-${slot}`;
      if (reservationMap.has(k) || occupiedSet.has(k)) busy.add(idx);
    });
    const segs: { start: number; len: number; withLabel: boolean }[] = [];
    let i = 0;
    while (i < timeSlots.length) {
      if (busy.has(i)) { i++; continue; }
      let j = i;
      while (j < timeSlots.length && !busy.has(j)) j++;
      segs.push({ start: i, len: j - i, withLabel: false });
      i = j;
    }
    if (segs.length > 0) {
      segs.reduce((a, b) => (b.len > a.len ? b : a)).withLabel = true;
    }
    closureSegments.set(machineId, segs);
  });

  // 直近5日以内に追加された予約は太枠で表示する
  const RECENT_DAYS = 5;
  const isRecent = (r: ScheduleReservation) => {
    if (!r.createdAt) return false;
    const t = new Date(r.createdAt).getTime();
    return !isNaN(t) && Date.now() - t < RECENT_DAYS * 24 * 60 * 60 * 1000;
  };

  // 1行あたりの高さ（px）。コメントの長短で表の大きさが変わらないよう固定する。
  const ROW_H = 50;

  /*
   * 印刷時の行高。A4縦・余白8mm の印刷可能領域は約 194mm × 281mm。
   * ヘッダー2行(約34px)と凡例(約16px)を差し引いた残りを行数で割る。
   * zoom 0.68 換算なので、CSSピクセル換算の使用可能高さは 281mm ≒ 1062px → 1062 / 0.68 ≒ 1562px。
   * そこからヘッダー等 50px を引いた 1512px を行数で割り、A4一枚を隙間なく使い切る。
   */
  const PRINT_ROW_H = Math.floor((1512 - 50) / timeSlots.length);

  // ── 表示ズーム (チャートの縮小 ⇔ 等倍・1画面フィット) ──
  const [zoom, setZoom]  = useState(loadZoom);
  const scrollRef   = useRef<HTMLDivElement>(null);
  const zoomWrapRef = useRef<HTMLDivElement>(null);

  const applyZoom = (z: number) => {
    const clamped = Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z)) * 100) / 100;
    setZoom(clamped);
    localStorage.setItem(ZOOM_KEY, String(clamped));
  };

  /** スクロールせずに全体が見えるズーム率へ (高さ・幅の両方が収まるように) */
  const fitToScreen = () => {
    const scroll = scrollRef.current;
    const wrap   = zoomWrapRef.current;
    if (!scroll || !wrap) return;
    const naturalH = wrap.getBoundingClientRect().height / zoom; // 等倍換算の高さ
    const zH = (scroll.clientHeight - 6) / naturalH;
    const zW = (scroll.clientWidth  - 6) / 1050; // テーブルの最小幅 1050px 基準
    applyZoom(Math.min(1, zH, zW));
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1 pb-1 px-1 text-[10px] text-slate-500 shrink-0 print:hidden">
        {/* ── ズームコントロール ── */}
        <span className="font-medium text-slate-400">表示</span>
        <button
          onClick={() => applyZoom(zoom - ZOOM_STEP)}
          className="w-6 h-6 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold leading-none"
          title="縮小"
        >−</button>
        <span className="w-9 text-center font-semibold text-slate-600 tabular-nums">{Math.round(zoom * 100)}%</span>
        <button
          onClick={() => applyZoom(zoom + ZOOM_STEP)}
          className="w-6 h-6 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold leading-none"
          title="拡大"
        >＋</button>
        <button
          onClick={fitToScreen}
          className="h-6 px-2 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 font-medium"
          title="スクロールせず全体が見えるサイズにする"
        >1画面</button>
        {zoom !== 1 && (
          <button
            onClick={() => applyZoom(1)}
            className="h-6 px-2 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 font-medium"
            title="等倍に戻す"
          >100%</button>
        )}
        <div className="flex-1" />
        <span className="inline-block w-3.5 h-3.5 rounded-[3px] bg-white border-2 border-slate-700" />
        太枠 = 直近5日で追加した予約
      </div>
      <div ref={scrollRef} className="flex-1 overflow-auto schedule-scroll print:overflow-visible">
      <div ref={zoomWrapRef} className="grid-zoom-wrap" style={{ zoom }}>
      <table
        className="border-collapse text-xs schedule-grid-table"
        style={{
          minWidth: '1050px',
          tableLayout: 'fixed',
          width: '100%',
          ['--row-h' as string]: `${ROW_H}px`,
          ['--print-row-h' as string]: `${PRINT_ROW_H}px`,
          // マス内容の高さ計算に使う。印刷時は index.css で --print-row-h に差し替わる
          ['--cell-h' as string]: `${ROW_H}px`,
        }}
      >
        <colgroup>
          <col style={{ width: '52px' }} /> {/* time column */}
          {ALL_MACHINES.map(m => (
            <col key={m.id} style={{ width: `${Math.floor(948 / ALL_MACHINES.length)}px` }} />
          ))}
        </colgroup>

        <thead>
          {/* Row 1: area headers */}
          <tr>
            <th
              rowSpan={2}
              className="border border-slate-300 bg-slate-100 text-center text-[10px] font-bold text-slate-600 sticky top-0 left-0 z-30 align-middle"
              style={{ width: '52px' }}
            >
              時間
            </th>
            {machineAreas.map(area => (
              <th
                key={area.id}
                colSpan={area.machines.length}
                className="border border-slate-300 text-center text-[11px] font-bold text-slate-700 py-1 sticky top-0 z-20"
                style={{ backgroundColor: area.areaColor }}
              >
                {area.name}
              </th>
            ))}
          </tr>
          {/* Row 2: machine name headers */}
          <tr>
            {ALL_MACHINES.map(m => {
              const area = machineAreas.find(a => a.machines.some(mc => mc.id === m.id))!;
              return (
                <th
                  key={m.id}
                  className="border border-slate-300 text-center text-[9px] font-semibold text-slate-600 py-0.5 px-0.5 leading-tight whitespace-pre-line sticky z-10"
                  style={{ top: '26px', backgroundColor: area.areaColor }}
                >
                  {m.name}
                </th>
              );
            })}
          </tr>
        </thead>

        <tbody>
          {timeSlots.map((slot, slotIdx) => {
            const isHour = slot.endsWith(':00');
            const displayTime = isHour ? slot : slot.slice(3); // "09:00" or ":15"
            return (
              <tr key={slot}>
                {/* Time label */}
                <td
                  className={`border text-center text-[9px] px-0.5 sticky left-0 z-10 align-middle select-none ${
                    isHour
                      ? 'border-slate-400 bg-slate-200 font-bold text-slate-700 border-t-2'
                      : 'border-slate-200 bg-slate-50 text-slate-400'
                  }`}
                  style={{ height: 'var(--row-h)' }}
                >
                  {displayTime}
                </td>

                {/* Machine cells */}
                {ALL_MACHINES.map(machine => {
                  const key = `${machine.id}-${slot}`;

                  // 終日不在の列: 空きマスは斜線の結合マスにする (予約マスは下の通常描画でそのまま表示)
                  const closureLabel = closureMap.get(machine.id);
                  if (closureLabel !== undefined && !reservationMap.has(key) && !occupiedSet.has(key)) {
                    const seg = closureSegments.get(machine.id)?.find(s => s.start === slotIdx);
                    if (!seg) return null; // 直前の斜線マスの rowSpan に含まれる
                    return (
                      <td
                        key={machine.id}
                        rowSpan={seg.len}
                        className="border border-slate-300 text-center align-middle select-none"
                        style={{
                          backgroundImage:
                            'repeating-linear-gradient(-45deg, #f1f5f9 0px, #f1f5f9 10px, #e2e8f0 10px, #e2e8f0 20px)',
                        }}
                        title={`${closureLabel}（終日）`}
                      >
                        {seg.withLabel && (
                          seg.len >= 3 ? (
                            <div
                              className="mx-auto font-bold text-slate-500 tracking-[0.3em]"
                              style={{ writingMode: 'vertical-rl', fontSize: '15px' }}
                            >
                              {closureLabel}
                            </div>
                          ) : (
                            <div className="font-bold text-slate-500 text-[10px]">{closureLabel}</div>
                          )
                        )}
                      </td>
                    );
                  }

                  // Skip: covered by rowspan
                  if (occupiedSet.has(key)) return null;

                  const reservation = reservationMap.get(key);

                  if (reservation) {
                    const isPending = reservation.status === 'pending';
                    const treatment = getTreatment(reservation.treatmentId);
                    const staff     = getStaff(reservation.staffId);
                    const maxSpan   = timeSlots.length - slotIdx;
                    const rowSpan   = Math.min(reservation.durationSlots, maxSpan);
                    // マスの色は担当者の色（担当未設定はデフォルトの無色）。仮予約はオレンジ優先
                    const bgColor   = isPending ? '#fed7aa' : (staff?.color ?? '#f9fafb');
                    const recent    = isRecent(reservation);

                    return (
                      <td
                        key={machine.id}
                        rowSpan={rowSpan}
                        className={`px-1 py-0.5 cursor-pointer hover:brightness-95 transition-all align-top overflow-hidden ${
                          recent
                            ? 'border-2 border-slate-700'
                            : `border ${isPending ? 'border-orange-300' : 'border-slate-300'} ${isHour ? (isPending ? 'border-t-orange-400' : 'border-t-slate-400') : ''}`
                        }`}
                        style={{ backgroundColor: bgColor, verticalAlign: 'top' }}
                        onClick={() => onReservationClick(reservation)}
                        title={reservation.note || undefined}
                      >
                        {/*
                          マスの中身は「行高 × rowSpan」を超えないよう固定し、あふれたら隠す。
                          こうしないとコメントが長いときに行が伸び、表全体の大きさが変わってしまう。
                        */}
                        <div
                          className="res-cell leading-tight overflow-hidden"
                          style={{ height: `calc(var(--cell-h) * ${rowSpan} - 6px)` }}
                        >
                          <div className="flex items-center gap-0.5">
                            {isPending && (
                              <span className="shrink-0 text-[8px] font-bold bg-orange-500 text-white px-1 rounded-sm leading-tight">仮</span>
                            )}
                            <div className="font-semibold text-slate-800 text-[11px] truncate leading-tight">
                              {reservation.patientName}
                            </div>
                          </div>
                          <div className="text-slate-500 text-[9px] truncate">
                            {treatment?.shortName ?? (isPending ? '未確定' : '')}
                          </div>
                          {staff && (
                            <span className="inline-block text-[8px] px-1 rounded-sm text-slate-700 font-medium mt-0.5 truncate max-w-full bg-white/60">
                              {staff.name}
                            </span>
                          )}
                          {reservation.note && (
                            <div className="res-note text-[11px] text-slate-600 whitespace-normal break-words leading-tight mt-0.5">
                              {reservation.note}
                            </div>
                          )}
                        </div>
                      </td>
                    );
                  }

                  // Empty clickable cell
                  return (
                    <td
                      key={machine.id}
                      className={`border border-slate-100 bg-white hover:bg-indigo-50 cursor-pointer transition-colors ${
                        isHour ? 'border-t-slate-300' : ''
                      }`}
                      onClick={() => onCellClick(machine.id, slot)}
                    />
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      </div>
    </div>
  );
}
