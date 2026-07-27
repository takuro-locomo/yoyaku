import type { Machine, MachineArea, Treatment, ScheduleStaff } from '../types';

// ---------------------------------------------------------------------------
// Machine areas and columns  ※ GAS API 未接続時のフォールバック
// 2F エリアは右端に配置
// ---------------------------------------------------------------------------
export const MACHINE_AREAS: MachineArea[] = [
  {
    id: 'area-1f-hair',
    name: '1F脱毛エリア',
    areaColor: '#dbeafe',
    machines: [
      { id: 'm-vel', name: 'ベロシティ' },
      { id: 'm-cla', name: 'クラリティ' },
      { id: 'm-gen', name: 'ジェントル' },
      { id: 'm-vec', name: 'ベクタス' },
    ],
  },
  {
    id: 'area-ope',
    name: 'Ope室',
    areaColor: '#fee2e2',
    machines: [
      { id: 'm-ope', name: 'Vビーム\nマイセル/エコ2\nスペクトラ', treatmentIds: ['t-20', 't-15', 't-19', 't-05'] },
    ],
  },
  {
    id: 'area-exam',
    name: '診察室',
    areaColor: '#dcfce7',
    machines: [
      { id: 'm-con', name: 'BTX\nhy BNLS', treatmentIds: ['t-06', 't-07', 't-08', 't-17'] },
    ],
  },
  {
    id: 'area-seikei',
    name: '整形診察室',
    areaColor: '#d9f99d',
    machines: [
      { id: 'm-sei', name: '診察', treatmentIds: ['t-17'] },
    ],
  },
  {
    id: 'area-1f-frac',
    name: '1F',
    areaColor: '#fef9c3',
    machines: [
      { id: 'm-moz', name: 'モザイク\nヒーライト', treatmentIds: ['t-10', 't-11'] },
    ],
  },
  {
    id: 'area-2f-pico',
    name: '2F',
    areaColor: '#fce7f3',
    machines: [
      { id: 'm-pic', name: 'ピコシュア\nエリート' },
    ],
  },
  {
    id: 'area-2f-misc',
    name: '2F',
    areaColor: '#ede9fe',
    machines: [
      { id: 'm-med', name: 'メディオスター' },
      { id: 'm-sp2', name: 'スペクトラ' },
      { id: 'm-art', name: 'アートメイク' },
      { id: 'm-met', name: 'メタトロン' },
    ],
  },
];

// ---------------------------------------------------------------------------
// 機械名→施術ID マッピング（GAS API 取得時に treatmentIds が付かない場合の補完）
// ---------------------------------------------------------------------------
const MACHINE_TREATMENT_RULES: Array<{ keywords: string[]; ids: string[] }> = [
  { keywords: ['Vビーム', 'スペクトラ', 'マイセル'], ids: ['t-20', 't-15', 't-19', 't-05'] },
  { keywords: ['BTX', 'BNLS'],                       ids: ['t-06', 't-07', 't-08', 't-17'] },
  { keywords: ['モザイク', 'ヒーライト'],             ids: ['t-10', 't-11'] },
  { keywords: ['診察'],                              ids: ['t-17'] },
];

/**
 * エリア配列の表示順を正規化する（GAS API の返却順＝シート順に依存しない）。
 * 既知エリアは AREA_ORDER の順、未知エリアはその後ろ、2F系は右端。
 */
const AREA_ORDER = ['1F脱毛エリア', 'Ope室', '診察室', '整形診察室', '1F'];

export function sortMachineAreas(areas: MachineArea[]): MachineArea[] {
  const rank = (a: MachineArea) => {
    const i = AREA_ORDER.indexOf(a.name);
    if (i !== -1) return i;
    return a.name.includes('2F') ? 100 : AREA_ORDER.length;
  };
  return [...areas].sort((a, b) => rank(a) - rank(b));
}

/**
 * 機械の treatmentIds を解決する。
 * machine.treatmentIds が設定されていれば優先し、なければ機械名のキーワードで補完する。
 */
export function resolveTreatmentIds(machine: Machine): string[] | undefined {
  if (machine.treatmentIds && machine.treatmentIds.length > 0) return machine.treatmentIds;
  const rule = MACHINE_TREATMENT_RULES.find(r => r.keywords.every(k => machine.name.includes(k)));
  return rule?.ids;
}

export const ALL_MACHINES = MACHINE_AREAS.flatMap(a => a.machines);

// ---------------------------------------------------------------------------
// Time slots
// ---------------------------------------------------------------------------
function generateSlots(startH: number, startM: number, endH: number, endM: number): string[] {
  const slots: string[] = [];
  let h = startH, m = startM;
  while (h < endH || (h === endH && m <= endM)) {
    slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    m += 15;
    if (m >= 60) { m -= 60; h++; }
  }
  return slots;
}

export const MORNING_SLOTS   = generateSlots(9,  0, 12, 45);
export const AFTERNOON_SLOTS = generateSlots(13, 0, 20, 0);

// ---------------------------------------------------------------------------
// Treatment master  ※ 施術種別 (変更頻度低 → フロントで保持)
// ---------------------------------------------------------------------------
export const mockTreatments: Treatment[] = [
  { id: 't-01', name: '脱毛（全身）',             shortName: '全身脱毛',   defaultDurationSlots: 8,  color: '#dbeafe' },
  { id: 't-02', name: '脱毛（VIO）',              shortName: 'VIO脱毛',   defaultDurationSlots: 4,  color: '#bfdbfe' },
  { id: 't-03', name: '脱毛（顔・うなじ）',        shortName: '顔脱毛',     defaultDurationSlots: 2,  color: '#93c5fd' },
  { id: 't-04', name: 'ピコレーザー',              shortName: 'ピコ',       defaultDurationSlots: 3,  color: '#fbcfe8' },
  { id: 't-05', name: 'Vビーム',                  shortName: 'Vビーム',    defaultDurationSlots: 2,  color: '#fecaca' },
  { id: 't-06', name: 'ボトックス',               shortName: 'BTX',        defaultDurationSlots: 2,  color: '#bbf7d0' },
  { id: 't-07', name: 'ヒアルロン酸',              shortName: 'hy',         defaultDurationSlots: 2,  color: '#86efac' },
  { id: 't-08', name: 'BNLS',                     shortName: 'BNLS',       defaultDurationSlots: 2,  color: '#6ee7b7' },
  { id: 't-09', name: 'フォトフェイシャル',         shortName: 'フォト',     defaultDurationSlots: 2,  color: '#fed7aa' },
  { id: 't-10', name: 'モザイクレーザー',           shortName: 'モザイク',   defaultDurationSlots: 4,  color: '#fde68a' },
  { id: 't-11', name: 'ヒーライト',               shortName: 'ヒーライト',  defaultDurationSlots: 4,  color: '#fef08a' },
  { id: 't-12', name: 'アートメイク（眉）',         shortName: 'AM眉',       defaultDurationSlots: 8,  color: '#ddd6fe' },
  { id: 't-13', name: 'アートメイク（アイライン）', shortName: 'AMアイ',     defaultDurationSlots: 8,  color: '#c4b5fd' },
  { id: 't-14', name: 'メタトロン',               shortName: 'メタトロン',  defaultDurationSlots: 4,  color: '#bae6fd' },
  { id: 't-15', name: 'スペクトラ（Qスイッチ）',   shortName: 'スペクトラ',  defaultDurationSlots: 2,  color: '#fef9c3' },
  { id: 't-16', name: 'メディオスター',            shortName: 'メディオ',    defaultDurationSlots: 2,  color: '#d1fae5' },
  { id: 't-17', name: '診察',                     shortName: '診察',        defaultDurationSlots: 2,  color: '#f1f5f9' },
  { id: 't-18', name: 'ケミカルピーリング',         shortName: 'ピーリング',  defaultDurationSlots: 2,  color: '#fce7f3' },
  { id: 't-19', name: 'マイセル',                  shortName: 'マイセル',    defaultDurationSlots: 2,  color: '#ffe4e6' },
  { id: 't-20', name: 'エコ2',                     shortName: 'エコ2',       defaultDurationSlots: 2,  color: '#ffd6e0' },
];

// ---------------------------------------------------------------------------
// Staff  ※ GAS API 未接続時のフォールバック
// ---------------------------------------------------------------------------
export const mockScheduleStaff: ScheduleStaff[] = [
  { id: 'ss-1', name: 'スタッフA', color: '#bfdbfe' },
  { id: 'ss-2', name: 'スタッフB', color: '#bbf7d0' },
  { id: 'ss-3', name: 'スタッフC', color: '#fde68a' },
];
