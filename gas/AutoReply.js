/**
 * AutoReply.gs - 画像タップ時の自動応答メッセージ管理
 *
 * 配信画像をタップすると、設定したキーワードがユーザーから送信され、
 * Webhookで受信→キーワードに紐づく返信メッセージを自動送信する。
 *
 * シート: 「自動応答」
 *   列: id / キーワード / 返信メッセージ / 有効 / 作成日時
 *
 * 配信側（FollowUp.send）で画像Flex Messageを送るとき、
 * message actionのtextにキーワードを設定する。
 * LineHandler側で受信したメッセージがキーワードに一致したら返信する。
 */

const AutoReply = (() => {

  const SHEET_NAME = '自動応答';
  const HEADERS = ['id', 'キーワード', '返信メッセージ', '有効', '作成日時'];

  function _ss() {
    var id = PropertiesService.getScriptProperties().getProperty('LINE_ACTIVITY_LOG_SSID');
    if (!id) throw new Error('行動ログのスプレッドシートが未作成です。');
    return SpreadsheetApp.openById(id);
  }

  function _sheet() {
    var ss = _ss();
    var sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
    return sheet;
  }

  /** 全自動応答一覧 [{id, keyword, reply, active}] */
  function list() {
    var sheet = _sheet();
    if (sheet.getLastRow() < 2) return [];
    return sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues()
      .filter(function (r) { return r[0] && r[1]; })
      .map(function (r) {
        return {
          id: String(r[0]),
          keyword: String(r[1]),
          reply: String(r[2] || ''),
          active: r[3] === 1 || r[3] === true || r[3] === '1',
        };
      });
  }

  /** 保存（同キーワードは上書き） */
  function save(keyword, reply) {
    keyword = String(keyword || '').trim();
    reply = String(reply || '').trim();
    if (!keyword) throw new Error('キーワードを入力してください。');
    if (!reply) throw new Error('返信メッセージを入力してください。');
    if (reply.length > 1000) throw new Error('返信メッセージは1000文字までです。');
    var sheet = _sheet();
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      var rowIndex = 0;
      var existingId = '';
      if (sheet.getLastRow() >= 2) {
        var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
        for (var i = 0; i < rows.length; i++) {
          if (String(rows[i][1]) === keyword) {
            rowIndex = i + 2;
            existingId = String(rows[i][0]);
            break;
          }
        }
      }
      var id = existingId || Utilities.getUuid();
      var row = [id, keyword, reply, 1, new Date()];
      if (rowIndex) {
        sheet.getRange(rowIndex, 1, 1, 5).setValues([row]);
      } else {
        sheet.appendRow(row);
      }
      return { id: id, keyword: keyword };
    } finally {
      lock.releaseLock();
    }
  }

  /** 削除 */
  function remove(id) {
    if (!id) throw new Error('削除するIDがありません。');
    var sheet = _sheet();
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      if (sheet.getLastRow() < 2) throw new Error('見つかりません。');
      var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
      for (var i = 0; i < rows.length; i++) {
        if (String(rows[i][0]) === String(id)) {
          sheet.deleteRow(i + 2);
          return { deleted: true };
        }
      }
      throw new Error('見つかりません。');
    } finally {
      lock.releaseLock();
    }
  }

  /**
   * キーワード一致チェック。一致した自動応答を返す（なければnull）。
   * 完全一致のみ（部分一致にすると誤爆が多いため）。
   */
  function findMatch(text) {
    text = String(text || '').trim();
    if (!text) return null;
    var items = list();
    for (var i = 0; i < items.length; i++) {
      if (items[i].active && items[i].keyword === text) {
        return items[i];
      }
    }
    return null;
  }

  /**
   * 自動応答を実行: replyTokenでテキスト返信する。
   * Push APIではなくReply APIを使う（通数を消費しない）。
   */
  function sendReply(replyToken, replyText) {
    var token = PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_ACCESS_TOKEN');
    if (!token || !replyToken) return;
    UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + token },
      payload: JSON.stringify({
        replyToken: replyToken,
        messages: [{ type: 'text', text: replyText }],
      }),
      muteHttpExceptions: true,
    });
  }

  return { list: list, save: save, remove: remove, findMatch: findMatch, sendReply: sendReply };
})();
