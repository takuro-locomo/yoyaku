/**
 * FollowUp.gs - LINE追いかけ配信＋ステージ管理（営業メッセージの直接送信）
 *
 * 「ユーザー別サマリー」からグループ（ステージ別6種／追いかけ★／アクティブ上位50・100・150人）
 * を作り、multicastでメッセージを直接送る。スマホ用ページ(?page=line)から操作する。
 * チェックを外した人には送らない（個別送信＝月200通の節約用）。
 * ステージの手動変更・文面テンプレート・今月の残り通数表示にも対応（Stage.gs / Templates.gs）。
 *
 * 保護: ScriptProperties(LINE_CONSOLE_PIN) のPINが一致しないと一覧も送信も不可。
 *       「対象外」ステージ（ブロック・手動除外）には送信できない。
 * 記録: 「配信ログ」シート（1送信1行）と「配信先履歴」シート（1人1行・反応待ち判定用）。
 * 注意: 無料プランは月200通まで（1回の送信で送信人数分を消費）。残量超過は送信前にブロック。
 * 母数: 行動ログ(2026-07-02開始)に現れたユーザーだけが対象。時間とともに増える。
 */

const FollowUp = (() => {

  const SHEET_SUMMARY = 'ユーザー別サマリー';
  const SHEET_SENDLOG = '配信ログ';
  // ユーザー別サマリーの列位置（SegmentSummary.HEADERS と対応）
  const COL = {
    userId: 0, name: 1, last: 3, total: 4, reserveBtn: 5,
    cv: 12, blocked: 13, level: 14, interest: 15, followUp: 16,
    stage: 17, lastSend: 18, stageMemo: 19, stageManual: 20, lastTalk: 21,
  };
  const NUM_COLS = 22;

  const GROUPS = {
    engaged:      { label: '開封見込み順（今日送った人は除外）', excludeDays: 1 },
    engaged_2d:   { label: '開封見込み順（2日以内に送った人は除外）', excludeDays: 2 },
    engaged_3d:   { label: '開封見込み順（3日以内に送った人は除外）', excludeDays: 3 },
    engaged_1w:   { label: '開封見込み順（1週間以内に送った人は除外）', excludeDays: 7 },
    engaged_2w:   { label: '開封見込み順（2週間以内に送った人は除外）', excludeDays: 14 },
    due:      { label: 'そろそろ時期（来院サイクル超過）' },
    followup: { label: '追いかけ対象（色々見て予約ボタン→未予約）' },
    top50:    { label: 'アクティブ上位50人',  n: 50 },
    top100:   { label: 'アクティブ上位100人', n: 100 },
    top150:   { label: 'アクティブ上位150人', n: 150 },
    // 未送信期間別
    nosend_1w:  { label: '1週間以上 未送信', nosendDays: 7 },
    nosend_2w:  { label: '2週間以上 未送信', nosendDays: 14 },
    nosend_3w:  { label: '3週間以上 未送信', nosendDays: 21 },
    nosend_1m:  { label: '1ヶ月以上 未送信', nosendDays: 30 },
    nosend_2m:  { label: '2ヶ月以上 未送信', nosendDays: 60 },
    nosend_3m:  { label: '3ヶ月以上 未送信', nosendDays: 90 },
    // 客からの手動トーク（自由入力・スタンプ等。ボタンタップは含まない）が途絶えている人
    notalk_1w:  { label: '1週間以上 客からトークなし', notalkDays: 7 },
    notalk_1m:  { label: '1ヶ月以上 客からトークなし', notalkDays: 30 },
    notalk_3m:  { label: '3ヶ月以上 客からトークなし', notalkDays: 90 },
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
      lastTalk: _fmt(r[COL.lastTalk]),
      stageMemo: r[COL.stageMemo] || '',
      stageManual: r[COL.stageManual] === 1,
    };
  }

  /**
   * 今月の配信通数（LINE API）。取得できなければnull（画面には出さないだけ）。
   * quota: {type:'limited', value:200} または {type:'none'}（従量プラン等）
   */
  function _quota() {
    var token = _props().getProperty('LINE_CHANNEL_ACCESS_TOKEN');
    if (!token) return null;
    try {
      var opt = { headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true };
      var q = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/quota', opt);
      var c = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/quota/consumption', opt);
      if (q.getResponseCode() !== 200 || c.getResponseCode() !== 200) return null;
      var quota = JSON.parse(q.getContentText());
      var used = JSON.parse(c.getContentText()).totalUsage || 0;
      var limit = (quota.type === 'limited') ? quota.value : null;
      return {
        limit: limit,
        used: used,
        remaining: (limit != null) ? Math.max(0, limit - used) : null,
      };
    } catch (e) {
      Logger.log('[FollowUp] quota fetch failed (ignored): ' + e.message);
      return null;
    }
  }

  /** 最近の配信履歴（新しい順にn件）: 配信ログ＋48時間以内の反応数（Insights） */
  function _recentSends(n) {
    var sheet = _ss().getSheetByName(SHEET_SENDLOG);
    if (!sheet || sheet.getLastRow() < 2) return [];
    var last = sheet.getLastRow();
    var num = Math.min(n, last - 1);
    var rows = sheet.getRange(last - num + 1, 1, num, 5).getValues();
    var effects = [];
    try { effects = Insights.sendEffects(n * 2); } catch (e) {
      Logger.log('[FollowUp] sendEffects failed (ignored): ' + e.message);
    }
    return rows.reverse().map(function (r) {
      var atMs = (r[0] instanceof Date) ? r[0].getTime() : 0;
      var group = String(r[1] || '');
      var eff = null;
      effects.forEach(function (b) {   // 同一送信の突き合わせ: 2分以内＋同グループ
        if (!eff && Math.abs(b.atMs - atMs) < 120000 && b.group === group) eff = b;
      });
      return {
        at: _fmt(r[0]),
        group: group,
        count: r[2] || 0,
        ok: String(r[3] || '').indexOf('OK') === 0,
        head: String(r[4] || '').replace(/\n/g, ' ').slice(0, 40),
        reacted: eff ? eff.reacted : null,   // null=個人記録がない古い配信
        cvAfter: eff ? eff.cv : null,
        blockedAfter: eff ? eff.blocked : null,
      };
    });
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
    var quotaInfo = _quota();   // 開封見込みの選定人数にも使うので先に1回だけ取得
    var picked;
    var dueInfo = {};      // userId -> 'そろそろ' の説明文
    var engagedInfo = {};  // userId -> '📈スコア◯…' の説明文
    if (g.stage) {
      // ステージ別。「対象外」だけはブロック済みも含めて表示（確認用）
      var base = (g.stage === '対象外') ? rows : alive;
      picked = base.filter(function (r) { return r[COL.stage] === g.stage; });
    } else if (g.excludeDays) {
      // 開封見込みスコア順に、今月の残り通数ぶん（上限200人）を自動選定。
      // 手動「対象外」は除外（ブロックはaliveで除外済み）
      // excludeDays以内に送った人は自動除外
      var scores = Insights.engagementScores();
      var lastSendMap = Stage.getLastSendMap();
      var cutoff = new Date();
      if (g.excludeDays === 1) {
        cutoff.setHours(0, 0, 0, 0);  // 今日の0時以降
      } else {
        cutoff.setDate(cutoff.getDate() - g.excludeDays);
      }
      var cutoffMs = cutoff.getTime();
      var cap = (quotaInfo && quotaInfo.remaining != null) ? quotaInfo.remaining : 200;
      cap = Math.max(0, Math.min(cap, 200));
      picked = alive.filter(function (r) {
        if (r[COL.stage] === '対象外') return false;
        var ls = lastSendMap[r[COL.userId]];
        if (ls && ls.getTime() >= cutoffMs) return false;
        return true;
      });
      picked.sort(function (a, b) {
        var sa = scores[a[COL.userId]] ? scores[a[COL.userId]].score : 0;
        var sb = scores[b[COL.userId]] ? scores[b[COL.userId]].score : 0;
        return sb - sa;
      });
      picked = picked.slice(0, cap);
      picked.forEach(function (r) {
        var s = scores[r[COL.userId]];
        if (s) {
          engagedInfo[r[COL.userId]] = 'スコア' + s.score + (s.sendRate ? '（配信反応 ' + s.sendRate + '）' : '');
        }
      });
    } else if (group === 'due') {
      // 来院サイクル超過（Insightsで推定）。超過率の大きい順
      var due = Insights.dueList();
      var order = {};
      due.forEach(function (u, i) {
        order[u.userId] = i;
        dueInfo[u.userId] = '前回予約から' + u.daysSince + '日（サイクル約' + u.cycleDays + '日）';
      });
      picked = alive.filter(function (r) { return dueInfo[r[COL.userId]] !== undefined; });
      picked.sort(function (a, b) { return order[a[COL.userId]] - order[b[COL.userId]]; });
    } else if (g.notalkDays) {
      // 客からの手動トーク（ボタンタップ以外）が一定期間ない人。
      // 一度もトークがない人も含める（対象外ステージは除外）
      var cutoffT = new Date();
      cutoffT.setDate(cutoffT.getDate() - g.notalkDays);
      var cutoffTMs = cutoffT.getTime();
      picked = alive.filter(function (r) {
        if (r[COL.stage] === '対象外') return false;
        var lt = r[COL.lastTalk];
        if (!lt || lt === '') return true;   // 一度も手動トークがない人
        var ltDate = (lt instanceof Date) ? lt : new Date(lt);
        return !isNaN(ltDate.getTime()) && ltDate.getTime() < cutoffTMs;
      });
      // トークが古い順（一度もない人が先頭）
      picked.sort(function (a, b) {
        var da = a[COL.lastTalk] instanceof Date ? a[COL.lastTalk].getTime() : 0;
        var db = b[COL.lastTalk] instanceof Date ? b[COL.lastTalk].getTime() : 0;
        return da - db;
      });
    } else if (g.nosendDays) {
      // 一定期間こちらが送信していない人（対象外ステージは除外）
      var cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - g.nosendDays);
      var cutoffMs = cutoff.getTime();
      picked = alive.filter(function (r) {
        if (r[COL.stage] === '対象外') return false;
        var ls = r[COL.lastSend];
        if (!ls || ls === '') return true;  // 一度も送っていない人は含める
        var lsDate = (ls instanceof Date) ? ls : new Date(ls);
        return !isNaN(lsDate.getTime()) && lsDate.getTime() < cutoffMs;
      });
      // 最終送信が古い順にソート
      picked.sort(function (a, b) {
        var da = a[COL.lastSend] instanceof Date ? a[COL.lastSend].getTime() : 0;
        var db = b[COL.lastSend] instanceof Date ? b[COL.lastSend].getTime() : 0;
        return da - db;
      });
    } else if (group === 'followup') {
      picked = alive.filter(function (r) { return r[COL.followUp] === '★'; });
    } else {
      picked = alive.slice(0, g.n);   // サマリーは最終アクティブ降順
    }
    var users = picked.map(_toUser);
    users.forEach(function (u) {
      if (dueInfo[u.userId]) u.due = dueInfo[u.userId];
      if (engagedInfo[u.userId]) u.engage = engagedInfo[u.userId];
    });
    return {
      group: group,
      groupLabel: g.label,
      groupStage: g.stage || '',   // ステージ別グループのときのステージ名
      totalLogged: alive.length,   // 母数（ログに現れたブロック以外の全員）
      count: picked.length,
      users: users,
      stageCounts: _stageCounts(rows),
      stages: Stage.STAGES,
      templates: Templates.list(),
      quota: quotaInfo,   // {limit, used, remaining} または null
      recentSends: _recentSends(5),
      bestTimeLabel: Insights.heatmap().label,   // おすすめ配信タイム
      dueCount: (group === 'due') ? picked.length : Insights.dueList().length,
    };
  }

  function _sendLogSheet() {
    var sheet = _ss().getSheetByName(SHEET_SENDLOG) || _ss().insertSheet(SHEET_SENDLOG);
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, 6)
        .setValues([['日時', 'グループ', '送信人数', '結果', '本文', '送信先(表示名)']]).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
    return sheet;
  }

  /**
   * 手動チャット送信の記録（📋本文コピー→公式LINEアプリのチャットで送った分）。
   * API送信ではないので通数は消費しない。「配信先履歴」に残すことで、
   * ステージの「反応待ち」判定・「◯◯以上 未送信」グループ・開封見込みスコアに反映される。
   * users: [{userId, name}]（画面でチェックした人）
   */
  function recordManual(pin, users, text) {
    _checkPin(pin);
    if (!users || !users.length) throw new Error('記録する相手が選ばれていません。');
    var byId = {}, ids = [];
    users.forEach(function (u) {
      if (u && u.userId && !byId[u.userId]) {
        byId[u.userId] = u.name || '(名前なし)';
        ids.push(u.userId);
      }
    });
    if (!ids.length) throw new Error('記録する相手が選ばれていません。');
    var names = ids.map(function (id) { return byId[id]; });
    _sendLogSheet().appendRow([
      new Date(), '手動チャット', ids.length, 'OK(手動)',
      String(text || '').slice(0, 500), names.join('、'),
    ]);
    Stage.recordSends(ids, byId, '手動チャット');
    return { recorded: ids.length, names: names };
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

  /** KPIレポート（?page=report 用）: 週次8週＋月次6ヶ月＋残り通数 */
  function getReport(pin) {
    _checkPin(pin);
    var r = Insights.kpi();
    r.quota = _quota();
    return r;
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

    // 月間上限の事前チェック（取得できないときはスキップしてLINE側のエラーに任せる）
    var quota = _quota();
    if (quota && quota.remaining != null && targets.length > quota.remaining) {
      throw new Error('今月の残り通数(' + quota.remaining + '通)を超えるため送信できません（送信予定: ' + targets.length + '人）。');
    }

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
    var logSheet = _sendLogSheet();
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

  return { getList: getList, send: send, setup: setup, setStage: setStage, saveTemplate: saveTemplate, getReport: getReport, recordManual: recordManual };
})();

// --- スマホ用ページ(?page=line / ?page=report)の google.script.run から呼ばれる ---
function lineConsoleGetList(pin, group) { return FollowUp.getList(pin, group); }
function lineConsoleGetReport(pin) { return FollowUp.getReport(pin); }
function lineConsoleSend(text, pin, userIds, groupLabel) { return FollowUp.send(text, pin, userIds, groupLabel); }
function lineConsoleSetStage(pin, userId, name, stage, memo) { return FollowUp.setStage(pin, userId, name, stage, memo); }
function lineConsoleSaveTemplate(pin, stage, title, body) { return FollowUp.saveTemplate(pin, stage, title, body); }
function lineConsoleRecordManual(pin, users, text) { return FollowUp.recordManual(pin, users, text); }

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
