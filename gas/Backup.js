/**
 * Backup.gs - スプレッドシートの自動バックアップと復元
 *
 * 目的:
 *   1. 週1回 (+ 毎日) スプレッドシート全体を別フォルダに複製して保管する
 *   2. スプレッドシートが消えた / 大量の不正な予約が投入された場合に、
 *      任意の時点のバックアップへ巻き戻す
 *
 * Script Properties:
 *   SPREADSHEET_ID         - 本体スプレッドシート (既存)
 *   LINE_ACTIVITY_LOG_SSID - LINE行動ログ側のスプレッドシート (既存・あれば一緒に複製する)
 *   BACKUP_FOLDER_ID    - バックアップ保管フォルダ。未設定なら自動作成する
 *   BACKUP_ADMIN_TOKEN  - 復元APIの合言葉。未設定の場合、復元は常に拒否される
 *   BACKUP_ALERT_EMAIL  - 異常検知メールの宛先 (未設定なら実行ユーザー宛)
 *   ANOMALY_THRESHOLD   - 24時間の新規予約が何件を超えたら警告するか (既定 60)
 *
 * Webアプリは ANYONE_ANONYMOUS 公開のため、破壊的な復元は必ず
 * BACKUP_ADMIN_TOKEN と confirm='RESTORE' の二重確認を要求する。
 */

const Backup = (() => {

  const LOG_SHEET   = '_backups';
  const LOG_HEADERS = ['id','fileId','fileName','fileUrl','lineFileId','lineFileUrl',
                       'type','createdAt','rowCounts','note','deletedAt'];

  // 本体スプレッドシート内のデータシート。_backups 自身は履歴を失うため対象外。
  const DATA_SHEETS = ['reservations','scheduleReservations','patientReservations',
                       'patients','rooms','equipment','staff','services','history'];

  // 既定の復元対象。history (操作履歴) は「誰がいつ何を入れたか」の記録なので、
  // 巻き戻しても残るよう既定から外している (明示指定すれば復元できる)。
  const DEFAULT_RESTORE_SHEETS = DATA_SHEETS.filter(n => n !== 'history');

  // 種別ごとの保管本数。超えた分は古い順にゴミ箱へ移動する (30日間は復元可能)。
  const KEEP = { weekly: 12, daily: 14, manual: 20, 'pre-restore': 10 };

  const FOLDER_NAME    = 'clinic-system バックアップ';
  const DEFAULT_ANOMALY_THRESHOLD = 60;

  // ---------------------------------------------------------------------------
  // 内部ユーティリティ
  // ---------------------------------------------------------------------------

  function _props() {
    return PropertiesService.getScriptProperties();
  }

  function _ss() {
    const id = _props().getProperty('SPREADSHEET_ID');
    if (!id) throw new Error('Script Properties に SPREADSHEET_ID が設定されていません');
    return SpreadsheetApp.openById(id);
  }

  /**
   * LINE行動ログ側のスプレッドシートID。
   * ログ・ステージ管理・テンプレートは本体とは別ファイルに入っているため、
   * 消失に備えてこちらも同時に複製する。未作成なら null。
   */
  function _lineSsId() {
    return _props().getProperty('LINE_ACTIVITY_LOG_SSID') || null;
  }

  function _now() {
    return new Date().toISOString();
  }

  /** ファイル名用のタイムスタンプ (JST) */
  function _stamp() {
    return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd_HHmm');
  }

  /** シート値・ISO文字列のどちらでも Date にする。パースできなければ null */
  function _toDate(value) {
    if (!value) return null;
    if (Object.prototype.toString.call(value) === '[object Date]') return value;
    const d = new Date(String(value));
    return isNaN(d.getTime()) ? null : d;
  }

  /** バックアップ保管フォルダ。無ければ作成して ID を保存する */
  function _getFolder() {
    const props = _props();
    const id = props.getProperty('BACKUP_FOLDER_ID');
    if (id) {
      try {
        const folder = DriveApp.getFolderById(id);
        if (!folder.isTrashed()) return folder;
      } catch (err) {
        // 削除済み等。作り直す。
      }
    }
    const folder = DriveApp.createFolder(FOLDER_NAME);
    props.setProperty('BACKUP_FOLDER_ID', folder.getId());
    return folder;
  }

  /** バックアップ台帳シート。無ければヘッダー付きで作成する */
  function _logSheet() {
    const ss = _ss();
    let sheet = ss.getSheetByName(LOG_SHEET);
    if (!sheet) {
      sheet = ss.insertSheet(LOG_SHEET);
      sheet.getRange(1, 1, 1, LOG_HEADERS.length).setValues([LOG_HEADERS]);
      const header = sheet.getRange(1, 1, 1, LOG_HEADERS.length);
      header.setFontWeight('bold');
      header.setBackground('#4A86E8');
      header.setFontColor('#FFFFFF');
      sheet.setFrozenRows(1);
      sheet.hideSheet();
    }
    return sheet;
  }

  /** 台帳を新しい順のオブジェクト配列で返す */
  function _readLog() {
    const sheet = _logSheet();
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];

    const values = sheet.getRange(2, 1, lastRow - 1, LOG_HEADERS.length).getValues();
    const records = values.map((row, i) => {
      const rec = {};
      LOG_HEADERS.forEach((h, idx) => { rec[h] = row[idx]; });
      rec._rowIndex = i + 2;
      rec.createdAt = rec.createdAt
        ? (_toDate(rec.createdAt) ? _toDate(rec.createdAt).toISOString() : String(rec.createdAt))
        : '';
      try {
        rec.rowCounts = rec.rowCounts ? JSON.parse(rec.rowCounts) : {};
      } catch (err) {
        rec.rowCounts = {};
      }
      return rec;
    });
    return records.reverse();
  }

  function _findLog(backupId) {
    const rec = _readLog().find(r => String(r.id) === String(backupId));
    if (!rec) throw new Error(`バックアップ ${backupId} が台帳に見つかりません`);
    return rec;
  }

  /** 各データシートの件数 (ヘッダー行を除く) */
  function _countRows(ss) {
    const counts = {};
    DATA_SHEETS.forEach(name => {
      const sheet = ss.getSheetByName(name);
      if (sheet) counts[name] = Math.max(0, sheet.getLastRow() - 1);
    });
    return counts;
  }

  function _assertAdmin(token) {
    const expected = _props().getProperty('BACKUP_ADMIN_TOKEN');
    if (!expected) {
      throw new Error('BACKUP_ADMIN_TOKEN が未設定のため復元できません。GASのスクリプトプロパティに設定してください');
    }
    if (String(token || '') !== expected) {
      throw new Error('管理トークンが違います');
    }
  }

  // ---------------------------------------------------------------------------
  // バックアップ作成
  // ---------------------------------------------------------------------------

  /**
   * ロックを取らない本体。ロック済みの処理 (restore) から呼ぶ。
   * @param {string} type - weekly | daily | manual | pre-restore
   */
  function _createInternal(type, note) {
    const ss = _ss();
    SpreadsheetApp.flush(); // 書き込み途中の内容を確定させてから複製する

    const folder   = _getFolder();
    const fileName = `clinic-backup_${_stamp()}_${type}`;
    const copy = DriveApp.getFileById(ss.getId()).makeCopy(fileName, folder);

    // LINE行動ログ側 (別ファイル) も同じタイミングで複製する
    let lineCopy = null;
    const lineId = _lineSsId();
    if (lineId) {
      try {
        lineCopy = DriveApp.getFileById(lineId).makeCopy(`${fileName}_line`, folder);
      } catch (err) {
        Logger.log('LINE行動ログの複製に失敗: ' + err.message);
      }
    }

    const record = {
      id:          Utilities.getUuid(),
      fileId:      copy.getId(),
      fileName:    fileName,
      fileUrl:     copy.getUrl(),
      lineFileId:  lineCopy ? lineCopy.getId()  : '',
      lineFileUrl: lineCopy ? lineCopy.getUrl() : '',
      type:      type,
      createdAt: _now(),
      rowCounts: _countRows(ss),
      note:      note || '',
      deletedAt: '',
    };

    _logSheet().appendRow(LOG_HEADERS.map(h =>
      h === 'rowCounts' ? JSON.stringify(record.rowCounts) : record[h]
    ));

    _applyRetention(type);
    return record;
  }

  /**
   * バックアップを1件作成する。
   * @param {string} type - weekly | daily | manual | pre-restore
   * @param {string} [note]
   */
  function create(type, note) {
    if (!KEEP[type]) throw new Error(`不明なバックアップ種別: ${type}`);
    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      return _createInternal(type, note);
    } finally {
      lock.releaseLock();
    }
  }

  /** 保管本数を超えた同種のバックアップをゴミ箱へ移す */
  function _applyRetention(type) {
    const keep = KEEP[type] || 12;
    const alive = _readLog().filter(r => r.type === type && !r.deletedAt); // 新しい順
    const sheet = _logSheet();
    const deletedAtCol = LOG_HEADERS.indexOf('deletedAt') + 1;

    alive.slice(keep).forEach(rec => {
      [rec.fileId, rec.lineFileId].filter(Boolean).forEach(fileId => {
        try {
          DriveApp.getFileById(fileId).setTrashed(true);
        } catch (err) {
          Logger.log(`保管期限切れファイルの削除に失敗 (${fileId}): ${err.message}`);
        }
      });
      sheet.getRange(rec._rowIndex, deletedAtCol).setValue(_now());
    });
  }

  // ---------------------------------------------------------------------------
  // 参照
  // ---------------------------------------------------------------------------

  /**
   * バックアップ一覧 (新しい順)。
   * @param {number} [limit=30]
   */
  function list(limit) {
    const max = Number(limit) > 0 ? Number(limit) : 30;
    return _readLog().slice(0, max).map(rec => ({
      id:        rec.id,
      fileId:    rec.fileId,
      fileName:  rec.fileName,
      fileUrl:   rec.fileUrl,
      lineFileUrl: rec.lineFileUrl || '',
      type:      rec.type,
      createdAt: rec.createdAt,
      rowCounts: rec.rowCounts,
      note:      rec.note,
      available: !rec.deletedAt,
    }));
  }

  /** 稼働状況: 自動バックアップの有無・最終バックアップ・現在の件数 */
  function status() {
    const records = _readLog().filter(r => !r.deletedAt);
    const latestOf = type => {
      const rec = records.find(r => r.type === type);
      return rec ? rec.createdAt : null;
    };
    const triggers = ScriptApp.getProjectTriggers()
      .map(t => t.getHandlerFunction())
      .filter(fn => fn === 'weeklyBackup' || fn === 'dailyBackup');

    let folderUrl = '';
    try { folderUrl = _getFolder().getUrl(); } catch (err) { folderUrl = ''; }

    return {
      latestBackupAt:   records.length ? records[0].createdAt : null,
      latestWeeklyAt:   latestOf('weekly'),
      latestDailyAt:    latestOf('daily'),
      backupCount:      records.length,
      autoBackupOn:     triggers.indexOf('weeklyBackup') !== -1,
      dailyBackupOn:    triggers.indexOf('dailyBackup') !== -1,
      restoreEnabled:   !!_props().getProperty('BACKUP_ADMIN_TOKEN'),
      lineBackupOn:     !!_lineSsId(),
      folderUrl:        folderUrl,
      currentRowCounts: _countRows(_ss()),
    };
  }

  /**
   * 現在のデータとバックアップの件数差分。復元前の確認に使う。
   */
  function diff(backupId) {
    const rec = _findLog(backupId);
    if (rec.deletedAt) throw new Error('このバックアップは保管期限切れで削除されています');

    const backupSs = SpreadsheetApp.openById(rec.fileId);
    const current  = _countRows(_ss());
    const backup   = _countRows(backupSs);

    const names = DATA_SHEETS.filter(n => n in current || n in backup);
    return {
      backupId:  rec.id,
      createdAt: rec.createdAt,
      fileName:  rec.fileName,
      sheets: names.map(name => {
        const cur = current[name] || 0;
        const bak = backup[name] || 0;
        return { sheet: name, current: cur, backup: bak, delta: bak - cur };
      }),
    };
  }

  // ---------------------------------------------------------------------------
  // 復元
  // ---------------------------------------------------------------------------

  /**
   * バックアップの内容で本体スプレッドシートを上書きする。
   *
   * 実行前に必ず pre-restore バックアップを自動取得するので、
   * 「戻しすぎた」場合も直前の状態に戻せる。
   *
   * @param {object} params
   * @param {string} params.backupId
   * @param {string} params.confirm  - 'RESTORE' 固定
   * @param {string} params.token    - BACKUP_ADMIN_TOKEN
   * @param {string} [params.sheets] - 復元対象シート名のCSV。省略時は全データシート
   */
  function restore(params) {
    params = params || {};
    if (String(params.confirm) !== 'RESTORE') {
      throw new Error("復元するには confirm='RESTORE' が必要です");
    }
    _assertAdmin(params.token);

    const rec = _findLog(params.backupId);
    if (rec.deletedAt) throw new Error('このバックアップは保管期限切れで削除されています');

    const requested = params.sheets
      ? String(params.sheets).split(',').map(s => s.trim()).filter(Boolean)
      : DEFAULT_RESTORE_SHEETS.slice();
    const invalid = requested.filter(n => DATA_SHEETS.indexOf(n) === -1);
    if (invalid.length) throw new Error(`復元できないシートです: ${invalid.join(', ')}`);

    const lock = LockService.getScriptLock();
    lock.waitLock(60000);
    try {
      const backupSs = SpreadsheetApp.openById(rec.fileId);

      // 巻き戻しすぎたときの保険を先に取る
      const safety = _createInternal('pre-restore', `${rec.fileName} への復元直前の状態`);

      const ss = _ss();
      const restored = [];

      requested.forEach(name => {
        const src = backupSs.getSheetByName(name);
        if (!src) return; // バックアップ時点に存在しなかったシートは触らない

        const lastRow = src.getLastRow();
        const lastCol = src.getLastColumn();
        const values  = (lastRow >= 1 && lastCol >= 1)
          ? src.getRange(1, 1, lastRow, lastCol).getValues()
          : [];

        let dest = ss.getSheetByName(name);
        if (!dest) dest = ss.insertSheet(name);

        dest.clearContents();
        if (values.length) {
          if (dest.getMaxRows()    < values.length)    dest.insertRowsAfter(dest.getMaxRows(), values.length - dest.getMaxRows());
          if (dest.getMaxColumns() < values[0].length) dest.insertColumnsAfter(dest.getMaxColumns(), values[0].length - dest.getMaxColumns());
          dest.getRange(1, 1, values.length, values[0].length).setValues(values);
        }
        restored.push({ sheet: name, rows: Math.max(0, values.length - 1) });
      });

      SpreadsheetApp.flush();

      return {
        restoredFrom:   { id: rec.id, fileName: rec.fileName, createdAt: rec.createdAt },
        safetyBackupId: safety.id,
        safetyBackupAt: safety.createdAt,
        sheets:         restored,
      };
    } finally {
      lock.releaseLock();
    }
  }

  // ---------------------------------------------------------------------------
  // 異常検知 (大量登録の早期発見)
  // ---------------------------------------------------------------------------

  /**
   * 直近24時間の新規予約が閾値を超えていたら管理者にメールする。
   * 週1バックアップだけでは気づくのが遅れるため、毎日の見張り役として使う。
   */
  function checkAnomaly() {
    const threshold = Number(_props().getProperty('ANOMALY_THRESHOLD')) || DEFAULT_ANOMALY_THRESHOLD;
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const counts = {};
    let total = 0;
    ['reservations', 'scheduleReservations', 'patientReservations'].forEach(name => {
      let rows;
      try {
        rows = SheetService.findAll(name);
      } catch (err) {
        return; // まだ作られていないシートは無視する
      }
      rows = rows.filter(r => {
        const created = _toDate(r.createdAt);
        return created && created >= since;
      });
      counts[name] = rows.length;
      total += rows.length;
    });

    if (total <= threshold) return { alerted: false, total: total, counts: counts, threshold: threshold };

    const latest = _readLog().filter(r => !r.deletedAt)[0];
    const to = _props().getProperty('BACKUP_ALERT_EMAIL') || Session.getEffectiveUser().getEmail();
    if (to) {
      MailApp.sendEmail({
        to: to,
        subject: `[予約システム] 24時間で ${total} 件の新規予約 — 確認してください`,
        body: [
          `直近24時間の新規登録が閾値 (${threshold}件) を超えました。`,
          '',
          Object.keys(counts).map(k => `  ${k}: ${counts[k]} 件`).join('\n'),
          '',
          latest
            ? `直近のバックアップ: ${latest.fileName} (${latest.createdAt})\n${latest.fileUrl}`
            : 'バックアップがまだありません。',
          '',
          '身に覚えのない大量登録であれば、管理画面の「バックアップ」から復元してください。',
        ].join('\n'),
      });
    }
    return { alerted: true, total: total, counts: counts, threshold: threshold, notifiedTo: to };
  }

  // ---------------------------------------------------------------------------
  // トリガー
  // ---------------------------------------------------------------------------

  /**
   * 自動バックアップのトリガーを設置する (再実行しても重複しない)。
   *   - 毎週月曜 3時台: 週次バックアップ
   *   - 毎日 4時台:     日次バックアップ + 大量登録の見張り
   */
  function installTriggers() {
    removeTriggers();
    ScriptApp.newTrigger('weeklyBackup').timeBased()
      .onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(3).create();
    ScriptApp.newTrigger('dailyBackup').timeBased()
      .everyDays(1).atHour(4).create();
    return status();
  }

  function removeTriggers() {
    ScriptApp.getProjectTriggers().forEach(t => {
      const fn = t.getHandlerFunction();
      if (fn === 'weeklyBackup' || fn === 'dailyBackup') ScriptApp.deleteTrigger(t);
    });
  }

  return {
    create, list, status, diff, restore, checkAnomaly,
    installTriggers, removeTriggers,
    DATA_SHEETS, DEFAULT_RESTORE_SHEETS,
  };
})();

// ---------------------------------------------------------------------------
// トリガー / 手動実行用のグローバル関数
// ---------------------------------------------------------------------------

/** 週次バックアップ (毎週月曜のトリガーから実行) */
function weeklyBackup() {
  const rec = Backup.create('weekly', '週次自動バックアップ');
  Logger.log('週次バックアップ完了: ' + rec.fileName);
}

/** 日次バックアップ + 大量登録の見張り (毎日のトリガーから実行) */
function dailyBackup() {
  const rec = Backup.create('daily', '日次自動バックアップ');
  Logger.log('日次バックアップ完了: ' + rec.fileName);
  try {
    const result = Backup.checkAnomaly();
    if (result.alerted) Logger.log('異常検知メールを送信しました: ' + JSON.stringify(result));
  } catch (err) {
    Logger.log('異常検知に失敗: ' + err.message);
  }
}

/** GASエディタから1度だけ実行して自動バックアップを有効化する */
function installBackupTriggers() {
  const s = Backup.installTriggers();
  Logger.log('自動バックアップを設定しました: ' + JSON.stringify(s));
}

/** 復元APIの合言葉を設定する (GASエディタから引数付きで実行) */
function setBackupAdminToken(token) {
  if (!token) throw new Error('引数 token が未指定です');
  PropertiesService.getScriptProperties().setProperty('BACKUP_ADMIN_TOKEN', token);
  Logger.log('BACKUP_ADMIN_TOKEN を設定しました');
}

/** 動作確認用: 手動で1件バックアップする */
function backupNow() {
  const rec = Backup.create('manual', 'GASエディタからの手動実行');
  Logger.log('バックアップ完了: ' + rec.fileName + ' / ' + rec.fileUrl);
}
