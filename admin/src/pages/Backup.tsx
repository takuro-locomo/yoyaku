import { useState } from 'react';
import dayjs from 'dayjs';
import {
  useBackups, useBackupStatus, useBackupDiff, useCreateBackup, useRestoreBackup,
  type BackupRecord,
} from '../api/hooks';

const TOKEN_KEY = 'clinic.backupAdminToken';

// history (操作履歴) は「誰がいつ何を入れたか」の記録なので復元で巻き戻さない
const KEEP_ON_RESTORE = ['history'];

const SHEET_LABEL: Record<string, string> = {
  reservations:         '予約',
  scheduleReservations: '予約表',
  patientReservations:  '患者からの予約',
  history:              '操作履歴',
  patients:             '患者',
  rooms:                '部屋',
  equipment:            '機械',
  staff:                'スタッフ',
  services:             'メニュー',
};

const TYPE_LABEL: Record<BackupRecord['type'], { text: string; className: string }> = {
  weekly:        { text: '週次',   className: 'bg-indigo-100 text-indigo-700' },
  daily:         { text: '日次',   className: 'bg-sky-100 text-sky-700' },
  manual:        { text: '手動',   className: 'bg-slate-100 text-slate-700' },
  'pre-restore': { text: '復元直前', className: 'bg-amber-100 text-amber-700' },
};

const fmt = (iso: string | null) => (iso ? dayjs(iso).format('YYYY/MM/DD HH:mm') : '—');

function Card({ label, value, sub, tone = 'normal' }: {
  label: string; value: string; sub?: string; tone?: 'normal' | 'warn';
}) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${
      tone === 'warn' ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'
    }`}>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-lg font-bold mt-0.5 ${tone === 'warn' ? 'text-amber-700' : 'text-slate-800'}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function Backup() {
  const [target,  setTarget]  = useState<BackupRecord | null>(null);
  const [token,   setToken]   = useState(() => localStorage.getItem(TOKEN_KEY) ?? '');
  const [confirm, setConfirm] = useState('');

  const { data: status }                  = useBackupStatus();
  const { data: backups, isLoading, error } = useBackups();
  const { data: diff, isLoading: diffLoading } = useBackupDiff(target?.id ?? null);
  const createBackup  = useCreateBackup();
  const restoreBackup = useRestoreBackup();

  const closeModal = () => {
    setTarget(null);
    setConfirm('');
    restoreBackup.reset();
  };

  const runRestore = () => {
    if (!target) return;
    localStorage.setItem(TOKEN_KEY, token);
    restoreBackup.mutate({ backupId: target.id, token });
  };

  const totalRows = (rec: BackupRecord) =>
    (rec.rowCounts?.reservations ?? 0) + (rec.rowCounts?.scheduleReservations ?? 0);

  return (
    <div className="flex flex-col h-full">
      {/* ── Toolbar ── */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-100 bg-white shrink-0 flex-wrap">
        <h1 className="text-xl font-bold text-slate-800">バックアップ</h1>
        <p className="text-xs text-slate-400">週1回 + 毎日、自動でスプレッドシートを丸ごと複製します</p>

        <div className="ml-auto flex items-center gap-2">
          {status?.folderUrl && (
            <a
              href={status.folderUrl} target="_blank" rel="noreferrer"
              className="text-sm text-indigo-600 hover:underline px-2"
            >
              📁 保管フォルダ
            </a>
          )}
          <button
            onClick={() => createBackup.mutate(undefined)}
            disabled={createBackup.isPending}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            {createBackup.isPending ? '作成中…' : '💾 今すぐバックアップ'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-5 space-y-4">
        {/* ── 状態サマリ ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card label="最終バックアップ" value={fmt(status?.latestBackupAt ?? null)}
                sub={status ? `保管 ${status.backupCount} 件` : undefined} />
          <Card label="自動バックアップ"
                value={status?.autoBackupOn ? '稼働中' : '未設定'}
                sub={status?.dailyBackupOn ? '週次 + 日次' : '週次のみ'}
                tone={status && !status.autoBackupOn ? 'warn' : 'normal'} />
          <Card label="現在の予約件数"
                value={String(
                  (status?.currentRowCounts?.reservations ?? 0) +
                  (status?.currentRowCounts?.scheduleReservations ?? 0),
                )}
                sub="予約 + 予約表" />
          <Card label="復元機能"
                value={status?.restoreEnabled ? '利用可' : 'ロック中'}
                sub={status?.restoreEnabled ? '管理トークンが必要' : 'BACKUP_ADMIN_TOKEN 未設定'}
                tone={status && !status.restoreEnabled ? 'warn' : 'normal'} />
        </div>

        {status && !status.autoBackupOn && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            自動バックアップのトリガーが未設定です。GASエディタで <code className="font-mono">installBackupTriggers()</code> を1度実行してください。
          </div>
        )}

        {createBackup.isError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            バックアップに失敗しました: {(createBackup.error as Error).message}
          </div>
        )}

        {/* ── 一覧 ── */}
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs">
              <tr>
                <th className="text-left  font-medium px-4 py-2.5">取得日時</th>
                <th className="text-left  font-medium px-4 py-2.5">種別</th>
                <th className="text-right font-medium px-4 py-2.5">予約件数</th>
                <th className="text-left  font-medium px-4 py-2.5">メモ</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">読み込み中…</td></tr>
              )}
              {error && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-red-600">
                  取得に失敗しました: {(error as Error).message}
                </td></tr>
              )}
              {backups?.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  バックアップがまだありません。「今すぐバックアップ」で1件目を作成してください。
                </td></tr>
              )}
              {backups?.map(rec => (
                <tr key={rec.id} className={rec.available ? '' : 'opacity-40'}>
                  <td className="px-4 py-2.5 text-slate-700 whitespace-nowrap">{fmt(rec.createdAt)}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_LABEL[rec.type]?.className ?? 'bg-slate-100 text-slate-700'}`}>
                      {TYPE_LABEL[rec.type]?.text ?? rec.type}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{totalRows(rec)}</td>
                  <td className="px-4 py-2.5 text-slate-500 text-xs">{rec.note}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    {rec.available ? (
                      <>
                        <a href={rec.fileUrl} target="_blank" rel="noreferrer"
                           className="text-xs text-slate-500 hover:text-slate-800 hover:underline mr-3">
                          中身を見る
                        </a>
                        {rec.lineFileUrl && (
                          <a href={rec.lineFileUrl} target="_blank" rel="noreferrer"
                             className="text-xs text-slate-500 hover:text-slate-800 hover:underline mr-3">
                            LINE分
                          </a>
                        )}
                        <button
                          onClick={() => setTarget(rec)}
                          className="text-xs font-medium text-red-600 hover:text-red-700 border border-red-200 hover:border-red-300 rounded-lg px-3 py-1.5 transition-colors"
                        >
                          この時点に戻す
                        </button>
                      </>
                    ) : (
                      <span className="text-xs text-slate-400">保管期限切れ</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed">
          {status?.lineBackupOn
            ? 'LINE行動ログ・ステージ管理は別スプレッドシートのため、同じタイミングで別ファイルとして複製しています (「LINE分」リンク)。こちらの復元は、複製をコピーして LINE_ACTIVITY_LOG_SSID を差し替えてください。'
            : 'LINE行動ログのスプレッドシートは未作成のため、バックアップ対象は予約データのみです。'}<br />
          保管本数: 週次12本 / 日次14本 / 手動20本。超えた分は自動でゴミ箱に移動します (Driveのゴミ箱に30日間残ります)。<br />
          復元すると、そのバックアップ以降に入った予約は消えます。実行直前の状態は「復元直前」バックアップとして自動保存されるので、戻しすぎた場合はそこから戻せます。
        </p>
      </div>

      {/* ── 復元モーダル ── */}
      {target && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-auto">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-800">この時点に戻す</h2>
              <p className="text-xs text-slate-500 mt-0.5">{fmt(target.createdAt)} のバックアップ</p>
            </div>

            {restoreBackup.isSuccess ? (
              <div className="px-5 py-5 space-y-3">
                <p className="text-sm text-green-700 font-medium">復元しました。</p>
                <ul className="text-sm text-slate-600 space-y-0.5">
                  {restoreBackup.data.sheets.map(s => (
                    <li key={s.sheet}>{SHEET_LABEL[s.sheet] ?? s.sheet}: {s.rows} 件</li>
                  ))}
                </ul>
                <p className="text-xs text-slate-400">
                  復元直前の状態も {fmt(restoreBackup.data.safetyBackupAt)} のバックアップとして保存済みです。
                </p>
                <button onClick={closeModal}
                        className="w-full bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium py-2.5 rounded-lg">
                  閉じる
                </button>
              </div>
            ) : (
              <div className="px-5 py-4 space-y-4">
                {/* 差分プレビュー */}
                <div>
                  <p className="text-xs font-medium text-slate-500 mb-1.5">復元後の件数</p>
                  {diffLoading && <p className="text-sm text-slate-400">確認中…</p>}
                  {diff && (
                    <table className="w-full text-sm border border-slate-200 rounded-lg overflow-hidden">
                      <thead className="bg-slate-50 text-xs text-slate-500">
                        <tr>
                          <th className="text-left  font-medium px-3 py-1.5">データ</th>
                          <th className="text-right font-medium px-3 py-1.5">現在</th>
                          <th className="text-right font-medium px-3 py-1.5">復元後</th>
                          <th className="text-right font-medium px-3 py-1.5">増減</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {diff.sheets.map(s => {
                          const kept = KEEP_ON_RESTORE.includes(s.sheet);
                          return (
                            <tr key={s.sheet}>
                              <td className="px-3 py-1.5 text-slate-700">{SHEET_LABEL[s.sheet] ?? s.sheet}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">{s.current}</td>
                              {kept ? (
                                <td colSpan={2} className="px-3 py-1.5 text-right text-xs text-slate-400">
                                  そのまま残す
                                </td>
                              ) : (
                                <>
                                  <td className="px-3 py-1.5 text-right tabular-nums text-slate-800 font-medium">{s.backup}</td>
                                  <td className={`px-3 py-1.5 text-right tabular-nums ${
                                    s.delta < 0 ? 'text-red-600' : s.delta > 0 ? 'text-green-600' : 'text-slate-400'
                                  }`}>
                                    {s.delta > 0 ? `+${s.delta}` : s.delta}
                                  </td>
                                </>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>

                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-xs text-red-700">
                  現在のデータはこのバックアップの内容で上書きされます。マイナス表示の分の予約は消えます。
                </div>

                <div className="space-y-2">
                  <label className="block">
                    <span className="text-xs font-medium text-slate-500">管理トークン</span>
                    <input
                      type="password" value={token} onChange={e => setToken(e.target.value)}
                      className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                      placeholder="BACKUP_ADMIN_TOKEN"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-500">確認のため <code className="font-mono">RESTORE</code> と入力</span>
                    <input
                      value={confirm} onChange={e => setConfirm(e.target.value)}
                      className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono"
                      placeholder="RESTORE"
                    />
                  </label>
                </div>

                {restoreBackup.isError && (
                  <p className="text-sm text-red-600">{(restoreBackup.error as Error).message}</p>
                )}

                <div className="flex gap-2 pt-1">
                  <button onClick={closeModal}
                          className="flex-1 border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-medium py-2.5 rounded-lg">
                    キャンセル
                  </button>
                  <button
                    onClick={runRestore}
                    disabled={confirm !== 'RESTORE' || !token || restoreBackup.isPending}
                    className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
                  >
                    {restoreBackup.isPending ? '復元中…' : '復元を実行'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
