/**
 * LineHandler.gs - LINE Messaging API Webhook ハンドラ
 *
 * 患者とクリニックのLINEチャット内で予約意図を自動検出し、
 * スタッフに通知を送る。患者への自動返信は行わない。
 *
 * 通知先: スタッフ用LINEグループ or スタッフ個人LINE
 * 通知内容: 患者名・検出日付・元メッセージ・予約表リンク
 */

const LineHandler = (() => {

  // ---------------------------------------------------------------------------
  // 設定 (すべて PropertiesService から取得)
  // ---------------------------------------------------------------------------

  function _getToken() {
    return PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_ACCESS_TOKEN') || '';
  }

  function _getSecret() {
    return PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_SECRET') || '';
  }

  /** スタッフ通知先 (グループID or ユーザーID) */
  function _getStaffNotifyId() {
    return PropertiesService.getScriptProperties().getProperty('STAFF_LINE_NOTIFY_ID') || '';
  }

  /** 管理画面（予約表）のベースURL */
  function _getAdminUrl() {
    return PropertiesService.getScriptProperties().getProperty('ADMIN_APP_URL') || '';
  }

  // ---------------------------------------------------------------------------
  // 日付・時刻検出（キーワード検出は使わない）
  // ---------------------------------------------------------------------------

  /** 日付パターン */
  const DATE_PATTERNS = [
    /(\d{1,2})月(\d{1,2})日/,
    /(\d{1,2})\/(\d{1,2})/,
    /(\d{4})-(\d{2})-(\d{2})/,
  ];

  const RELATIVE_DATE_WORDS = ['明日', '明後日', 'あさって', '来週'];

  /**
   * 予約メッセージかどうか判定する。
   * 日付または時刻が含まれていれば検出する。
   * 「予約」等のキーワード単独では検出しない（ボタンタップの誤検出防止）。
   */
  function _isReservationIntent(text) {
    var t = text.toLowerCase();

    // 日付があるか
    var hasDate = DATE_PATTERNS.some(function(p) { return p.test(text); })
      || RELATIVE_DATE_WORDS.some(function(w) { return t.indexOf(w) !== -1; });

    // 時刻があるか
    var hasTime = /\d{1,2}時/.test(text) || /\d{1,2}:\d{2}/.test(text);

    // 日付または時刻のどちらかがあれば検出
    return hasDate || hasTime;
  }

  /**
   * テキストから日付を抽出する。
   * @returns {string|null} YYYY-MM-DD or null
   */
  function _extractDate(text) {
    var today = new Date();
    var year  = today.getFullYear();
    var match;

    // X月Y日
    match = text.match(/(\d{1,2})月(\d{1,2})日?/);
    if (match) {
      var m = Number(match[1]);
      var d = Number(match[2]);
      var candidate = new Date(year, m - 1, d);
      if (candidate < today) candidate.setFullYear(year + 1);
      return _fmtDate(candidate);
    }

    // X/Y
    match = text.match(/(\d{1,2})\/(\d{1,2})/);
    if (match) {
      var candidate2 = new Date(year, Number(match[1]) - 1, Number(match[2]));
      if (candidate2 < today) candidate2.setFullYear(year + 1);
      return _fmtDate(candidate2);
    }

    // YYYY-MM-DD
    match = text.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (match) return match[0];

    // 相対日付
    if (text.indexOf('明日') !== -1) {
      var d1 = new Date(today); d1.setDate(d1.getDate() + 1); return _fmtDate(d1);
    }
    if (text.indexOf('明後日') !== -1 || text.indexOf('あさって') !== -1) {
      var d2 = new Date(today); d2.setDate(d2.getDate() + 2); return _fmtDate(d2);
    }
    if (text.indexOf('来週') !== -1) {
      var d3 = new Date(today); d3.setDate(d3.getDate() + 7); return _fmtDate(d3);
    }

    return null;
  }

  /**
   * テキストから時刻を抽出する。
   * @returns {string|null} "HH:MM" or null
   */
  function _extractTime(text) {
    var match;

    // 15時30分 / 15時半 / 15時
    match = text.match(/(\d{1,2})時(\d{1,2})分/);
    if (match) return _padTime(match[1], match[2]);

    match = text.match(/(\d{1,2})時半/);
    if (match) return _padTime(match[1], '30');

    match = text.match(/(\d{1,2})時/);
    if (match) return _padTime(match[1], '0');

    // 15:30
    match = text.match(/(\d{1,2}):(\d{2})/);
    if (match) return _padTime(match[1], match[2]);

    return null;
  }

  function _padTime(h, m) {
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }

  function _fmtDate(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function _fmtDateJa(ymd) {
    var p = ymd.split('-');
    var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    var dow = ['日','月','火','水','木','金','土'][d.getDay()];
    return Number(p[1]) + '月' + Number(p[2]) + '日（' + dow + '）';
  }

  // ---------------------------------------------------------------------------
  // LINE API
  // ---------------------------------------------------------------------------

  /**
   * LINE Push API でメッセージを送信する（患者への返信ではなくスタッフへの通知）。
   * @param {string} to - 送信先ID（グループID or ユーザーID）
   * @param {object[]} messages
   */
  function _push(to, messages) {
    var token = _getToken();
    if (!token) {
      Logger.log('[LineHandler] LINE_CHANNEL_ACCESS_TOKEN が未設定');
      return;
    }
    UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'Authorization': 'Bearer ' + token },
      payload: JSON.stringify({ to: to, messages: messages }),
      muteHttpExceptions: true,
    });
  }

  /**
   * LINE Profile API でユーザーの表示名を取得する。
   * @param {string} userId
   * @returns {string} 表示名 or '(不明)'
   */
  function _getDisplayName(userId) {
    var token = _getToken();
    if (!token || !userId) return '(不明)';
    try {
      var res = UrlFetchApp.fetch('https://api.line.me/v2/bot/profile/' + userId, {
        method: 'get',
        headers: { 'Authorization': 'Bearer ' + token },
        muteHttpExceptions: true,
      });
      var profile = JSON.parse(res.getContentText());
      return profile.displayName || '(不明)';
    } catch (e) {
      Logger.log('[LineHandler] profile fetch error: ' + e.message);
      return '(不明)';
    }
  }

  /**
   * スタッフ向け通知の Flex Message を組み立てる。
   */
  function _buildStaffNotifyFlex(patientName, messageText, detectedDate, detectedTime) {
    var adminUrl = _getAdminUrl();
    var dateLabel = detectedDate ? _fmtDateJa(detectedDate) : '日付不明';
    var timeLabel = detectedTime || '';

    // 管理画面URL に日付パラメータを付与
    var scheduleUri = adminUrl;
    if (adminUrl && detectedDate) {
      scheduleUri += (adminUrl.indexOf('?') !== -1 ? '&' : '?') + 'date=' + detectedDate;
    }

    var infoItems = [
      { label: '患者', value: patientName },
      { label: '日付', value: dateLabel },
    ];
    if (timeLabel) {
      infoItems.push({ label: '時間', value: timeLabel });
    }

    var bodyContents = [
      {
        type: 'text',
        text: '🔔 予約メッセージ検出',
        weight: 'bold',
        size: 'lg',
        color: '#dc2626',
      },
      { type: 'separator', margin: 'md' },
    ];

    // 患者名・日付・時刻
    infoItems.forEach(function(item) {
      bodyContents.push({
        type: 'box',
        layout: 'horizontal',
        margin: 'md',
        contents: [
          { type: 'text', text: item.label, size: 'sm', color: '#94a3b8', flex: 2 },
          { type: 'text', text: item.value, size: 'sm', color: '#1e293b', weight: 'bold', flex: 5 },
        ],
      });
    });

    // 元メッセージ（長い場合は切り詰め）
    var truncated = messageText.length > 60 ? messageText.substring(0, 60) + '…' : messageText;
    bodyContents.push({ type: 'separator', margin: 'md' });
    bodyContents.push({
      type: 'text',
      text: '💬 ' + truncated,
      size: 'sm',
      color: '#475569',
      margin: 'md',
      wrap: true,
    });

    var bubble = {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        contents: bodyContents,
        paddingAll: '20px',
      },
    };

    // 管理画面URLが設定されている場合のみボタンを表示
    if (adminUrl) {
      bubble.footer = {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'button',
            action: {
              type: 'uri',
              label: '📋 予約表を開く',
              uri: scheduleUri,
            },
            style: 'primary',
            color: '#4f46e5',
            height: 'md',
          },
        ],
        paddingAll: '12px',
      };
    }

    return {
      type: 'flex',
      altText: '🔔 予約検出: ' + patientName + ' ' + dateLabel,
      contents: bubble,
    };
  }

  // ---------------------------------------------------------------------------
  // メール通知
  // ---------------------------------------------------------------------------

  /**
   * 予約検出時にスタッフにメール通知を送る。
   * 送信先は PropertiesService の STAFF_EMAIL から取得。
   * GAS の MailApp は無料で1日100通まで送信可能。
   */
  function _sendEmailNotify(patientName, messageText, detectedDate, detectedTime) {
    var email = PropertiesService.getScriptProperties().getProperty('STAFF_EMAIL');
    if (!email) {
      Logger.log('[LineHandler] STAFF_EMAIL 未設定のためメール通知スキップ');
      return;
    }

    var dateLabel = detectedDate ? _fmtDateJa(detectedDate) : '日付不明';
    var timeLabel = detectedTime ? ' ' + detectedTime : '';

    var subject = '🔔 予約検出: ' + patientName + ' ' + dateLabel + timeLabel;

    var body = '予約メッセージを検出しました。\n\n'
      + '患者: ' + patientName + '\n'
      + '日付: ' + dateLabel + '\n'
      + (detectedTime ? '時間: ' + detectedTime + '\n' : '')
      + 'メッセージ: ' + messageText + '\n';

    var adminUrl = _getAdminUrl();
    if (adminUrl && detectedDate) {
      var scheduleUrl = adminUrl + (adminUrl.indexOf('?') !== -1 ? '&' : '?') + 'date=' + detectedDate;
      body += '\n予約表を開く:\n' + scheduleUrl + '\n';
    }

    try {
      MailApp.sendEmail(email, subject, body);
      Logger.log('[LineHandler] メール通知送信: ' + email);
    } catch (e) {
      Logger.log('[LineHandler] メール送信エラー: ' + e.message);
    }
  }

  // ---------------------------------------------------------------------------
  // ログ記録
  // ---------------------------------------------------------------------------

  function _logMessage(userId, displayName, messageText, detectedDate, detectedTime) {
    var SHEET_NAME = 'lineMessages';
    var ssId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
    if (!ssId) return;

    var ss = SpreadsheetApp.openById(ssId);
    var sheet = ss.getSheetByName(SHEET_NAME);

    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      var headers = ['id','lineUserId','displayName','messageText','detectedDate','detectedTime','status','createdAt'];
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
      sheet.getRange(1, 1, 1, headers.length).setBackground('#4A86E8');
      sheet.getRange(1, 1, 1, headers.length).setFontColor('#FFFFFF');
      sheet.setFrozenRows(1);
    }

    sheet.appendRow([
      Utilities.getUuid(),
      userId,
      displayName,
      messageText,
      detectedDate || '',
      detectedTime || '',
      'detected',
      new Date().toISOString(),
    ]);
  }

  // ---------------------------------------------------------------------------
  // Webhook ハンドラ
  // ---------------------------------------------------------------------------

  function handle(e, body) {
    var secret = _getSecret();
    if (secret && e.postData) {
      Logger.log('[LineHandler] signature received: ' + (e.parameter && e.parameter['X-Line-Signature'] ? 'yes' : 'no'));
    }

    var events = body.events || [];
    events.forEach(function(event) {
      try {
        _dispatchEvent(event);
      } catch (err) {
        Logger.log('[LineHandler] error: ' + err.message + '\n' + err.stack);
      }
    });

    return ContentService
      .createTextOutput(JSON.stringify({ status: 'ok' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  function _dispatchEvent(event) {
    // 行動ログ（記録専用・失敗しても既存処理に影響なし）
    try { ActivityLog.log(event); } catch (e) { Logger.log('[LineHandler] ActivityLog error: ' + e.message); }

    switch (event.type) {
      case 'message':
        _handleMessage(event);
        break;
      case 'postback':
        Logger.log('[LINE] postback: ' + event.postback.data);
        break;
      case 'follow':
        Logger.log('[LINE] follow: ' + event.source.userId);
        break;
      default:
        Logger.log('[LINE] unhandled: ' + event.type);
    }
  }

  /**
   * テキストメッセージを処理する。
   * 予約意図を検出したらスタッフに通知を送る。
   * 患者への自動返信は行わない（手動チャットを邪魔しない）。
   */
  function _handleMessage(event) {
    if (!event.message || event.message.type !== 'text') return;

    var text   = event.message.text || '';
    var userId = event.source.userId || '';

    Logger.log('[LINE] message from ' + userId + ': ' + text);

    // 「テスト登録」: 送ってきた本人をテスト配信先として登録（スタッフ用・Reply APIなので無料）
    if (text.trim() === 'テスト登録') {
      try {
        PropertiesService.getScriptProperties().setProperty('LINE_TEST_USER_ID', userId);
        AutoReply.sendReply(event.replyToken,
          'このLINEをテスト配信先として登録しました✅\n配信ページの「🧪 テスト配信」を押すと、このトークにお試し配信が届きます。');
      } catch (regErr) {
        Logger.log('[LineHandler] test register error: ' + regErr.message);
      }
      return;
    }

    // 配信画像タップ等のキーワード自動応答（「自動応答」シート・完全一致のみ・
    // Reply APIで返信するため通数を消費しない）。応答したら予約検出はしない
    try {
      var auto = AutoReply.findMatch(text);
      if (auto) {
        AutoReply.sendReply(event.replyToken, auto.reply);
        Logger.log('[LINE] auto-reply: ' + auto.keyword);
        return;
      }
    } catch (autoErr) {
      Logger.log('[LineHandler] AutoReply error (ignored): ' + autoErr.message);
    }

    // 予約意図チェック
    if (!_isReservationIntent(text)) return;

    // 情報を抽出
    var detectedDate = _extractDate(text);
    var detectedTime = _extractTime(text);
    var displayName  = _getDisplayName(userId);

    Logger.log('[LINE] 予約検出！ patient=' + displayName +
      ' date=' + (detectedDate || '(なし)') +
      ' time=' + (detectedTime || '(なし)'));

    // シートにログ保存
    _logMessage(userId, displayName, text, detectedDate, detectedTime);

    // メール通知を送信
    _sendEmailNotify(displayName, text, detectedDate, detectedTime);

    Logger.log('[LINE] 検出＋記録＋メール通知完了');
  }

  return { handle };
})();
