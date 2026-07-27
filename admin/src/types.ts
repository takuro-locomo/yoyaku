export type ReservationStatus = 'confirmed' | 'pending' | 'cancelled';

export interface Reservation {
  id: string;
  patientId: string;
  patientName: string;
  serviceId: string;
  serviceName: string;
  roomId: string;
  roomName: string;
  equipmentId: string;
  staffId: string;
  staffName: string;
  startAt: string; // ISO8601
  endAt: string;   // ISO8601
  status: ReservationStatus;
  note: string;
}

export interface Room {
  id: string;
  name: string;
  area?: string;
  areaColor?: string;
  description?: string;
  isActive: boolean;
}

export interface Equipment {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
}

export interface Staff {
  id: string;
  name: string;
  email: string;
  color?: string;
  isActive: boolean;
}

export interface Service {
  id: string;
  name: string;
  durationMinutes: number;
  requiresEquipmentId: string;
  price: number;
  isActive: boolean;
}

export interface Patient {
  id: string;
  lineUserId: string;
  name: string;
  phone: string;
  email: string;
  birthDate?: string; // YYYY-MM-DD
  createdAt?: string; // ISO8601
}

// ── Schedule types ────────────────────────────────────────────────────────

export interface Machine {
  id: string;
  name: string;          // may contain \n for multi-line display
  treatmentIds?: string[]; // if set (length > 1), show treatment dropdown in modal
}

export interface MachineArea {
  id: string;
  name: string;
  areaColor: string; // CSS color string for area header background
  machines: Machine[];
}

export interface Treatment {
  id: string;
  name: string;
  shortName: string;
  defaultDurationSlots: number; // 1 slot = 15 minutes
  color: string; // CSS color string for cell background
}

export interface ScheduleStaff {
  id: string;
  name: string;
  color: string; // CSS color for staff badge background
}

export interface ScheduleReservation {
  id: string;
  date: string;        // YYYY-MM-DD
  machineId: string;
  timeSlot: string;    // "09:00", "09:15", etc.
  durationSlots: number; // number of 15-min slots this reservation spans
  patientName: string;
  treatmentId: string;
  staffId: string;
  note: string;
  status?: string;     // 'confirmed' (default) | 'pending' (患者予約から自動作成)
  createdAt?: string;  // ISO8601 (直近追加の太枠表示に使う)
}

// 予約表の操作履歴 (追加 / 変更 / 削除 ログ)
export interface HistoryEntry {
  id: string;
  action: 'create' | 'update' | 'delete';
  at: string;            // ISO8601 (操作した時刻)
  reservationId: string;
  date: string;          // 予約日 YYYY-MM-DD
  timeSlot: string;      // "09:00"
  machineId: string;
  patientName: string;
  treatmentId: string;
  staffId: string;
  checkedDr?: boolean;     // ドクター確認済み
  checkedDrAt?: string;
  checkedJimu?: boolean;   // 事務確認済み
  checkedJimuAt?: string;
}

export type CheckRole = 'dr' | 'jimu';
