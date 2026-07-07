/**
 * SegmentSummary.gs - LINE友だちのセグメント自動集計
 *
 * ActivityLogの「ログ」シートをユーザー単位に集計し、
 * 同じスプレッドシートの「ユーザー別サマリー」シートに書き出す。
 *
 * 営業メッセージの配信リスト作成用:
 *  - アクティブ度（ホット/アクティブ/休眠/ブロック）
 *  - 興味カテゴリ（最も押しているボタン）
 *  - 予約CVの有無、予約ボタン押下→未返信（追いかけ対象）
 */

const SegmentSummary = (() => {

  const SHEET_SUMMARY = 'ユーザー別サマリー';
  const ACTIVE_DAYS = 30; // 直近何日を「アクティブ」とみなすか

  const BUTTON_COLS = [
    'ボタン:予約', 'ボタン:キャンペーン', 'ボタン:施術メニュー',
    'ボタン:よくある質問', 'ボタン:アクセス', 'ボタン:ホームページ',
  ];

  const HEADERS = [
    'userId', '表示名', '初回接触', '最終アクティブ', '総イベント数',
    '予約', 'キャンペーン', '施術メニュー', 'よくある質問', 'アクセス', 'HP',
    '自由入力', 'CV回数(フォーム返信)', 'ブロック',
    'アクティブ度', '興味(最多ボタン)', '追いかけ対象(予約ボタン→CVなし)',
    'ステージ', '最終配信', 'ステージメモ', 'ステージ手動',
  ];

  function update() {
    var ss = SpreadsheetApp.openById(
      PropertiesService.getScriptProperties().getProperty('LINE_ACTIVITY_LOG_SSID')
    );
    var logSheet = ss.getSheetByName('ログ');
    if (!logSheet || logSheet.getLastRow() < 2) return { users: 0 };

    var rows = logSheet.getRange(2, 1, logSheet.getLastRow() - 1, 7).getValues();
    var users = {};

    rows.forEach(function (r) {
      var date = r[0], userId = r[1], name = r[2], category = r[4], cv = r[6];
      if (!userId || String(userId).indexOf('U_TEST') === 0) return; // テストデータ除外
      var u = users[userId];
      if (!u) {
        u = users[userId] = {
          name: '', first: date, last: date, total: 0,
          buttons: {}, free: 0, cv: 0, blocked: false,
        };
      }
      if (name) u.name = name;
      if (date < u.first) u.first = date;
      if (date > u.last) u.last = date;
      u.total++;
      if (category === 'ブロック/削除') u.blocked = true;
      if (category === '友だち追加') u.blocked = false; // 再追加
      if (category === '★予約フォーム返信(CV)') u.cv++;
      if (category === '自由入力') u.free++;
      if (BUTTON_COLS.indexOf(category) !== -1) {
        u.buttons[category] = (u.buttons[category] || 0) + 1;
      }
    });

    var now = new Date();
    var activeLimit = new Date(now.getTime() - ACTIVE_DAYS * 24 * 60 * 60 * 1000);
    var manualMap = Stage.getManualMap();      // 手動ステージ上書き
    var lastSendMap = Stage.getLastSendMap();  // こちらから最後に配信した日時

    var out = Object.keys(users).map(function (id) {
      var u = users[id];
      var btnCounts = BUTTON_COLS.map(function (b) { return u.buttons[b] || 0; });

      // アクティブ度
      var level;
      if (u.blocked) level = 'ブロック';
      else if (u.cv > 0) level = '予約済み';
      else if (u.last >= activeLimit && u.total >= 3) level = 'ホット';
      else if (u.last >= activeLimit) level = 'アクティブ';
      else level = '休眠';

      // 興味 = 最多ボタン
      var maxBtn = '', maxN = 0;
      BUTTON_COLS.forEach(function (b) {
        var n = u.buttons[b] || 0;
        if (n > maxN) { maxN = n; maxBtn = b.replace('ボタン:', ''); }
      });

      // 追いかけ対象: 一度も予約していない(CV=0)が、予約以外のページも
      // 見て回ったうえで予約ボタンを押した人（ブロック除く）。
      // OTHER_KINDS_MIN = 予約以外に何種類のボタンを押していれば「見て回った」とするか
      var OTHER_KINDS_MIN = 2;
      var otherKinds = BUTTON_COLS.filter(function (b) {
        return b !== 'ボタン:予約' && (u.buttons[b] || 0) > 0;
      }).length;
      var followUp = (!u.blocked && u.cv === 0 &&
        (u.buttons['ボタン:予約'] || 0) > 0 && otherKinds >= OTHER_KINDS_MIN) ? '★' : '';

      // ステージ判定（手動上書き > 自動判定）
      var reactions = btnCounts.reduce(function (a, b) { return a + b; }, 0) + u.free;
      var manual = manualMap[id];
      var lastSend = lastSendMap[id] || null;
      var stage = Stage.compute(
        { blocked: u.blocked, cv: u.cv, last: u.last, reactions: reactions },
        manual ? manual.stage : '', lastSend, now
      );

      return [
        id, u.name, u.first, u.last, u.total,
      ].concat(btnCounts).concat([
        u.free, u.cv, u.blocked ? 1 : '',
        level, maxBtn, followUp,
        stage, lastSend || '', manual ? manual.memo : '', manual ? 1 : '',
      ]);
    });

    // 最終アクティブの新しい順
    out.sort(function (a, b) { return b[3] - a[3]; });

    // 同時アクセスで書きかけのシートが読まれないようロックして書き込む
    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      var sheet = ss.getSheetByName(SHEET_SUMMARY) || ss.insertSheet(SHEET_SUMMARY);
      sheet.clearContents();
      sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
      sheet.setFrozenRows(1);
      if (out.length) {
        sheet.getRange(2, 1, out.length, HEADERS.length).setValues(out);
      }
    } finally {
      lock.releaseLock();
    }
    return { users: out.length, updatedAt: now.toISOString() };
  }

  return { update };
})();

/** Apps Scriptエディタから手動実行する用 */
function updateLineUserSummary() {
  Logger.log(JSON.stringify(SegmentSummary.update()));
}
