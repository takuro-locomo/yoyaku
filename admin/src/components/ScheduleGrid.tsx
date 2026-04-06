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

  return (
    <div className="overflow-auto schedule-scroll print:overflow-visible">
      <table
        className="border-collapse text-xs schedule-grid-table"
        style={{ minWidth: '1050px', tableLayout: 'fixed', width: '100%' }}
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
              className="border border-slate-300 bg-slate-100 text-center text-[10px] font-bold text-slate-600 sticky left-0 z-20 align-middle"
              style={{ width: '52px' }}
            >
              時間
            </th>
            {machineAreas.map(area => (
              <th
                key={area.id}
                colSpan={area.machines.length}
                className="border border-slate-300 text-center text-[11px] font-bold text-slate-700 py-1"
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
                  className="border border-slate-300 text-center text-[9px] font-semibold text-slate-600 py-0.5 px-0.5 leading-tight whitespace-pre-line"
                  style={{ backgroundColor: area.areaColor + '80' }}
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
                  style={{ height: isHour ? '28px' : '22px' }}
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
                    const bgColor   = isPending ? '#fed7aa' : (treatment?.color ?? '#f9fafb');

                    return (
                      <td
                        key={machine.id}
                        rowSpan={rowSpan}
                        className={`border px-1 py-0.5 cursor-pointer hover:brightness-95 transition-all align-top overflow-hidden ${
                          isPending ? 'border-orange-300' : 'border-slate-300'
                        } ${isHour ? (isPending ? 'border-t-orange-400' : 'border-t-slate-400') : ''}`}
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
                            <span
                              className="inline-block text-[8px] px-1 rounded-sm text-slate-700 font-medium mt-0.5 truncate max-w-full"
                              style={{ backgroundColor: staff.color }}
                            >
                              {staff.name}
                            </span>
                          )}
                          {reservation.note && (
                            <div className="text-[8px] text-slate-400 truncate mt-0.5">
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
  );
}
