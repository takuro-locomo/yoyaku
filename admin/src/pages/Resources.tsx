import { useState } from 'react';
import { mockRooms, mockEquipment, mockStaff, mockServices } from '../mock/data';
import { useMasters, useUpsertRoom, useUpsertEquipment, useUpsertStaff, useUpsertService } from '../api/hooks';
import type { Room, Equipment, Staff, Service, ScheduleStaff } from '../types';
import ResourceModal from '../components/ResourceModal';

const FALLBACK_STAFF: ScheduleStaff[] = mockStaff.map(s => ({
  id: s.id, name: s.name, color: s.color ?? '#bfdbfe',
}));

type Tab = 'rooms' | 'equipment' | 'staff' | 'services';

const TABS: { id: Tab; label: string }[] = [
  { id: 'rooms',     label: '部屋' },
  { id: 'equipment', label: '機械' },
  { id: 'staff',     label: 'スタッフ' },
  { id: 'services',  label: 'サービス' },
];

function Badge({ active }: { active: boolean }) {
  return (
    <span className={`inline-block w-2 h-2 rounded-full ${active ? 'bg-green-400' : 'bg-slate-300'}`} />
  );
}

export default function Resources() {
  const [tab,           setTab]           = useState<Tab>('rooms');
  const [selectedStaff, setSelectedStaff] = useState<Set<string>>(new Set());

  const [modalOpen, setModalOpen] = useState(false);
  const [editingData, setEditingData] = useState<Record<string, unknown> | null>(null);

  const { data: masters } = useMasters();

  const [error, setError] = useState<string | null>(null);

  const mutationOpts = {
    onError: (err: Error) => { setError(err.message); },
    onSuccess: () => { setError(null); },
  };
  const upsertRoom      = useUpsertRoom();
  const upsertEquipment = useUpsertEquipment();
  const upsertStaff     = useUpsertStaff();
  const upsertService   = useUpsertService();

  const rooms     = masters?.rooms      ?? mockRooms;
  const equipment = masters?.equipment  ?? mockEquipment;
  const staff     = masters?.staff      ?? FALLBACK_STAFF;
  const services  = masters?.services   ?? mockServices;

  const toggleStaff = (id: string) => {
    setSelectedStaff(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const visibleStaff = selectedStaff.size === 0
    ? staff
    : staff.filter(s => selectedStaff.has(s.id));

  const openNew = () => {
    setEditingData(null);
    setModalOpen(true);
  };

  const openEdit = (record: Record<string, unknown>) => {
    setEditingData(record);
    setModalOpen(true);
  };

  const handleSave = (data: Record<string, unknown>) => {
    setError(null);
    switch (tab) {
      case 'rooms':      upsertRoom.mutate(data, mutationOpts);      break;
      case 'equipment':  upsertEquipment.mutate(data, mutationOpts);  break;
      case 'staff':      upsertStaff.mutate(data, mutationOpts);      break;
      case 'services':   upsertService.mutate(data, mutationOpts);    break;
    }
  };

  const handleDelete = (id: string) => {
    setError(null);
    switch (tab) {
      case 'rooms':      upsertRoom.mutate({ id, isActive: false }, mutationOpts);      break;
      case 'equipment':  upsertEquipment.mutate({ id, isActive: false }, mutationOpts);  break;
      case 'staff':      upsertStaff.mutate({ id, isActive: false }, mutationOpts);      break;
      case 'services':   upsertService.mutate({ id, isActive: false }, mutationOpts);    break;
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="print:hidden flex items-center gap-3 px-5 py-3 border-b border-slate-100 bg-white shrink-0 flex-wrap">
        <h1 className="text-xl font-bold text-slate-800 mr-2">マスタ管理</h1>

        <div className="flex items-center gap-2 ml-auto text-xs">
          <span className="text-slate-400">スタッフ絞込</span>
          <div className="flex gap-1">
            {staff.map(s => (
              <button
                key={s.id}
                onClick={() => { setTab('staff'); toggleStaff(s.id); }}
                className={`text-xs px-2 py-1 rounded-full text-slate-700 font-medium transition-all ${
                  selectedStaff.size === 0 || selectedStaff.has(s.id) ? 'opacity-100' : 'opacity-30'
                }`}
                style={{ backgroundColor: s.color ?? '#f1f5f9' }}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => window.print()}
          className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-800 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          印刷
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-red-50 border-b border-red-200 px-5 py-2 flex items-center gap-2 text-sm text-red-700 print:hidden">
          <span className="font-medium">保存エラー:</span> {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">×</button>
        </div>
      )}

      {/* Print header */}
      <div className="hidden print:block mb-3">
        <div className="flex items-center justify-between border-b-2 border-slate-800 pb-2">
          <h1 className="text-base font-bold">マスタ管理 — {TABS.find(t => t.id === tab)?.label}</h1>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 print:p-0">
        <div className="print:hidden flex justify-end mb-4">
          <button
            onClick={openNew}
            className="flex items-center gap-2 bg-indigo-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors font-medium"
          >
            <span>+</span> 新規追加
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-slate-100 print:hidden">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-5 py-3.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  tab === t.id
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div>
            {/* Rooms */}
            {tab === 'rooms' && (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-left">
                    {['名称', 'エリア', '状態', ''].map(h => (
                      <th key={h} className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rooms.map((r: Room) => (
                    <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-800">{r.name}</td>
                      <td className="px-4 py-3">
                        <span
                          className="text-xs px-2 py-0.5 rounded-full text-slate-700"
                          style={{ backgroundColor: r.areaColor ?? '#f1f5f9' }}
                        >
                          {r.area ?? '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1.5 text-xs">
                          <Badge active={r.isActive} />
                          {r.isActive ? '稼働中' : '停止中'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => openEdit(r as unknown as Record<string, unknown>)} className="text-xs text-indigo-600 hover:underline">編集</button>
                      </td>
                    </tr>
                  ))}
                  {rooms.length === 0 && (
                    <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400 text-sm">データがありません</td></tr>
                  )}
                </tbody>
              </table>
            )}

            {/* Equipment */}
            {tab === 'equipment' && (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-left">
                    {['機械名', '説明', '状態', ''].map(h => (
                      <th key={h} className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {equipment.map((eq: Equipment) => (
                    <tr key={eq.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-800">{eq.name}</td>
                      <td className="px-4 py-3 text-slate-500">{eq.description}</td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1.5 text-xs">
                          <Badge active={eq.isActive} />
                          {eq.isActive ? '稼働中' : '停止中'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => openEdit(eq as unknown as Record<string, unknown>)} className="text-xs text-indigo-600 hover:underline">編集</button>
                      </td>
                    </tr>
                  ))}
                  {equipment.length === 0 && (
                    <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400 text-sm">データがありません</td></tr>
                  )}
                </tbody>
              </table>
            )}

            {/* Staff */}
            {tab === 'staff' && (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-left">
                    {['名前', 'メール', '状態', ''].map(h => (
                      <th key={h} className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleStaff.map(s => (
                    <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-800">
                        <span className="flex items-center gap-2">
                          <span
                            className="inline-block w-3 h-3 rounded-sm"
                            style={{ backgroundColor: s.color ?? '#f1f5f9' }}
                          />
                          {s.name}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500">{'email' in s ? (s as Staff).email : '—'}</td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1.5 text-xs">
                          <Badge active={true} />
                          在籍
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => openEdit(s as unknown as Record<string, unknown>)} className="text-xs text-indigo-600 hover:underline">編集</button>
                      </td>
                    </tr>
                  ))}
                  {visibleStaff.length === 0 && (
                    <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400 text-sm">データがありません</td></tr>
                  )}
                </tbody>
              </table>
            )}

            {/* Services */}
            {tab === 'services' && (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-left">
                    {['サービス名', '所要時間', '料金', '状態', ''].map(h => (
                      <th key={h} className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {services.map((sv: Service) => (
                    <tr key={sv.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-800">{sv.name}</td>
                      <td className="px-4 py-3 text-slate-600">{sv.durationMinutes} 分</td>
                      <td className="px-4 py-3 text-slate-600">{Number(sv.price).toLocaleString()}</td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1.5 text-xs">
                          <Badge active={sv.isActive} />
                          {sv.isActive ? '提供中' : '停止中'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => openEdit(sv as unknown as Record<string, unknown>)} className="text-xs text-indigo-600 hover:underline">編集</button>
                      </td>
                    </tr>
                  ))}
                  {services.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400 text-sm">データがありません</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <ResourceModal
        open={modalOpen}
        tab={tab}
        data={editingData}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </div>
  );
}
