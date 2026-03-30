import type { Reservation, Room, Equipment, Staff, Service, Patient } from '../types';

const TODAY = '2026-03-30';

export const mockRooms: Room[] = [
  { id: 'm-vel', name: 'ベロシティ',                   area: '1F脱毛エリア', areaColor: '#dbeafe', isActive: true },
  { id: 'm-cla', name: 'クラリティ',                   area: '1F脱毛エリア', areaColor: '#dbeafe', isActive: true },
  { id: 'm-gen', name: 'ジェントル',                   area: '1F脱毛エリア', areaColor: '#dbeafe', isActive: true },
  { id: 'm-vec', name: 'ベクタス',                     area: '1F脱毛エリア', areaColor: '#dbeafe', isActive: true },
  { id: 'm-pic', name: 'ピコシュアエリート',            area: '2F',           areaColor: '#fce7f3', isActive: true },
  { id: 'm-ope', name: 'Vビームマイセル/エコ2/スペクトラ', area: 'Ope室',      areaColor: '#fee2e2', isActive: true },
  { id: 'm-con', name: 'BTX hy BNLS',                 area: '診察室',       areaColor: '#dcfce7', isActive: true },
  { id: 'm-moz', name: 'モザイク/ヒーライト',           area: '1F',           areaColor: '#fef9c3', isActive: true },
  { id: 'm-med', name: 'メディオスター',               area: '2F',           areaColor: '#ede9fe', isActive: true },
  { id: 'm-sp2', name: 'スペクトラ',                   area: '2F',           areaColor: '#ede9fe', isActive: true },
  { id: 'm-art', name: 'アートメイク',                 area: '2F',           areaColor: '#ede9fe', isActive: true },
  { id: 'm-met', name: 'メタトロン',                   area: '2F',           areaColor: '#ede9fe', isActive: true },
];

export const mockEquipment: Equipment[] = [
  { id: 'eq-yag', name: 'YAGレーザー', description: '脱毛・シミ治療用', isActive: true },
  { id: 'eq-ipl', name: 'IPL機器', description: 'フォトフェイシャル用', isActive: true },
];

export const mockStaff: Staff[] = [
  { id: 'ss-1', name: 'スタッフA', email: 'a@clinic.example', color: '#bfdbfe', isActive: true },
  { id: 'ss-2', name: 'スタッフB', email: 'b@clinic.example', color: '#bbf7d0', isActive: true },
  { id: 'ss-3', name: 'スタッフC', email: 'c@clinic.example', color: '#fde68a', isActive: true },
];

export const mockServices: Service[] = [
  { id: 'sv-facial',  name: 'フェイシャルトリートメント', durationMinutes: 60,  requiresEquipmentId: '',       price: 8000,  isActive: true },
  { id: 'sv-laser',  name: 'レーザー脱毛 (顔)',          durationMinutes: 30,  requiresEquipmentId: 'eq-yag', price: 15000, isActive: true },
  { id: 'sv-photo',  name: 'フォトフェイシャル',          durationMinutes: 45,  requiresEquipmentId: 'eq-ipl', price: 12000, isActive: true },
  { id: 'sv-botox',  name: 'ボトックス注射',              durationMinutes: 30,  requiresEquipmentId: '',       price: 20000, isActive: true },
  { id: 'sv-peel',   name: 'ケミカルピーリング',          durationMinutes: 40,  requiresEquipmentId: '',       price: 6000,  isActive: true },
];

export const mockPatients: Patient[] = [
  { id: 'pt-1',  lineUserId: 'U001', name: '佐藤 良子', phone: '090-1111-0001', email: 'sato@example.com' },
  { id: 'pt-2',  lineUserId: 'U002', name: '中村 恵',   phone: '090-1111-0002', email: 'nakamura@example.com' },
  { id: 'pt-3',  lineUserId: 'U003', name: '木村 美穂', phone: '090-1111-0003', email: 'kimura@example.com' },
  { id: 'pt-4',  lineUserId: 'U004', name: '高橋 夏美', phone: '090-1111-0004', email: 'takahashi@example.com' },
  { id: 'pt-5',  lineUserId: 'U005', name: '小林 優子', phone: '090-1111-0005', email: 'kobayashi@example.com' },
  { id: 'pt-6',  lineUserId: 'U006', name: '渡辺 智子', phone: '090-1111-0006', email: 'watanabe@example.com' },
  { id: 'pt-7',  lineUserId: 'U007', name: '伊藤 真理', phone: '090-1111-0007', email: 'ito@example.com' },
  { id: 'pt-8',  lineUserId: 'U008', name: '加藤 葉子', phone: '090-1111-0008', email: 'kato@example.com' },
];

function dt(time: string): string {
  return `${TODAY}T${time}:00+09:00`;
}

export const mockReservations: Reservation[] = [
  {
    id: 'r-01', patientId: 'pt-1', patientName: '佐藤 良子',
    serviceId: 'sv-facial',  serviceName: 'フェイシャルトリートメント',
    roomId: 'room-a', roomName: '施術室A', equipmentId: '',
    staffId: 'st-1', staffName: '田中 美咲',
    startAt: dt('10:00'), endAt: dt('11:00'), status: 'confirmed', note: '',
  },
  {
    id: 'r-02', patientId: 'pt-2', patientName: '中村 恵',
    serviceId: 'sv-laser', serviceName: 'レーザー脱毛 (顔)',
    roomId: 'room-b', roomName: '施術室B', equipmentId: 'eq-yag',
    staffId: 'st-2', staffName: '鈴木 花子',
    startAt: dt('10:00'), endAt: dt('10:30'), status: 'confirmed', note: '',
  },
  {
    id: 'r-03', patientId: 'pt-3', patientName: '木村 美穂',
    serviceId: 'sv-photo', serviceName: 'フォトフェイシャル',
    roomId: 'room-c', roomName: '施術室C', equipmentId: 'eq-ipl',
    staffId: 'st-3', staffName: '山田 さくら',
    startAt: dt('10:30'), endAt: dt('11:15'), status: 'confirmed', note: '',
  },
  {
    id: 'r-04', patientId: 'pt-4', patientName: '高橋 夏美',
    serviceId: 'sv-botox', serviceName: 'ボトックス注射',
    roomId: 'room-a', roomName: '施術室A', equipmentId: '',
    staffId: 'st-1', staffName: '田中 美咲',
    startAt: dt('11:00'), endAt: dt('11:30'), status: 'confirmed', note: '初回施術',
  },
  {
    id: 'r-05', patientId: 'pt-5', patientName: '小林 優子',
    serviceId: 'sv-facial', serviceName: 'フェイシャルトリートメント',
    roomId: 'room-b', roomName: '施術室B', equipmentId: '',
    staffId: 'st-2', staffName: '鈴木 花子',
    startAt: dt('11:30'), endAt: dt('12:30'), status: 'confirmed', note: '',
  },
  {
    id: 'r-06', patientId: 'pt-6', patientName: '渡辺 智子',
    serviceId: 'sv-peel', serviceName: 'ケミカルピーリング',
    roomId: 'room-c', roomName: '施術室C', equipmentId: '',
    staffId: 'st-3', staffName: '山田 さくら',
    startAt: dt('12:00'), endAt: dt('12:40'), status: 'confirmed', note: '',
  },
  {
    id: 'r-07', patientId: 'pt-7', patientName: '伊藤 真理',
    serviceId: 'sv-laser', serviceName: 'レーザー脱毛 (顔)',
    roomId: 'room-a', roomName: '施術室A', equipmentId: 'eq-yag',
    staffId: 'st-1', staffName: '田中 美咲',
    startAt: dt('13:00'), endAt: dt('13:30'), status: 'confirmed', note: '',
  },
  {
    id: 'r-08', patientId: 'pt-8', patientName: '加藤 葉子',
    serviceId: 'sv-botox', serviceName: 'ボトックス注射',
    roomId: 'room-b', roomName: '施術室B', equipmentId: '',
    staffId: 'st-2', staffName: '鈴木 花子',
    startAt: dt('13:30'), endAt: dt('14:00'), status: 'confirmed', note: '',
  },
  {
    id: 'r-09', patientId: 'pt-1', patientName: '佐藤 良子',
    serviceId: 'sv-photo', serviceName: 'フォトフェイシャル',
    roomId: 'room-c', roomName: '施術室C', equipmentId: 'eq-ipl',
    staffId: 'st-3', staffName: '山田 さくら',
    startAt: dt('13:30'), endAt: dt('14:15'), status: 'confirmed', note: '2回目',
  },
  {
    id: 'r-10', patientId: 'pt-2', patientName: '中村 恵',
    serviceId: 'sv-facial', serviceName: 'フェイシャルトリートメント',
    roomId: 'room-a', roomName: '施術室A', equipmentId: '',
    staffId: 'st-1', staffName: '田中 美咲',
    startAt: dt('14:30'), endAt: dt('15:30'), status: 'confirmed', note: '',
  },
  {
    id: 'r-11', patientId: 'pt-3', patientName: '木村 美穂',
    serviceId: 'sv-laser', serviceName: 'レーザー脱毛 (顔)',
    roomId: 'room-b', roomName: '施術室B', equipmentId: 'eq-yag',
    staffId: 'st-2', staffName: '鈴木 花子',
    startAt: dt('15:00'), endAt: dt('15:30'), status: 'cancelled', note: '患者都合によりキャンセル',
  },
  {
    id: 'r-12', patientId: 'pt-4', patientName: '高橋 夏美',
    serviceId: 'sv-photo', serviceName: 'フォトフェイシャル',
    roomId: 'room-a', roomName: '施術室A', equipmentId: 'eq-ipl',
    staffId: 'st-3', staffName: '山田 さくら',
    startAt: dt('16:00'), endAt: dt('16:45'), status: 'confirmed', note: '',
  },
  {
    id: 'r-13', patientId: 'pt-5', patientName: '小林 優子',
    serviceId: 'sv-peel', serviceName: 'ケミカルピーリング',
    roomId: 'room-b', roomName: '施術室B', equipmentId: '',
    staffId: 'st-2', staffName: '鈴木 花子',
    startAt: dt('16:00'), endAt: dt('16:40'), status: 'confirmed', note: '',
  },
  {
    id: 'r-14', patientId: 'pt-6', patientName: '渡辺 智子',
    serviceId: 'sv-facial', serviceName: 'フェイシャルトリートメント',
    roomId: 'room-c', roomName: '施術室C', equipmentId: '',
    staffId: 'st-1', staffName: '田中 美咲',
    startAt: dt('17:00'), endAt: dt('18:00'), status: 'confirmed', note: '',
  },
  {
    id: 'r-15', patientId: 'pt-7', patientName: '伊藤 真理',
    serviceId: 'sv-botox', serviceName: 'ボトックス注射',
    roomId: 'room-a', roomName: '施術室A', equipmentId: '',
    staffId: 'st-3', staffName: '山田 さくら',
    startAt: dt('17:30'), endAt: dt('18:00'), status: 'pending', note: '要確認',
  },
];
