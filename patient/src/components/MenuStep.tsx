import { useState, useEffect } from 'react';
import { gasGet } from '../api/gasClient';
import type { Menu } from '../types';

interface Props {
  onNext: (menu: Menu) => void;
}

export default function MenuStep({ onNext }: Props) {
  const [menus, setMenus]   = useState<Menu[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState('');

  useEffect(() => {
    setLoading(true);
    gasGet<Menu[]>('getPatientMenus')
      .then(setMenus)
      .catch(() => setError('メニューの取得に失敗しました。時間をおいて再度お試しください。'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-rose-200 border-t-rose-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500 text-sm mb-4">{error}</p>
        <button
          onClick={() => { setError(''); setLoading(true); gasGet<Menu[]>('getPatientMenus').then(setMenus).catch(() => setError('取得に失敗しました。')).finally(() => setLoading(false)); }}
          className="text-rose-600 font-medium text-sm underline"
        >
          再試行
        </button>
      </div>
    );
  }

  return (
    <div>
      <h2 className="font-bold text-stone-800 text-lg mb-1">メニューを選択</h2>
      <p className="text-stone-400 text-sm mb-5">ご希望の施術をお選びください</p>
      <div className="space-y-3">
        {menus.map(m => (
          <button
            key={m.id}
            onClick={() => onNext(m)}
            className="w-full bg-white rounded-2xl p-4 shadow-sm border border-stone-100 text-left
                       hover:border-rose-200 hover:shadow-md active:scale-[0.98] transition-all"
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-stone-800">{m.name}</span>
              <span className="text-xs text-stone-400 bg-stone-50 rounded-full px-2 py-0.5">
                {m.durationMin}分
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
