/**
 * Templates.gs - ステージ別の文面テンプレート
 *
 * THE MODELのメリット②「ステージごとに話す内容を準備しやすくなる」の実装。
 * 行動ログと同じスプレッドシートの「テンプレート」シートに保存し、
 * 配信ページでステージに合った文面をワンタップで呼び出す。
 *
 * シート列: ステージ / タイトル / 本文 / 更新日時
 *  - ステージは6ステージ名 or「共通」
 *  - シートを直接編集して文面を直してもよい（次回リスト更新で反映）
 */

const Templates = (() => {

  const SHEET_NAME = 'テンプレート';
  const HEADERS = ['ステージ', 'タイトル', '本文', '更新日時'];
  const STAGE_COMMON = '共通';

  /** 初回作成時にセットするクリニック向けの初期文面 */
  const DEFAULTS = [
    ['新規', 'はじめまして・初回案内',
      '友だち追加ありがとうございます😊\n上野医院ビューティーミワです。\n' +
      '施術メニューや料金はリッチメニューの「施術メニュー」からご覧いただけます。\n' +
      'ご質問はこのトークにそのままご返信ください。'],
    ['反応待ち', 'リマインド（配信後の追いかけ）',
      '先日のご案内、ご覧いただけましたか？😊\n' +
      'ご不明な点やご希望の日時があれば、このトークにお気軽にご返信ください。'],
    ['反応あり', '予約の後押し（★追いかけ向け）',
      'ご覧いただきありがとうございます😊\n' +
      '気になるメニューがございましたら、ご希望の日時とあわせてご返信ください。\n' +
      '空き状況をすぐにお調べします。'],
    ['予約済み', 'アフターフォロー・次回のご案内',
      '先日はご来院ありがとうございました😊\n' +
      'その後の経過はいかがでしょうか。気になることがあればお気軽にご相談ください。\n' +
      '次回のご予約もこのトークから承ります。'],
    ['休眠', 'お久しぶりです（リピート促進）',
      'お久しぶりです、上野医院ビューティーミワです😊\n' +
      'ただいま◯◯キャンペーンを実施中です。\n' +
      '久しぶりのメンテナンスにいかがでしょうか。ご希望の方はこのトークにご返信ください。'],
    [STAGE_COMMON, 'キャンペーン告知',
      'いつもありがとうございます😊\n' +
      '◯月◯日から「◯◯キャンペーン」が始まります！\n' +
      '詳しくはリッチメニューの「キャンペーン」をご覧ください。ご予約はこのトークからどうぞ。'],
  ];

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
      var now = new Date();
      var rows = DEFAULTS.map(function (d) { return [d[0], d[1], d[2], now]; });
      sheet.getRange(2, 1, rows.length, HEADERS.length).setValues(rows);
    }
    return sheet;
  }

  /** 全テンプレート [{stage, title, body}]（シート順） */
  function list() {
    var sheet = _sheet();
    if (sheet.getLastRow() < 2) return [];
    return sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues()
      .filter(function (r) { return r[1] && r[2]; })
      .map(function (r) {
        return { stage: String(r[0] || STAGE_COMMON), title: String(r[1]), body: String(r[2]) };
      });
  }

  /** 保存: 同じステージ+タイトルがあれば本文を上書き、なければ追加 */
  function save(stage, title, body) {
    stage = String(stage || STAGE_COMMON).trim() || STAGE_COMMON;
    title = String(title || '').trim();
    body = String(body || '').trim();
    if (!title) throw new Error('テンプレート名を入力してください。');
    if (!body) throw new Error('本文が空です。');
    if (title.length > 30) throw new Error('テンプレート名は30文字までにしてください。');
    var sheet = _sheet();
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      var rowIndex = 0;
      if (sheet.getLastRow() >= 2) {
        var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
        for (var i = 0; i < rows.length; i++) {
          if (String(rows[i][0]) === stage && String(rows[i][1]) === title) {
            rowIndex = i + 2;
            break;
          }
        }
      }
      var row = [stage, title, body, new Date()];
      if (rowIndex) {
        sheet.getRange(rowIndex, 1, 1, 4).setValues([row]);
      } else {
        sheet.appendRow(row);
      }
    } finally {
      lock.releaseLock();
    }
    return { stage: stage, title: title, updated: true };
  }

  return { list: list, save: save, STAGE_COMMON: STAGE_COMMON };
})();
