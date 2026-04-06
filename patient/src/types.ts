export interface Menu {
  id: string;
  name: string;
  durationMin: number;
}

export interface Booking {
  menu: Menu;
  date: string;       // YYYY-MM-DD
  slot: string;       // HH:MM
  name: string;
  phone: string;
  lineUserId: string; // LINE連携時に注入
}

export interface ReservationResult {
  id: string;
  confirmationNo: string;
  menuName: string;
  date: string;
  startTime: string;
  patientName: string;
}
