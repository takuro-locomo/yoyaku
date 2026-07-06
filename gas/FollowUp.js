/**
 * FollowUp.gs - LINE追いかけ配信（営業メッセージの直接送信）
 *
 * 「ユーザー別サマリー」の追いかけ対象（★=予約ボタンを押したがフォーム未返信）に
 * multicastでメッセージを直接送る。スマホ用ページ(?page=line)から操作する。
 *
 * 保護: ScriptProperties(LINE_CONSOLE_PIN) のPINが一致しないと一覧も送信も不可。
 * 記録: 同じスプレッドシートの「配信ログ」シートに全送信を記録する。
 * 注意: 無料プランは月200通まで（1回の送信で人数分を消費）。
 */

const FollowUp = (() => {

  const SHEET_SUMMARY = 'ユーザー別サマリー';
  const SHEET_SENDLOG = '配信ログ';
  // ユーザー別サマリーの列位置（SegmentSummary.HEADERS と対応）
  const COL = { userId: 0, name: 1, last: 3, reserveBtn: 5, followUp: 16 };

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

  /** 追いかけ対象（★）の一覧。呼ぶたびにサマリーを再集計してから読む */
  function getList(pin) {
    _checkPin(pin);
    SegmentSummary.update();
    var sheet = _ss().getSheetByName(SHEET_SUMMARY);
    if (!sheet || sheet.getLastRow() < 2) return { count: 0, users: [] };
    var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 17).getValues();
    var users = rows.filter(function (r) { return r[COL.followUp] === '★'; })
      .map(function (r) {
        return {
          userId: r[COL.userId],
          name: r[COL.name] || '(名前なし)',
          lastActive: _fmt(r[COL.last]),
          reserveClicks: r[COL.reserveBtn] || 0,
        };
      });
    return { count: users.length, users: users };
  }

  /** 追いかけ対象の全員にテキストを multicast 送信し、配信ログに記録する */
  function send(text, pin) {
    _checkPin(pin);
    text = String(text || '').trim();
    if (!text) throw new Error('メッセージが空です。');
    if (text.length > 1000) throw new Error('メッセージが長すぎます（1000文字まで）。');
    var token = _props().getProperty('LINE_CHANNEL_ACCESS_TOKEN');
    if (!token) throw new Error('LINE_CHANNEL_ACCESS_TOKEN が未設定です。');

    var list = getList(pin);   // 送信直前に最新の対象で確定
    if (!list.count) return { sent: 0, names: [], message: '追いかけ対象が0人のため送信しませんでした。' };

    var ids = list.users.map(function (u) { return u.userId; });
    var errors = [];
    for (var i = 0; i < ids.length; i += 500) {   // multicastは1回500人まで
      var res = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/multicast', {
        method: 'post',
        contentType: 'application/json',
        headers: { Authorization: 'Bearer ' + token },
        payload: JSON.stringify({ to: ids.slice(i, i + 500), messages: [{ type: 'text', text: text }] }),
        muteHttpExceptions: true,
      });
      if (res.getResponseCode() !== 200) {
        errors.push(res.getResponseCode() + ': ' + res.getContentText().slice(0, 200));
      }
    }

    var ok = errors.length === 0;
    var logSheet = _ss().getSheetByName(SHEET_SENDLOG) || _ss().insertSheet(SHEET_SENDLOG);
    if (logSheet.getLastRow() === 0) {
      logSheet.getRange(1, 1, 1, 5)
        .setValues([['日時', '送信人数', '結果', '本文', '送信先(表示名)']]).setFontWeight('bold');
      logSheet.setFrozenRows(1);
    }
    logSheet.appendRow([
      new Date(), list.count, ok ? 'OK' : 'エラー: ' + errors.join(' / '),
      text, list.users.map(function (u) { return u.name; }).join('、'),
    ]);
    if (!ok) throw new Error('送信でエラーが発生しました: ' + errors.join(' / '));
    return { sent: list.count, names: list.users.map(function (u) { return u.name; }) };
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
    return { pinSet: true, trigger: '毎日6〜7時に updateLineUserSummary を自動実行' };
  }

  return { getList: getList, send: send, setup: setup };
})();

// --- スマホ用ページ(?page=line)の google.script.run から呼ばれる ---
function lineConsoleGetList(pin) { return FollowUp.getList(pin); }
function lineConsoleSend(text, pin) { return FollowUp.send(text, pin); }

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
