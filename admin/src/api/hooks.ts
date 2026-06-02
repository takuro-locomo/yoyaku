import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import { gasGet, gasPost } from './gasClient';
import type { MachineArea, ScheduleStaff, ScheduleReservation, Room, Equipment, Service, Patient, Reservation, HistoryEntry, CheckRole } from '../types';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

export interface Masters {
  machineAreas: MachineArea[];
  staff:        ScheduleStaff[];
  rooms:        Room[];
  equipment:    Equipment[];
  services:     Service[];
}

// ---------------------------------------------------------------------------
// マスタ (部屋・スタッフ・機械・サービス)
// ---------------------------------------------------------------------------

export function useMasters() {
  return useQuery<Masters>({
    queryKey: ['masters'],
    queryFn:  () => gasGet<Masters>('getMasters'),
    staleTime: 5 * 60 * 1000, // 5分キャッシュ
    retry: 1,
  });
}

// ---------------------------------------------------------------------------
// 予約表 reservations
// ---------------------------------------------------------------------------

export function useScheduleReservations(date: string) {
  return useQuery<ScheduleReservation[]>({
    queryKey: ['scheduleReservations', date],
    queryFn:  async () => {
      const data = await gasGet<ScheduleReservation[]>('getScheduleReservations', { date });
      // SheetService が時刻を "1899-12-30T09:00:00+09:00"、日付を "2026-03-30T00:00:00+09:00" で
      // 返す場合があるため、それぞれ "HH:MM" / "YYYY-MM-DD" に正規化する
      return data.map(r => ({
        ...r,
        date:     r.date.substring(0, 10),
        timeSlot: r.timeSlot.includes('T') ? r.timeSlot.split('T')[1].slice(0, 5) : r.timeSlot,
      }));
    },
    staleTime: 30 * 1000, // 30秒キャッシュ
    retry: 1,
  });
}

// 日付範囲の全予約を並列フェッチしてまとめて返す
export function useScheduleReservationsRange(dates: string[]) {
  const results = useQueries({
    queries: dates.map(date => ({
      queryKey: ['scheduleReservations', date],
      queryFn: async () => {
        const data = await gasGet<ScheduleReservation[]>('getScheduleReservations', { date });
        return data.map(r => ({
          ...r,
          date:     r.date.substring(0, 10),
          timeSlot: r.timeSlot.includes('T') ? r.timeSlot.split('T')[1].slice(0, 5) : r.timeSlot,
        }));
      },
      staleTime: 30 * 1000,
      retry: 1,
    })),
  });
  const data    = results.flatMap(r => r.data ?? []);
  const isLoading = results.some(r => r.isLoading);
  return { data, isLoading };
}

export function useUpsertScheduleReservation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<ScheduleReservation> & { date: string }) =>
      gasPost<ScheduleReservation>('upsertScheduleReservation', data),
    onSuccess: (result, vars) => {
      // GAS の upsertScheduleReservation はシートから読み直さず record を直接返すため
      // Date 変換問題の影響なし。setQueryData でキャッシュを即時更新する。
      qc.setQueryData<ScheduleReservation[]>(
        ['scheduleReservations', vars.date],
        (old = []) =>
          vars.id
            ? old.map(r => r.id === vars.id ? result : r)  // 更新
            : [...old, result],                             // 新規追加
      );
      // 追加・変更を履歴パネルに反映
      qc.invalidateQueries({ queryKey: ['scheduleHistory'] });
    },
  });
}

export function useDeleteScheduleReservation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; date: string }) =>
      gasPost<{ id: string }>('deleteScheduleReservation', { id: vars.id }),
    onSuccess: (_result, vars) => {
      qc.setQueryData<ScheduleReservation[]>(
        ['scheduleReservations', vars.date],
        (old = []) => old.filter(r => r.id !== vars.id),
      );
      // 削除を履歴パネルに反映
      qc.invalidateQueries({ queryKey: ['scheduleHistory'] });
    },
  });
}

// ---------------------------------------------------------------------------
// 操作履歴 (予約表の 追加 / 変更 / 削除 ログ)
// ---------------------------------------------------------------------------

export function useScheduleHistory(days = 3, enabled = true) {
  return useQuery<HistoryEntry[]>({
    queryKey: ['scheduleHistory', days],
    queryFn:  async () => {
      const data = await gasGet<HistoryEntry[]>('getScheduleHistory', { days: String(days) });
      // SheetService が date を "2026-06-02T00:00:00+09:00"、timeSlot を
      // "1899-12-30T09:00:00+09:00" で返す場合があるため正規化する
      return data.map(h => ({
        ...h,
        date:        (h.date ?? '').substring(0, 10),
        timeSlot:    h.timeSlot?.includes('T') ? h.timeSlot.split('T')[1].slice(0, 5) : h.timeSlot,
        checkedDr:   h.checkedDr === true || (h.checkedDr as unknown) === 'TRUE',
        checkedJimu: h.checkedJimu === true || (h.checkedJimu as unknown) === 'TRUE',
      }));
    },
    enabled,
    staleTime: 30 * 1000,
    retry: 1,
  });
}

// 履歴の確認チェック (Dr / 事務) を更新する。楽観的更新でUIを即反映。
export function useSetHistoryChecked() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; role: CheckRole; checked: boolean }) =>
      gasPost<{ id: string; role: CheckRole; checked: boolean }>('setHistoryChecked', vars),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ['scheduleHistory'] });
      const field = vars.role === 'dr' ? 'checkedDr' : 'checkedJimu';
      const snapshots = qc.getQueriesData<HistoryEntry[]>({ queryKey: ['scheduleHistory'] });
      qc.setQueriesData<HistoryEntry[]>({ queryKey: ['scheduleHistory'] }, (old) =>
        old?.map(h => h.id === vars.id ? { ...h, [field]: vars.checked } : h),
      );
      return { snapshots };
    },
    onError: (_err, _vars, ctx) => {
      // 失敗時はロールバック
      ctx?.snapshots.forEach(([key, data]) => qc.setQueryData(key, data));
    },
  });
}

// ---------------------------------------------------------------------------
// マスタ upsert (部屋 / 機械 / スタッフ / サービス)
// ---------------------------------------------------------------------------

export function useUpsertRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      gasPost<Room>('upsertRoom', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['masters'] }); },
  });
}

export function useUpsertEquipment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      gasPost<Equipment>('upsertEquipment', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['masters'] }); },
  });
}

export function useUpsertStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      gasPost<ScheduleStaff>('upsertStaff', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['masters'] }); },
  });
}

export function useUpsertService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      gasPost<Service>('upsertService', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['masters'] }); },
  });
}

// ---------------------------------------------------------------------------
// 患者 (patients)
// ---------------------------------------------------------------------------

export function usePatients() {
  return useQuery<Patient[]>({
    queryKey: ['patients'],
    queryFn:  () => gasGet<Patient[]>('getPatients'),
    staleTime: 60 * 1000, // 1分キャッシュ
    retry: 1,
  });
}

export function usePatientReservations(patientId: string | null) {
  return useQuery<Reservation[]>({
    queryKey: ['patientReservations', patientId],
    queryFn:  () => gasGet<Reservation[]>('getPatientReservations', { patientId: patientId! }),
    enabled: !!patientId,
    staleTime: 30 * 1000,
    retry: 1,
  });
}

export function useUpsertPatient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      gasPost<Patient>('upsertPatient', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['patients'] }); },
  });
}
