/**
 * Insights.gs - 行動ログを使った無料の分析機能（公式アプリでは見られないもの）
 *
 * ① 配信効果: 配信ごとに「48時間以内に反応/予約/ブロックした人数」を集計
 *    （個人単位の配信記録「配信先履歴」が始まった2026-07-07以降の配信が対象）
 * ② ベスト配信タイム: 曜日×時間帯の活動ヒートマップ →「ヒートマップ」シート＋おすすめ3枠
 * ③ そろそろリスト: 予約(CV)間隔から来院サイクルを推定し、超過した人を抽出
 * ④ 週次サマリー: 毎週月曜の朝、先週の数字をメールで自動送信（毎朝トリガーに相乗り）
 *
 * すべて既存の「LINE行動ログ」スプレッドシートだけで動く。追加費用なし。
 */

const Insights = (() => {

  const REACT_WINDOW_H = 48;    // 配信効果: 反応とみなす時間窓
  const DEFAULT_CYCLE_DAYS = 90; // そろそろリスト: サイクルが推定できない人の既定値
  const DOW = ['日', '月', '火', '水', '木', '金', '土'];

  function _props() { return PropertiesService.getScriptProperties(); }

  function _ss() {
    var id = _props().getProperty('LINE_ACTIVITY_LOG_SSID');
    if (!id) throw new Error('行動ログのスプレッドシートが未作成です。');
    return SpreadsheetApp.openById(id);
  }

  // ログは1リクエスト中に何度も使うのでキャッシュ（実行ごとにリセットされる）
  var _logCache = null;
  /** [{at(Date), userId, name, category, cv}] テストデータ除外済み */
  function _logs() {
    if (_logCache) return _logCache;
    var sheet = _ss().getSheetByName('ログ');
    if (!sheet || sheet.getLastRow() < 2) return (_logCache = []);
    _logCache = sheet.getRange(2, 1, sheet.getLastRow() - 1, 7).getValues()
      .filter(function (r) {
        return r[0] instanceof Date && r[1] && String(r[1]).indexOf('U_TEST') !== 0;
      })
      .map(function (r) {
        return { at: r[0], userId: r[1], name: r[2] || '', category: String(r[4] || ''), cv: r[6] === 1 };
      });
    return _logCache;
  }

  /** ブロック中のuserId集合（最後のブロックが最後の友だち追加より後の人） */
  function _blockedSet() {
    var state = {};
    _logs().forEach(function (l) {
      if (l.category === 'ブロック/削除') state[l.userId] = true;
      if (l.category === '友だち追加') state[l.userId] = false;
    });
    var set = {};
    Object.keys(state).forEach(function (id) { if (state[id]) set[id] = true; });
    return set;
  }

  // -------------------------------------------------------------------------
  // ① 配信効果
  // -------------------------------------------------------------------------

  /**
   * 配信先履歴をバッチ（同一送信）ごとにまとめ、新しい順にnRecent件の効果を返す。
   * 戻り値: [{atMs, at(Date), group, sent, reacted, cv, blocked}]
   */
  function sendEffects(nRecent) {
    var sheet = _ss().getSheetByName('配信先履歴');
    if (!sheet || sheet.getLastRow() < 2) return [];
    var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues();
    var batches = {};   // key = 送信日時(ms) + group
    rows.forEach(function (r) {
      if (!(r[0] instanceof Date) || !r[1]) return;
      var key = r[0].getTime() + '|' + (r[3] || '');
      var b = batches[key];
      if (!b) b = batches[key] = { atMs: r[0].getTime(), at: r[0], group: String(r[3] || ''), ids: {} };
      b.ids[r[1]] = true;
    });
    var list = Object.keys(batches).map(function (k) { return batches[k]; })
      .sort(function (a, b) { return b.atMs - a.atMs; })
      .slice(0, nRecent || 10);

    var logs = _logs();
    list.forEach(function (b) {
      var windowEnd = b.atMs + REACT_WINDOW_H * 3600 * 1000;
      var reacted = {}, cv = {}, blocked = {};
      logs.forEach(function (l) {
        var t = l.at.getTime();
        if (t <= b.atMs || t > windowEnd || !b.ids[l.userId]) return;
        if (l.category === 'ブロック/削除') { blocked[l.userId] = true; return; }
        reacted[l.userId] = true;
        if (l.cv) cv[l.userId] = true;
      });
      b.sent = Object.keys(b.ids).length;
      b.reacted = Object.keys(reacted).length;
      b.cv = Object.keys(cv).length;
      b.blocked = Object.keys(blocked).length;
      delete b.ids;
    });
    return list;
  }

  // -------------------------------------------------------------------------
  // ② ベスト配信タイム（曜日×時間ヒートマップ）
  // -------------------------------------------------------------------------

  /** {matrix: 7x24, best: [{dow, hour, count}] 上位3枠, label: 'おすすめ…'} */
  function heatmap() {
    var m = [];
    for (var d = 0; d < 7; d++) m.push(new Array(24).fill(0));
    _logs().forEach(function (l) {
      if (l.category === 'ブロック/削除') return;
      m[l.at.getDay()][l.at.getHours()]++;
    });
    var cells = [];
    for (var dd = 0; dd < 7; dd++) for (var h = 0; h < 24; h++) {
      if (m[dd][h] > 0) cells.push({ dow: dd, hour: h, count: m[dd][h] });
    }
    cells.sort(function (a, b) { return b.count - a.count; });
    var best = cells.slice(0, 3);
    var label = best.length
      ? 'おすすめ配信タイム: ' + best.map(function (c) {
          return DOW[c.dow] + '曜' + c.hour + '時台';
        }).join('・') + '（友だちの反応が多い時間）'
      : '';
    return { matrix: m, best: best, label: label };
  }

  // -------------------------------------------------------------------------
  // ③ そろそろリスト（来院サイクル超過）
  // -------------------------------------------------------------------------

  /**
   * CV(予約フォーム返信)の間隔から来院サイクルを推定し、超過した人を返す。
   * 個人の間隔が2回以上あれば個人平均、なければ全体平均、それもなければ90日。
   * 戻り値: [{userId, name, lastCv(Date), cycleDays, daysSince}] 超過率の大きい順
   */
  function dueList() {
    var byUser = {};   // userId -> {name, cvs: [Date]}
    _logs().forEach(function (l) {
      if (!l.cv) return;
      var u = byUser[l.userId] || (byUser[l.userId] = { name: '', cvs: [] });
      if (l.name) u.name = l.name;
      u.cvs.push(l.at);
    });

    // 全体平均サイクル（間隔が取れる人全員の平均）
    var allGaps = [];
    Object.keys(byUser).forEach(function (id) {
      var cvs = byUser[id].cvs.sort(function (a, b) { return a - b; });
      for (var i = 1; i < cvs.length; i++) {
        var gap = (cvs[i] - cvs[i - 1]) / 86400000;
        if (gap >= 7) allGaps.push(gap);   // 同日連投などのノイズ除外
      }
    });
    var globalCycle = allGaps.length
      ? Math.round(allGaps.reduce(function (a, b) { return a + b; }, 0) / allGaps.length)
      : DEFAULT_CYCLE_DAYS;

    var blocked = _blockedSet();
    var now = Date.now();
    var out = [];
    Object.keys(byUser).forEach(function (id) {
      if (blocked[id]) return;
      var u = byUser[id];
      var cvs = u.cvs.sort(function (a, b) { return a - b; });
      var gaps = [];
      for (var i = 1; i < cvs.length; i++) {
        var g = (cvs[i] - cvs[i - 1]) / 86400000;
        if (g >= 7) gaps.push(g);
      }
      var cycle = gaps.length
        ? Math.round(gaps.reduce(function (a, b) { return a + b; }, 0) / gaps.length)
        : globalCycle;
      var lastCv = cvs[cvs.length - 1];
      var daysSince = Math.floor((now - lastCv.getTime()) / 86400000);
      if (daysSince >= cycle) {
        out.push({ userId: id, name: u.name, lastCv: lastCv, cycleDays: cycle, daysSince: daysSince });
      }
    });
    out.sort(function (a, b) { return (b.daysSince / b.cycleDays) - (a.daysSince / a.cycleDays); });
    return out;
  }

  // -------------------------------------------------------------------------
  // ④' 開封見込みスコア（一斉送信の宛先選定用）
  // -------------------------------------------------------------------------

  /**
   * 全ユーザーの「開封してくれそう度」スコア。
   *  直近活動(最大40) + 反応頻度(最大20) + 予約実績(10) + 過去配信への反応率(最大20)。
   *  2回以上配信して一度も反応がない人は -15（枠の無駄を学習して後回し）。
   * 戻り値: {userId: {score, sendRate('m/k'または'')}}
   */
  function engagementScores() {
    var byUser = {};
    _logs().forEach(function (l) {
      var u = byUser[l.userId] || (byUser[l.userId] = { last: l.at, reactions: 0, cv: 0, times: [] });
      if (l.at > u.last) u.last = l.at;
      u.times.push(l.at.getTime());
      if (l.category !== 'ブロック/削除' && l.category !== '友だち追加' && l.category !== 'ポストバック') {
        u.reactions++;
      }
      if (l.cv) u.cv++;
    });
    Object.keys(byUser).forEach(function (id) {
      byUser[id].times.sort(function (a, b) { return a - b; });
    });

    // 過去の配信への反応実績（配信先履歴 × その後48時間のログ）
    var sends = {};   // userId -> {k: 受信回数, m: 反応した回数}
    var sheet = _ss().getSheetByName('配信先履歴');
    if (sheet && sheet.getLastRow() >= 2) {
      sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues().forEach(function (r) {
        if (!(r[0] instanceof Date) || !r[1]) return;
        var s = sends[r[1]] || (sends[r[1]] = { k: 0, m: 0 });
        s.k++;
        var t0 = r[0].getTime(), t1 = t0 + REACT_WINDOW_H * 3600 * 1000;
        var times = byUser[r[1]] ? byUser[r[1]].times : [];
        for (var i = 0; i < times.length; i++) {
          if (times[i] > t0 && times[i] <= t1) { s.m++; break; }
        }
      });
    }

    var now = Date.now();
    var out = {};
    Object.keys(byUser).forEach(function (id) {
      var u = byUser[id];
      var days = (now - u.last.getTime()) / 86400000;
      var rec = days <= 3 ? 40 : days <= 7 ? 35 : days <= 14 ? 30 : days <= 30 ? 20 : days <= 60 ? 10 : days <= 90 ? 5 : 0;
      var freq = Math.min(u.reactions, 10) * 2;
      var cvBonus = u.cv > 0 ? 10 : 0;
      var s = sends[id], sendScore = 0, rate = '';
      if (s && s.k > 0) {
        sendScore = (s.k >= 2 && s.m === 0) ? -15 : Math.round(20 * (s.m / s.k));
        rate = s.m + '/' + s.k;
      }
      out[id] = { score: rec + freq + cvBonus + sendScore, sendRate: rate };
    });
    return out;
  }

  // -------------------------------------------------------------------------
  // シート書き出し＆週次メール（毎朝トリガーから呼ばれる）
  // -------------------------------------------------------------------------

  function refreshSheets() {
    var ss = _ss();

    // ヒートマップ
    var hm = heatmap();
    var sheet = ss.getSheetByName('ヒートマップ') || ss.insertSheet('ヒートマップ');
    sheet.clearContents();
    var header = ['曜日\\時'].concat(Array.from({ length: 24 }, function (_, h) { return h; }));
    var rows = [header];
    for (var d = 0; d < 7; d++) rows.push([DOW[d]].concat(hm.matrix[d]));
    rows.push([]);
    rows.push([hm.label || 'データが貯まると、おすすめ配信タイムが出ます']);
    sheet.getRange(1, 1, rows.length, 25).setValues(rows.map(function (r) {
      while (r.length < 25) r.push('');
      return r;
    }));

    // そろそろリスト
    var due = dueList();
    var s2 = ss.getSheetByName('そろそろリスト') || ss.insertSheet('そろそろリスト');
    s2.clearContents();
    s2.getRange(1, 1, 1, 5).setValues([['userId', '表示名', '前回予約', '推定サイクル(日)', '経過日数']])
      .setFontWeight('bold');
    if (due.length) {
      s2.getRange(2, 1, due.length, 5).setValues(due.map(function (u) {
        return [u.userId, u.name, u.lastCv, u.cycleDays, u.daysSince];
      }));
    }
    return { heatmapBest: hm.label, dueCount: due.length };
  }

  function _quotaLine() {
    try {
      var token = _props().getProperty('LINE_CHANNEL_ACCESS_TOKEN');
      if (!token) return '';
      var opt = { headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true };
      var q = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/quota', opt);
      var c = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/quota/consumption', opt);
      if (q.getResponseCode() !== 200 || c.getResponseCode() !== 200) return '';
      var quota = JSON.parse(q.getContentText());
      var used = JSON.parse(c.getContentText()).totalUsage || 0;
      if (quota.type !== 'limited') return '配信通数: 今月 ' + used + '通';
      return '配信通数: 今月 ' + used + '/' + quota.value + '通（残り ' + (quota.value - used) + '通）';
    } catch (e) { return ''; }
  }

  /** 先週(直近7日)のサマリーをメール送信 */
  function emailWeekly() {
    var to = _props().getProperty('LINE_REPORT_EMAIL') || Session.getEffectiveUser().getEmail();
    if (!to) return { sent: false };

    var weekAgo = Date.now() - 7 * 86400000;
    var newFriends = 0, cvs = 0, blocks = 0, activeUsers = {};
    _logs().forEach(function (l) {
      if (l.at.getTime() < weekAgo) return;
      if (l.category === '友だち追加') newFriends++;
      else if (l.category === 'ブロック/削除') blocks++;
      else activeUsers[l.userId] = true;
      if (l.cv) cvs++;
    });

    // ステージ分布（サマリーシートから）
    var stageCounts = {};
    var sheet = _ss().getSheetByName('ユーザー別サマリー');
    if (sheet && sheet.getLastRow() >= 2) {
      sheet.getRange(2, 18, sheet.getLastRow() - 1, 1).getValues().forEach(function (r) {
        var s = r[0];
        if (s) stageCounts[s] = (stageCounts[s] || 0) + 1;
      });
    }
    var stageLine = ['新規', '反応待ち', '反応あり', '予約済み', '休眠', '対象外']
      .map(function (s) { return s + ' ' + (stageCounts[s] || 0); }).join(' / ');

    var hm = heatmap();
    var due = dueList();
    var dueNames = due.slice(0, 5).map(function (u) {
      return '・' + (u.name || u.userId) + '（前回から' + u.daysSince + '日・サイクル' + u.cycleDays + '日）';
    }).join('\n');

    var body =
      '上野医院 LINE 週次サマリー（過去7日）\n' +
      '======================================\n' +
      '新規友だち: ' + newFriends + '人\n' +
      '反応があった人: ' + Object.keys(activeUsers).length + '人\n' +
      '予約フォーム返信(CV): ' + cvs + '件\n' +
      'ブロック: ' + blocks + '人\n' +
      (_quotaLine() ? _quotaLine() + '\n' : '') +
      '\n【ステージ分布】\n' + stageLine + '\n' +
      '\n【そろそろ来院時期の人: ' + due.length + '人】\n' +
      (dueNames || 'なし') + '\n' +
      (hm.label ? '\n【' + hm.label + '】\n' : '') +
      '\n配信ページ: GASの ?page=line から。詳細は「そろそろリスト」「ヒートマップ」シート参照。\n';

    MailApp.sendEmail(to, '【上野医院】LINE週次サマリー ' +
      Utilities.formatDate(new Date(), 'Asia/Tokyo', 'M/d'), body);
    return { sent: true, to: to };
  }

  /** 毎朝トリガーから呼ぶ: シート更新＋月曜のみ週次メール */
  function daily() {
    var r = refreshSheets();
    if (new Date().getDay() === 1) {   // 月曜
      try { r.mail = emailWeekly(); } catch (e) {
        Logger.log('[Insights] weekly mail failed: ' + e.message);
      }
    }
    return r;
  }

  return {
    sendEffects: sendEffects,
    heatmap: heatmap,
    dueList: dueList,
    engagementScores: engagementScores,
    refreshSheets: refreshSheets,
    emailWeekly: emailWeekly,
    daily: daily,
  };
})();

/** エディタから手動実行: 週次メールを今すぐ送ってみる（テスト用） */
function sendWeeklyReportNow() {
  Logger.log(JSON.stringify(Insights.emailWeekly()));
}
