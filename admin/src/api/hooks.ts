import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { gasGet, gasPost } from './gasClient';
import type { MachineArea, ScheduleStaff, ScheduleReservation, Room, Equipment, Staff, Service } from '../types';

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
    queryFn:  () => gasGet<ScheduleReservation[]>('getScheduleReservations', { date }),
    staleTime: 30 * 1000, // 30秒キャッシュ
    retry: 1,
  });
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
