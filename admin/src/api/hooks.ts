import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { gasGet, gasPost } from './gasClient';
import type { MachineArea, ScheduleStaff, ScheduleReservation, Room, Equipment, Service } from '../types';

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
    onSuccess: (_result, vars) => {
      qc.invalidateQueries({ queryKey: ['scheduleReservations', vars.date] });
    },
  });
}

export function useDeleteScheduleReservation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; date: string }) =>
      gasPost<{ id: string }>('deleteScheduleReservation', { id: vars.id }),
    onSuccess: (_result, vars) => {
      qc.invalidateQueries({ queryKey: ['scheduleReservations', vars.date] });
    },
  });
}
