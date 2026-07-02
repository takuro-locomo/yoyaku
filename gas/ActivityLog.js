/**
 * ActivityLog.gs - LINE行動ログ（記録専用・返信なし）
 *
 * すべてのWebhookイベント（メッセージ／友だち追加／ブロック等）を
 * スプレッドシートに1行ずつ記録する。患者への挙動は一切変えない。
 *
 * 目的（LINE分析PDCAプロジェクト）:
 *  - リッチメニューのどのボタンを誰が押したか（ボタンはテキスト送信型）
 *  - 予約フォーム返信（CV）の自動検知
 *  - 新規友だちの初動、ユーザーごとの活動量 → セグメント分け
 *
 * 記録先スプレッドシートは初回イベント時に自動作成し、IDを
 * ScriptProperties(LINE_ACTIVITY_LOG_SSID) に保存する。
 */

const ActivityLog = (() => {

  const PROP_KEY = 'LINE_ACTIVITY_LOG_SSID';
  const SS_NAME = 'LINE行動ログ_上野医院（自動記録）';
  const SHEET_LOG = 'ログ';

  const HEADERS = [
    '日時', 'userId', '表示名', 'イベント', '分類', '内容(テキスト)', '予約フォームCV',
  ];

  /** リッチメニューのボタン（テキスト送信型）→ 分類名 */
  const RICH_MENU_TEXTS = {
    '予約': 'ボタン:予約',
    'キャンペーン': 'ボタン:キャンペーン',
    '施術メニュー': 'ボタン:施術メニュー',
    'よくある質問': 'ボタン:よくある質問',
    'アクセスと営業時間': 'ボタン:アクセス',
    'ホームページ': 'ボタン:ホームページ',
  };

  // ---------------------------------------------------------------------------
  // スプレッドシート
  // ---------------------------------------------------------------------------

  function _getSpreadsheet() {
    var props = PropertiesService.getScriptProperties();
    var id = props.getProperty(PROP_KEY);
    if (id) {
      try {
        return SpreadsheetApp.openById(id);
      } catch (e) {
        Logger.log('[ActivityLog] saved spreadsheet missing, recreating: ' + e.message);
      }
    }
    var ss = SpreadsheetApp.create(SS_NAME);
    var sheet = ss.getSheets()[0];
    sheet.setName(SHEET_LOG);
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    props.setProperty(PROP_KEY, ss.getId());
    Logger.log('[ActivityLog] created spreadsheet: ' + ss.getUrl());
    return ss;
  }

  function _getLogSheet() {
    var ss = _getSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_LOG);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_LOG);
      sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
    return sheet;
  }

  // ---------------------------------------------------------------------------
  // 分類
  // ---------------------------------------------------------------------------

  /** 予約フォーム返信（CV）判定: フォームの見出し行を含むか */
  function _isReservationFormReply(text) {
    if (!text) return false;
    var hasName = text.indexOf('お名前') !== -1;
    var hasWish = text.indexOf('ご希望日時') !== -1 || text.indexOf('ご希望の施術') !== -1;
    return hasName && hasWish;
  }

  function _classify(event) {
    if (event.type === 'follow') return '友だち追加';
    if (event.type === 'unfollow') return 'ブロック/削除';
    if (event.type === 'postback') return 'ポストバック';
    if (event.type !== 'message') return event.type;
    if (!event.message || event.message.type !== 'text') {
      return '受信:' + (event.message ? event.message.type : '不明');
    }
    var text = (event.message.text || '').trim();
    if (_isReservationFormReply(text)) return '★予約フォーム返信(CV)';
    if (RICH_MENU_TEXTS[text]) return RICH_MENU_TEXTS[text];
    return '自由入力';
  }

  // ---------------------------------------------------------------------------
  // 表示名（プロフィールAPI + キャッシュ）
  // ---------------------------------------------------------------------------

  function _getDisplayNameCached(userId) {
    if (!userId) return '';
    var cache = CacheService.getScriptCache();
    var cached = cache.get('ln_' + userId);
    if (cached) return cached;
    var token = PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_ACCESS_TOKEN') || '';
    if (!token) return '';
    try {
      var res = UrlFetchApp.fetch('https://api.line.me/v2/bot/profile/' + userId, {
        headers: { Authorization: 'Bearer ' + token },
        muteHttpExceptions: true,
      });
      if (res.getResponseCode() === 200) {
        var name = JSON.parse(res.getContentText()).displayName || '';
        cache.put('ln_' + userId, name, 21600); // 6時間キャッシュ
        return name;
      }
    } catch (e) {
      Logger.log('[ActivityLog] profile fetch failed: ' + e.message);
    }
    return '';
  }

  // ---------------------------------------------------------------------------
  // 公開: イベントを1行記録する（失敗しても呼び出し元に影響させない）
  // ---------------------------------------------------------------------------

  function log(event) {
    try {
      var userId = (event.source && event.source.userId) || '';
      var text = (event.type === 'message' && event.message && event.message.type === 'text')
        ? event.message.text : '';
      var category = _classify(event);
      var isCv = category === '★予約フォーム返信(CV)';
      var row = [
        new Date(),
        userId,
        _getDisplayNameCached(userId),
        event.type,
        category,
        text ? text.slice(0, 500) : '',
        isCv ? 1 : '',
      ];
      var lock = LockService.getScriptLock();
      lock.waitLock(10000);
      try {
        _getLogSheet().appendRow(row);
      } finally {
        lock.releaseLock();
      }
    } catch (e) {
      Logger.log('[ActivityLog] log failed (ignored): ' + e.message);
    }
  }

  /** ログのスプレッドシートURLを返す（セットアップ確認用） */
  function getLogUrl() {
    return _getSpreadsheet().getUrl();
  }

  return { log, getLogUrl };
})();

/** Apps Scriptエディタから手動実行して記録先URLを確認する用 */
function showActivityLogUrl() {
  Logger.log(ActivityLog.getLogUrl());
}
