import { useState, useEffect } from 'react';
import type { Room, Equipment, Staff, Service } from '../types';

type Tab = 'rooms' | 'equipment' | 'staff' | 'services';

type ResourceData = Partial<Room & Equipment & Staff & Service>;

interface Props {
  open: boolean;
  tab: Tab;
  data: ResourceData | null; // null = new
  onClose: () => void;
  onSave: (data: ResourceData) => void;
  onDelete: (id: string) => void;
}

const AREA_COLORS = [
  { label: '青', value: '#dbeafe' },
  { label: 'ピンク', value: '#fce7f3' },
  { label: '赤', value: '#fee2e2' },
  { label: '緑', value: '#dcfce7' },
  { label: '黄', value: '#fef9c3' },
  { label: '紫', value: '#ede9fe' },
  { label: 'グレー', value: '#f1f5f9' },
];

const STAFF_COLORS = [
  '#bfdbfe', '#bbf7d0', '#fde68a', '#fecaca', '#ddd6fe', '#fbcfe8', '#fed7aa',
];

export default function ResourceModal({ open, tab, data, onClose, onSave, onDelete }: Props) {
  const isEdit = !!data?.id;

  // Shared
  const [name, setName] = useState('');
  const [isActive, setIsActive] = useState(true);

  // Room
  const [area, setArea] = useState('');
  const [areaColor, setAreaColor] = useState('#dbeafe');

  // Equipment
  const [description, setDescription] = useState('');

  // Staff
  const [email, setEmail] = useState('');
  const [color, setColor] = useState('#bfdbfe');

  // Service
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [price, setPrice] = useState(0);

  useEffect(() => {
    if (!open) return;
    if (data) {
      setName(data.name ?? '');
      setIsActive(data.isActive !== false);
      setArea((data as Room).area ?? '');
      setAreaColor((data as Room).areaColor ?? '#dbeafe');
      setDescription((data as Equipment).description ?? '');
      setEmail((data as Staff).email ?? '');
      setColor((data as Staff).color ?? '#bfdbfe');
      setDurationMinutes((data as Service).durationMinutes ?? 30);
      setPrice((data as Service).price ?? 0);
    } else {
      setName('');
      setIsActive(true);
      setArea('');
      setAreaColor('#dbeafe');
      setDescription('');
      setEmail('');
      setColor('#bfdbfe');
      setDurationMinutes(30);
      setPrice(0);
    }
  }, [open, data]);

  const handleSave = () => {
    if (!name.trim()) return;
    const base: ResourceData = { name: name.trim(), isActive };
    if (data?.id) base.id = data.id;

    switch (tab) {
      case 'rooms':
        onSave({ ...base, area, areaColor });
        break;
      case 'equipment':
        onSave({ ...base, description });
        break;
      case 'staff':
        onSave({ ...base, email, color });
        break;
      case 'services':
        onSave({ ...base, durationMinutes, price });
        break;
    }
    onClose();
  };

  if (!open) return null;

  const tabLabel: Record<Tab, string> = {
    rooms: '部屋', equipment: '機械', staff: 'スタッフ', services: 'サービス',
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-[420px] max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-slate-800 mb-5">
          {isEdit ? `${tabLabel[tab]}を編集` : `${tabLabel[tab]}を追加`}
        </h2>

        <div className="space-y-4">
          {/* Name (all) */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              名称 <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              autoFocus
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200 transition-all"
            />
          </div>

          {/* Room fields */}
          {tab === 'rooms' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">エリア</label>
                <input
                  type="text"
                  value={area}
                  onChange={e => setArea(e.target.value)}
                  placeholder="例: 1F脱毛エリア"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400 transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">エリアカラー</label>
                <div className="flex gap-2">
                  {AREA_COLORS.map(c => (
                    <button
                      key={c.value}
                      onClick={() => setAreaColor(c.value)}
                      className={`w-8 h-8 rounded-lg border-2 transition-all ${
                        areaColor === c.value ? 'border-indigo-500 scale-110' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: c.value }}
                      title={c.label}
                    />
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Equipment fields */}
          {tab === 'equipment' && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">説明</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={2}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400 transition-all resize-none"
              />
            </div>
          )}

          {/* Staff fields */}
          {tab === 'staff' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">メールアドレス</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400 transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">表示カラー</label>
                <div className="flex gap-2">
                  {STAFF_COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => setColor(c)}
                      className={`w-8 h-8 rounded-lg border-2 transition-all ${
                        color === c ? 'border-indigo-500 scale-110' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Service fields */}
          {tab === 'services' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">所要時間 (分)</label>
                <input
                  type="number"
                  min={5}
                  step={5}
                  value={durationMinutes}
                  onChange={e => setDurationMinutes(Number(e.target.value))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400 transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">料金 (円)</label>
                <input
                  type="number"
                  min={0}
                  step={100}
                  value={price}
                  onChange={e => setPrice(Number(e.target.value))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400 transition-all"
                />
              </div>
            </>
          )}

          {/* isActive toggle (edit only) */}
          {isEdit && (
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => setIsActive(!isActive)}
                className={`relative w-10 h-6 rounded-full transition-colors ${
                  isActive ? 'bg-green-400' : 'bg-slate-300'
                }`}
              >
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  isActive ? 'left-[18px]' : 'left-0.5'
                }`} />
              </button>
              <span className="text-sm text-slate-600">{isActive ? '有効' : '無効'}</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 mt-6">
          {isEdit && (
            <button
              onClick={() => { onDelete(data!.id!); onClose(); }}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
            >
              削除
            </button>
          )}
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
          >
            キャンセル
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim()}
            className="px-5 py-2 rounded-lg text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            {isEdit ? '保存' : '追加'}
          </button>
        </div>
      </div>
    </div>
  );
}
