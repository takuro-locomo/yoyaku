import { useState, useMemo } from 'react';
import { usePatients, useUpsertPatient, usePatientReservations } from '../api/hooks';
import type { Patient, Reservation } from '../types';

// ---------------------------------------------------------------------------
// 患者追加・編集モーダル
// ---------------------------------------------------------------------------

interface PatientModalProps {
  patient: Patient | null; // null = 新規
  onClose: () => void;
  onSave: (data: Record<string, unknown>) => void;
  isSaving: boolean;
}

function PatientModal({ patient, onClose, onSave, isSaving }: PatientModalProps) {
  const [form, setForm] = useState({
    name:      patient?.name      ?? '',
    phone:     patient?.phone     ?? '',
    email:     patient?.email     ?? '',
    birthDate: patient?.birthDate ?? '',
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data: Record<string, unknown> = { ...form };
    if (patient?.id) data.id = patient.id;
    // 既存患者のlineUserIdを保持
    if (patient?.lineUserId) data.lineUserId = patient.lineUserId;
    onSave(data);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold mb-4">
          {patient ? '患者情報の編集' : '新規患者の登録'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              氏名 <span className="text-red-500">*</span>
            </label>
            <input
              autoFocus
              required
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">電話番号</label>
            <input
              type="tel"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={form.phone}
              onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">メールアドレス</label>
            <input
              type="email"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">生年月日</label>
            <input
              type="date"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={form.birthDate}
              onChange={e => setForm(f => ({ ...f, birthDate: e.target.value }))}
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg border border-slate-300 hover:bg-slate-50"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {isSaving ? '保存中…' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 予約履歴ドロワー
// ---------------------------------------------------------------------------

interface HistoryDrawerProps {
  patient: Patient;
  onClose: () => void;
  onEdit: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  confirmed: '確定',
  pending:   '仮予約',
  cancelled: 'キャンセル',
};
const STATUS_COLOR: Record<string, string> = {
  confirmed: 'bg-green-100 text-green-700',
  pending:   'bg-yellow-100 text-yellow-700',
  cancelled: 'bg-slate-100 text-slate-500',
};

function fmtDateTime(iso: string) {
  if (!iso) return '';
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${d.getFullYear()}/${mm}/${dd} ${hh}:${min}`;
}

function HistoryDrawer({ patient, onClose, onEdit }: HistoryDrawerProps) {
  const { data: reservations, isLoading, isError } = usePatientReservations(patient.id);

  const sorted = useMemo(() => {
    if (!reservations) return [];
    return [...reservations].sort(
      (a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime()
    );
  }, [reservations]);

  return (
    <div className="fixed inset-0 z-40 flex">
      {/* backdrop */}
      <div className="flex-1 bg-black/30" onClick={onClose} />
      {/* panel */}
      <div className="w-[480px] bg-white shadow-2xl flex flex-col h-full">
        {/* header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-semibold">{patient.name}</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {patient.phone && <span className="mr-3">{patient.phone}</span>}
              {patient.email && <span>{patient.email}</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onEdit}
              className="text-sm px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50"
            >
              編集
            </button>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 text-xl leading-none p-1"
            >
              ✕
            </button>
          </div>
        </div>

        {/* patient meta */}
        <div className="px-6 py-3 bg-slate-50 border-b border-slate-100 text-sm text-slate-600 flex gap-6">
          {patient.birthDate && (
            <span>生年月日: <strong>{patient.birthDate}</strong></span>
          )}
          {patient.createdAt && (
            <span>登録日: <strong>{patient.createdAt.slice(0, 10)}</strong></span>
          )}
          {patient.lineUserId && (
            <span className="text-xs text-indigo-600 bg-indigo-50 rounded px-1.5 py-0.5">LINE連携</span>
          )}
        </div>

        {/* reservation list */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">
            予約履歴
            {sorted.length > 0 && (
              <span className="ml-2 text-xs text-slate-400 font-normal">{sorted.length}件</span>
            )}
          </h3>

          {isLoading && (
            <p className="text-sm text-slate-400 py-8 text-center">読み込み中…</p>
          )}
          {isError && (
            <p className="text-sm text-red-500 py-8 text-center">予約履歴の取得に失敗しました</p>
          )}
          {!isLoading && !isError && sorted.length === 0 && (
            <p className="text-sm text-slate-400 py-8 text-center">予約履歴がありません</p>
          )}

          <ul className="space-y-3">
            {sorted.map((r: Reservation) => (
              <li key={r.id} className="border border-slate-200 rounded-lg p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{r.serviceName || r.serviceId}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {fmtDateTime(r.startAt)} 〜 {fmtDateTime(r.endAt)}
                    </p>
                    <p className="text-xs text-slate-500">
                      {r.staffName && <span>担当: {r.staffName}</span>}
                      {r.roomName && <span className="ml-2">部屋: {r.roomName}</span>}
                    </p>
                    {r.note && <p className="text-xs text-slate-400 mt-1">{r.note}</p>}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${STATUS_COLOR[r.status] ?? 'bg-slate-100 text-slate-500'}`}>
                    {STATUS_LABEL[r.status] ?? r.status}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// メインページ
// ---------------------------------------------------------------------------

function fmtDate(iso?: string) {
  if (!iso) return '';
  return iso.slice(0, 10);
}

export default function Patients() {
  const { data: patients, isLoading, isError, error } = usePatients();
  const upsert = useUpsertPatient();

  const [search, setSearch]           = useState('');
  const [modalOpen, setModalOpen]     = useState(false);
  const [editTarget, setEditTarget]   = useState<Patient | null>(null);
  const [drawerPatient, setDrawerPatient] = useState<Patient | null>(null);

  const filtered = useMemo(() => {
    if (!patients) return [];
    const q = search.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter(p => p.name.toLowerCase().includes(q));
  }, [patients, search]);

  function openAdd() {
    setEditTarget(null);
    setModalOpen(true);
  }

  function openEdit(p: Patient) {
    setDrawerPatient(null);
    setEditTarget(p);
    setModalOpen(true);
  }

  function handleSave(data: Record<string, unknown>) {
    upsert.mutate(data, {
      onSuccess: () => setModalOpen(false),
    });
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* ページヘッダー */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-slate-800">患者管理</h1>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700"
        >
          <span className="text-base leading-none">＋</span>
          新規患者を登録
        </button>
      </div>

      {/* エラーバナー */}
      {isError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          データの取得に失敗しました: {(error as Error)?.message}
        </div>
      )}
      {upsert.isError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          保存に失敗しました: {(upsert.error as Error)?.message}
        </div>
      )}

      {/* 検索バー */}
      <div className="mb-4">
        <input
          type="search"
          placeholder="患者名で検索…"
          className="w-full max-w-sm border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* テーブル */}
      {isLoading ? (
        <p className="text-sm text-slate-400 py-16 text-center">読み込み中…</p>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-left text-xs text-slate-500 uppercase tracking-wide">
                <th className="px-4 py-3 font-medium">氏名</th>
                <th className="px-4 py-3 font-medium">電話番号</th>
                <th className="px-4 py-3 font-medium">メールアドレス</th>
                <th className="px-4 py-3 font-medium">生年月日</th>
                <th className="px-4 py-3 font-medium">登録日</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                    {search ? '検索結果がありません' : '患者が登録されていません'}
                  </td>
                </tr>
              )}
              {filtered.map(p => (
                <tr
                  key={p.id}
                  className="hover:bg-slate-50 cursor-pointer transition-colors"
                  onClick={() => setDrawerPatient(p)}
                >
                  <td className="px-4 py-3 font-medium text-slate-800">
                    <span className="flex items-center gap-2">
                      {p.name}
                      {p.lineUserId && (
                        <span className="text-xs bg-green-100 text-green-700 rounded px-1.5 py-0.5 leading-none">LINE</span>
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{p.phone || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{p.email || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{p.birthDate || '—'}</td>
                  <td className="px-4 py-3 text-slate-500">{fmtDate(p.createdAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={e => { e.stopPropagation(); openEdit(p); }}
                      className="text-xs px-2.5 py-1 rounded border border-slate-300 hover:bg-slate-100 text-slate-600"
                    >
                      編集
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length > 0 && (
            <div className="px-4 py-2 border-t border-slate-100 text-xs text-slate-400">
              {filtered.length}名
            </div>
          )}
        </div>
      )}

      {/* 患者追加・編集モーダル */}
      {modalOpen && (
        <PatientModal
          patient={editTarget}
          onClose={() => setModalOpen(false)}
          onSave={handleSave}
          isSaving={upsert.isPending}
        />
      )}

      {/* 予約履歴ドロワー */}
      {drawerPatient && (
        <HistoryDrawer
          patient={drawerPatient}
          onClose={() => setDrawerPatient(null)}
          onEdit={() => openEdit(drawerPatient)}
        />
      )}
    </div>
  );
}
