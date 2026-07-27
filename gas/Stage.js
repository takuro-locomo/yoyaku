/**
 * Stage.gs - LINE友だちのステージ管理（THE MODEL準拠・クリニック向け翻案）
 *
 * 6ステージ:
 *  新規       (New)               … ログに現れたが、まだ反応なし・こちらから配信もしていない
 *  反応待ち   (Working-Untouched) … こちらから配信したが、その後反応がない
 *  反応あり   (Working-Connected) … ボタン押下・自由入力などの反応がある（未予約）
 *  予約済み   (Convert)           … 予約フォームCVあり
 *  休眠       (Recycle)           … DORMANT_DAYS日以上反応なし → 再アプローチ対象
 *  対象外     (Archive)           … ブロック/削除、または手動除外（配信しない）
 *
 * 自動判定が基本。「ステージ管理」シートの手動上書きが最優先
 * （スマホページから変更、'（自動）'に戻すと自動判定に復帰）。
 * 「配信先履歴」シートに個人単位の配信記録を残し、「反応待ち」判定に使う。
 */

const Stage = (() => {

  const SHEET_MANUAL = 'ステージ管理';
  const SHEET_SENDHIST = '配信先履歴';

  const STAGES = ['新規', '反応待ち', '反応あり', '予約済み', '休眠', '対象外'];
  const DORMANT_DAYS = 90;   // この日数反応がなければ「休眠」（予約済みでも落とす＝リピート再アプローチ対象）

  function _ss() {
    var id = PropertiesService.getScriptProperties().getProperty('LINE_ACTIVITY_LOG_SSID');
    if (!id) throw new Error('行動ログのスプレッドシートが未作成です。');
    return SpreadsheetApp.openById(id);
  }

  function _sheet(name, headers) {
    var ss = _ss();
    var sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
    return sheet;
  }

  function _manualSheet() {
    return _sheet(SHEET_MANUAL, ['userId', '表示名', '手動ステージ', 'メモ', '更新日時']);
  }

  function _sendHistSheet() {
    return _sheet(SHEET_SENDHIST, ['日時', 'userId', '表示名', 'グループ']);
  }

  // -------------------------------------------------------------------------
  // 読み取り（SegmentSummaryの集計時に1回ずつ呼ぶ）
  // -------------------------------------------------------------------------

  /** {userId: {stage, memo}} 手動上書きの一覧（手動ステージが空の行は無視） */
  function getManualMap() {
    var sheet = _manualSheet();
    var map = {};
    if (sheet.getLastRow() < 2) return map;
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues().forEach(function (r) {
      var stage = String(r[2] || '').trim();
      if (r[0] && stage && STAGES.indexOf(stage) !== -1) {
        map[r[0]] = { stage: stage, memo: String(r[3] || '') };
      }
    });
    return map;
  }

  /** {userId: Date} こちらから最後に配信した日時 */
  function getLastSendMap() {
    var sheet = _sendHistSheet();
    var map = {};
    if (sheet.getLastRow() < 2) return map;
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues().forEach(function (r) {
      var date = r[0], userId = r[1];
      if (!userId || !(date instanceof Date)) return;
      if (!map[userId] || date > map[userId]) map[userId] = date;
    });
    return map;
  }

  /** {userId: Date} 「手動チャット」として記録された最後の送信日時 */
  function getLastManualSendMap() {
    var sheet = _sendHistSheet();
    var map = {};
    if (sheet.getLastRow() < 2) return map;
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues().forEach(function (r) {
      var date = r[0], userId = r[1], group = String(r[3] || '');
      if (!userId || !(date instanceof Date) || group !== '手動チャット') return;
      if (!map[userId] || date > map[userId]) map[userId] = date;
    });
    return map;
  }

  // -------------------------------------------------------------------------
  // 自動ステージ判定
  // -------------------------------------------------------------------------

  /**
   * u: { blocked, cv, last(Date), reactions } … SegmentSummaryの集計値
   * manualStage: 手動上書き（あれば最優先）
   * lastSendAt: こちらから最後に配信した日時（なければnull）
   */
  function compute(u, manualStage, lastSendAt, now) {
    if (manualStage) return manualStage;
    if (u.blocked) return '対象外';
    // 休眠はCVより先に判定する: 予約済みでも90日反応がなければ休眠に落とし、
    // リピート促進の再アプローチ対象にする（クリニックはリピートが生命線）
    var dormantLimit = new Date(now.getTime() - DORMANT_DAYS * 24 * 60 * 60 * 1000);
    if (u.last < dormantLimit) return '休眠';
    if (u.cv > 0) return '予約済み';
    if (lastSendAt && lastSendAt > u.last) return '反応待ち';
    if (u.reactions > 0) return '反応あり';
    return '新規';
  }

  // -------------------------------------------------------------------------
  // 書き込み
  // -------------------------------------------------------------------------

  /**
   * 手動ステージを設定。stage='（自動）'または空で解除（自動判定に戻す）。
   * memoがnull/undefinedのときは既存メモを保持する（UIからのステージ変更でメモを消さない）。
   */
  function setManual(userId, name, stage, memo) {
    if (!userId) throw new Error('userIdがありません。');
    stage = String(stage || '').trim();
    var isAuto = (!stage || stage === '（自動）');
    if (!isAuto && STAGES.indexOf(stage) === -1) {
      throw new Error('不明なステージです: ' + stage);
    }
    var sheet = _manualSheet();
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      var rowIndex = 0, existingMemo = '';
      if (sheet.getLastRow() >= 2) {
        var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues();
        for (var i = 0; i < rows.length; i++) {
          if (rows[i][0] === userId) {
            rowIndex = i + 2;
            existingMemo = String(rows[i][3] || '');
            break;
          }
        }
      }
      var newMemo = (memo == null) ? existingMemo : String(memo);
      var row = [userId, name || '', isAuto ? '' : stage, newMemo, new Date()];
      if (rowIndex) {
        sheet.getRange(rowIndex, 1, 1, 5).setValues([row]);
      } else if (!isAuto) {
        sheet.appendRow(row);
      }
    } finally {
      lock.releaseLock();
    }
    return { userId: userId, stage: isAuto ? '（自動）' : stage };
  }

  /** 配信履歴に追記（FollowUp.sendの成功後に呼ばれる） */
  function recordSends(userIds, namesById, groupLabel) {
    if (!userIds || !userIds.length) return;
    var now = new Date();
    var rows = userIds.map(function (id) {
      return [now, id, namesById[id] || '', groupLabel || ''];
    });
    var sheet = _sendHistSheet();
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 4).setValues(rows);
    } finally {
      lock.releaseLock();
    }
  }

  return {
    STAGES: STAGES,
    DORMANT_DAYS: DORMANT_DAYS,
    compute: compute,
    getManualMap: getManualMap,
    getLastSendMap: getLastSendMap,
    getLastManualSendMap: getLastManualSendMap,
    setManual: setManual,
    recordSends: recordSends,
  };
})();
