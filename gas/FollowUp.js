/**
 * FollowUp.gs - LINE追いかけ配信（営業メッセージの直接送信）
 *
 * 「ユーザー別サマリー」からグループ（追いかけ★／アクティブ上位50・100・150人）を作り、
 * multicastでメッセージを直接送る。スマホ用ページ(?page=line)から操作する。
 * チェックを外した人には送らない（個別送信＝月200通の節約用）。
 *
 * 保護: ScriptProperties(LINE_CONSOLE_PIN) のPINが一致しないと一覧も送信も不可。
 * 記録: 同じスプレッドシートの「配信ログ」シートに全送信を記録する。
 * 注意: 無料プランは月200通まで（1回の送信で送信人数分を消費）。
 * 母数: 行動ログ(2026-07-02開始)に現れたユーザーだけが対象。時間とともに増える。
 */

const FollowUp = (() => {

  const SHEET_SUMMARY = 'ユーザー別サマリー';
  const SHEET_SENDLOG = '配信ログ';
  // ユーザー別サマリーの列位置（SegmentSummary.HEADERS と対応）
  const COL = {
    userId: 0, name: 1, last: 3, total: 4, reserveBtn: 5,
    cv: 12, blocked: 13, level: 14, interest: 15, followUp: 16,
    stage: 17, lastSend: 18, stageMemo: 19, stageManual: 20,
  };
  const NUM_COLS = 21;

  const GROUPS = {
    followup: { label: '追いかけ対象（色々見て予約ボタン→未予約）' },
    top50:    { label: 'アクティブ上位50人',  n: 50 },
    top100:   { label: 'アクティブ上位100人', n: 100 },
    top150:   { label: 'アクティブ上位150人', n: 150 },
    // ステージ別
    stage_new:       { label: 'ステージ: 新規',     stage: '新規' },
    stage_untouched: { label: 'ステージ: 反応待ち', stage: '反応待ち' },
    stage_connected: { label: 'ステージ: 反応あり', stage: '反応あり' },
    stage_converted: { label: 'ステージ: 予約済み', stage: '予約済み' },
    stage_recycle:   { label: 'ステージ: 休眠',     stage: '休眠' },
    stage_archive:   { label: 'ステージ: 対象外',   stage: '対象外' },
  };

  function _props() { return PropertiesService.getScriptProperties(); }

  function _checkPin(pin) {
    var saved = _props().getProperty('LINE_CONSOLE_PIN');
    if (!saved) throw new Error('PINが未設定です。初回セットアップ(action=setupLineDaily)を先に実行してください。');
    if (String(pin) !== String(saved)) throw new Error('PINが違います。');
  }

  function _ss() {
    var id = _props().getProperty('LINE_ACTIVITY_LOG_SSID');
    if (!id) throw new Error('行動ログのスプレッドシートが未作成です。');
    return SpreadsheetApp.openById(id);
  }

  function _fmt(d) {
    return (d instanceof Date) ? Utilities.formatDate(d, 'Asia/Tokyo', 'M/d HH:mm') : String(d || '');
  }

  /** サマリーを再集計して全行を返す（最終アクティブの新しい順・ブロック除外前） */
  function _rows() {
    SegmentSummary.update();
    var sheet = _ss().getSheetByName(SHEET_SUMMARY);
    if (!sheet || sheet.getLastRow() < 2) return [];
    return sheet.getRange(2, 1, sheet.getLastRow() - 1, NUM_COLS).getValues();
  }

  function _toUser(r) {
    return {
      userId: r[COL.userId],
      name: r[COL.name] || '(名前なし)',
      lastActive: _fmt(r[COL.last]),
      reserveClicks: r[COL.reserveBtn] || 0,
      level: r[COL.level] || '',
      interest: r[COL.interest] || '',
      star: r[COL.followUp] === '★',
      stage: r[COL.stage] || '',
      lastSend: _fmt(r[COL.lastSend]),
      stageMemo: r[COL.stageMemo] || '',
      stageManual: r[COL.stageManual] === 1,
    };
  }

  /** 全ステージの人数（ブロック含む全員が母数） */
  function _stageCounts(rows) {
    var counts = {};
    Stage.STAGES.forEach(function (s) { counts[s] = 0; });
    rows.forEach(function (r) {
      var s = r[COL.stage];
      if (counts[s] !== undefined) counts[s]++;
    });
    return counts;
  }

  /**
   * グループの一覧を返す。
   * group: 'followup'（★のみ・現行条件） / 'top50' / 'top100' / 'top150'
   *        （top系＝ブロック以外を最終アクティブの新しい順に上位N人）
   */
  function getList(pin, group) {
    _checkPin(pin);
    group = GROUPS[group] ? group : 'followup';
    var rows = _rows();
    var alive = rows.filter(function (r) { return r[COL.blocked] !== 1; });  // ブロック除外
    var g = GROUPS[group];
    var picked;
    if (g.stage) {
      // ステージ別。「対象外」だけはブロック済みも含めて表示（確認用）
      var base = (g.stage === '対象外') ? rows : alive;
      picked = base.filter(function (r) { return r[COL.stage] === g.stage; });
    } else if (group === 'followup') {
      picked = alive.filter(function (r) { return r[COL.followUp] === '★'; });
    } else {
      picked = alive.slice(0, g.n);   // サマリーは最終アクティブ降順
    }
    return {
      group: group,
      groupLabel: g.label,
      groupStage: g.stage || '',   // ステージ別グループのときのステージ名
      totalLogged: alive.length,   // 母数（ログに現れたブロック以外の全員）
      count: picked.length,
      users: picked.map(_toUser),
      stageCounts: _stageCounts(rows),
      stages: Stage.STAGES,
      templates: Templates.list(),
    };
  }

  /** 手動ステージ変更（'（自動）'で自動判定に戻す） */
  function setStage(pin, userId, name, stage, memo) {
    _checkPin(pin);
    return Stage.setManual(userId, name, stage, memo);
  }

  /** 文面テンプレート保存（同じステージ+タイトルは上書き） */
  function saveTemplate(pin, stage, title, body) {
    _checkPin(pin);
    return Templates.save(stage, title, body);
  }

  /**
   * 指定したuserIdの人だけに送信（チェックを外した人には送らない）。
   * userIds はサマリーに実在しブロックでない人だけに絞ってから送る。
   */
  function send(text, pin, userIds, groupLabel) {
    _checkPin(pin);
    text = String(text || '').trim();
    if (!text) throw new Error('メッセージが空です。');
    if (text.length > 1000) throw new Error('メッセージが長すぎます（1000文字まで）。');
    if (!userIds || !userIds.length) throw new Error('送信先が選ばれていません。');
    var token = _props().getProperty('LINE_CHANNEL_ACCESS_TOKEN');
    if (!token) throw new Error('LINE_CHANNEL_ACCESS_TOKEN が未設定です。');

    // 実在＆ブロック以外＆「対象外」ステージ以外のIDだけに絞る（名前も配信ログ用に取る）
    var byId = {};
    _rows().forEach(function (r) {
      if (r[COL.blocked] !== 1 && r[COL.stage] !== '対象外') {
        byId[r[COL.userId]] = r[COL.name] || '(名前なし)';
      }
    });
    var targets = userIds.filter(function (id) { return byId[id]; });
    if (!targets.length) throw new Error('有効な送信先がありません（ブロック済み・対象外ステージ等）。');

    var errors = [];
    for (var i = 0; i < targets.length; i += 500) {   // multicastは1回500人まで
      var res = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/multicast', {
        method: 'post',
        contentType: 'application/json',
        headers: { Authorization: 'Bearer ' + token },
        payload: JSON.stringify({ to: targets.slice(i, i + 500), messages: [{ type: 'text', text: text }] }),
        muteHttpExceptions: true,
      });
      if (res.getResponseCode() !== 200) {
        errors.push(res.getResponseCode() + ': ' + res.getContentText().slice(0, 200));
      }
    }

    var ok = errors.length === 0;
    var names = targets.map(function (id) { return byId[id]; });
    var logSheet = _ss().getSheetByName(SHEET_SENDLOG) || _ss().insertSheet(SHEET_SENDLOG);
    if (logSheet.getLastRow() === 0) {
      logSheet.getRange(1, 1, 1, 6)
        .setValues([['日時', 'グループ', '送信人数', '結果', '本文', '送信先(表示名)']]).setFontWeight('bold');
      logSheet.setFrozenRows(1);
    }
    logSheet.appendRow([
      new Date(), groupLabel || '', targets.length,
      ok ? 'OK' : 'エラー: ' + errors.join(' / '), text, names.join('、'),
    ]);
    if (ok) {
      // 個人単位の配信履歴（ステージの「反応待ち」判定に使う）
      try { Stage.recordSends(targets, byId, groupLabel); } catch (e) {
        Logger.log('[FollowUp] recordSends failed (ignored): ' + e.message);
      }
    }
    if (!ok) throw new Error('送信でエラーが発生しました: ' + errors.join(' / '));
    return { sent: targets.length, names: names };
  }

  /** 初回セットアップ: PIN保存＋毎朝6時台の自動集計トリガー作成（何度呼んでも安全） */
  function setup(pin) {
    if (!pin) throw new Error('pin を指定してください。');
    var saved = _props().getProperty('LINE_CONSOLE_PIN');
    if (saved && String(pin) !== String(saved)) throw new Error('PINが違います。');
    if (!saved) _props().setProperty('LINE_CONSOLE_PIN', String(pin));
    ScriptApp.getProjectTriggers().forEach(function (t) {
      if (t.getHandlerFunction() === 'updateLineUserSummary') ScriptApp.deleteTrigger(t);
    });
    ScriptApp.newTrigger('updateLineUserSummary').timeBased().everyDays(1).atHour(6).create();
    return { pinSet: true, trigger: '毎日6〜7時に updateLineUserSummary を実行' };
  }

  return { getList: getList, send: send, setup: setup, setStage: setStage, saveTemplate: saveTemplate };
})();

// --- スマホ用ページ(?page=line)の google.script.run から呼ばれる ---
function lineConsoleGetList(pin, group) { return FollowUp.getList(pin, group); }
function lineConsoleSend(text, pin, userIds, groupLabel) { return FollowUp.send(text, pin, userIds, groupLabel); }
function lineConsoleSetStage(pin, userId, name, stage, memo) { return FollowUp.setStage(pin, userId, name, stage, memo); }
function lineConsoleSaveTemplate(pin, stage, title, body) { return FollowUp.saveTemplate(pin, stage, title, body); }

/** GASエディタから手動セットアップする用（'ここにPIN' を書き換えて実行） */
function setupLineDailyFromEditor() {
  Logger.log(JSON.stringify(FollowUp.setup('ここにPIN')));
}

/** エディタから実行: 権限承認＋毎朝6時台の自動集計トリガー作成（PIN不要） */
function authorizeAndCreateDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'updateLineUserSummary') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('updateLineUserSummary').timeBased().everyDays(1).atHour(6).create();
  Logger.log('トリガー作成OK: 毎日6〜7時に updateLineUserSummary を自動実行');
}
