import type { MachineArea, ScheduleReservation, ScheduleStaff } from '../types';
import { mockTreatments } from '../mock/scheduleData';

interface Props {
  machineAreas: MachineArea[];
  staff:        ScheduleStaff[];
  timeSlots: string[];
  reservations: ScheduleReservation[];
  onCellClick: (machineId: string, timeSlot: string) => void;
  onReservationClick: (reservation: ScheduleReservation) => void;
}

export default function ScheduleGrid({ machineAreas, staff, timeSlots, reservations, onCellClick, onReservationClick }: Props) {
  const ALL_MACHINES = machineAreas.flatMap(a => a.machines);
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

  // 直近5日以内に追加された予約は太枠で表示する
  const RECENT_DAYS = 5;
  const isRecent = (r: ScheduleReservation) => {
    if (!r.createdAt) return false;
    const t = new Date(r.createdAt).getTime();
    return !isNaN(t) && Date.now() - t < RECENT_DAYS * 24 * 60 * 60 * 1000;
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-end items-center gap-1 pb-1 pr-1 text-[10px] text-slate-500 shrink-0">
        <span className="inline-block w-3.5 h-3.5 rounded-[3px] bg-white border-2 border-slate-700" />
        太枠 = 直近5日で追加した予約
      </div>
      <div className="flex-1 overflow-auto schedule-scroll print:overflow-visible">
      <table
        className="border-collapse text-xs schedule-grid-table"
        style={{
          minWidth: '1050px',
          tableLayout: 'fixed',
          width: '100%',
          // A4縦印刷時の行高。印刷可能高さ(zoom 0.68換算で約1350px)を行数で割り、
          // 午前/午後どちらの部でも下余白が約2cmになるようにする（画面表示には影響しない）
          ['--print-row-h' as string]: `${Math.floor(1350 / timeSlots.length)}px`,
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
                  style={{ height: '50px' }}
                >
                  {displayTime}
                </td>

                {/* Machine cells */}
                {ALL_MACHINES.map(machine => {
                  const key = `${machine.id}-${slot}`;

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
                      >
                        <div className="leading-tight overflow-hidden">
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
  );
}
