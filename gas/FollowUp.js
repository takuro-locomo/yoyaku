/**
 * FollowUp.gs - LINE追いかけ配信＋ステージ管理（営業メッセージの直接送信）
 *
 * 「ユーザー別サマリー」からグループ（ステージ別6種／追いかけ★／アクティブ上位50・100・150人）
 * を作り、multicastでメッセージを直接送る。スマホ用ページ(?page=line)から操作する。
 * グループは複数を「かつ(AND=絞り込み)」「または(OR=合体)」でかけ合わせられる（2026-08-25）。
 * チェックを外した人には送らない（個別送信＝月200通の節約用）。
 * ステージの手動変更・文面テンプレート・今月の残り通数表示にも対応（Stage.gs / Templates.gs）。
 *
 * 保護: PINは廃止（2026-08-13）。URLを知っている人だけが開ける前提の運用。
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
    stage: 17, lastSend: 18, stageMemo: 19, stageManual: 20, lastTalk: 21, lastCv: 22,
  };
  const NUM_COLS = 23;

  const GROUPS = {
    // 目的別（予約回数で属性を分け、誤った訴求＝リピーターに「ぜひ一度」等を防ぐ）
    purpose_first:    { label: '🎯新規予約促進（予約0回の人だけ）', purpose: 'first',
      note: '全員「予約0回」の人です。「初めての方へ」「ぜひ一度お試しください」の訴求OK。' },
    purpose_interest: { label: '🎯興味あり・未予約（予約0回＆ボタン反応あり）', purpose: 'interest',
      note: '全員「予約0回」ですがボタンを押して興味を示した人です。あと一押しの文面（初回特典・不安解消など）が有効。' },
    purpose_rebook_1m: { label: '🎯再予約促進（予約経験あり・最終予約から1ヶ月以上）', purpose: 'rebook', days: 30,
      note: '全員「予約経験あり」の人です。「ぜひ一度」など新規向けの文面はNG。「またのご来院」「前回の◯◯はいかがでしたか」の訴求で。' },
    purpose_rebook_2m: { label: '🎯再予約促進（予約経験あり・最終予約から2ヶ月以上）', purpose: 'rebook', days: 60,
      note: '全員「予約経験あり」の人です。「ぜひ一度」など新規向けの文面はNG。「またのご来院」の訴求で。' },
    purpose_rebook_3m: { label: '🎯再予約促進（予約経験あり・最終予約から3ヶ月以上）', purpose: 'rebook', days: 90,
      note: '全員「予約経験あり」の人です。「ぜひ一度」など新規向けの文面はNG。お久しぶりの再来院を促す文面で。' },
    purpose_loyal:    { label: '🎯ロイヤル顧客（予約2回以上のリピーター）', purpose: 'loyal',
      note: '全員「予約2回以上」のリピーターです。特別感・優先案内・感謝の訴求が有効。新規向け文面はNG。' },
    purpose_all:      { label: '🎯新製品・お知らせ（送信可能な全員）', purpose: 'all',
      note: '新規もリピーターも混ざっています。誰が読んでも違和感のない中立な文面にしてください（「ぜひ一度」「いつもありがとう」はNG）。' },
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
    // 興味あり（予約ボタンを押した or ボタン2種類以上）なのに客からトークがない人
    notalk_hot_1w: { label: '興味あり＆1週間以上 客からトークなし', notalkDays: 7,  hot: true },
    notalk_hot_2w: { label: '興味あり＆2週間以上 客からトークなし', notalkDays: 14, hot: true },
    notalk_hot_1m: { label: '興味あり＆1ヶ月以上 客からトークなし', notalkDays: 30, hot: true },
    // ステージ別
    stage_new:       { label: 'ステージ: 新規',     stage: '新規' },
    stage_untouched: { label: 'ステージ: 反応待ち', stage: '反応待ち' },
    stage_connected: { label: 'ステージ: 反応あり', stage: '反応あり' },
    stage_converted: { label: 'ステージ: 予約済み', stage: '予約済み' },
    stage_recycle:   { label: 'ステージ: 休眠',     stage: '休眠' },
    stage_archive:   { label: 'ステージ: 対象外',   stage: '対象外' },
  };

  function _props() { return PropertiesService.getScriptProperties(); }

  // PINは廃止（引数は互換のため残す）
  function _checkPin(pin) { }

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
      cv: Number(r[COL.cv]) || 0,
      lastCv: _fmt(r[COL.lastCv]),
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

  /**
   * 行動ログの「内容(テキスト)」からキーワード該当者を集める。
   * リッチメニューの施術ボタンはテキスト送信型なので、タップ＝その文言のメッセージとしてログに残る。
   * 予約フォーム返信(CV)は「ご希望の施術」を含む全文が残るため、予約した施術も拾える。
   * 戻り値: {userId: {talkN, talkLast, cvN, cvLast}}（talk=CV以外のタップ・トーク）
   */
  function _keywordMatch(keyword) {
    var out = {};
    var sheet = _ss().getSheetByName('ログ');
    if (!sheet || sheet.getLastRow() < 2) return out;
    var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 7).getValues();
    var kw = String(keyword).toLowerCase();
    rows.forEach(function (r) {
      var text = String(r[5] || '');
      if (!text || text.toLowerCase().indexOf(kw) === -1) return;
      var id = r[1];
      if (!id || String(id).indexOf('U_TEST') === 0) return;
      var e = out[id] = out[id] || { talkN: 0, talkLast: null, cvN: 0, cvLast: null };
      var isCv = r[6] === 1 || String(r[4]) === '★予約フォーム返信(CV)';
      if (isCv) {
        e.cvN++;
        if (!e.cvLast || r[0] > e.cvLast) e.cvLast = r[0];
      } else {
        e.talkN++;
        if (!e.talkLast || r[0] > e.talkLast) e.talkLast = r[0];
      }
    });
    return out;
  }

  // キーワード絞り込みの範囲（UIのセレクトと対応）
  var KW_SCOPES = {
    any:       'タップ・トーク・予約フォームのどれか',
    talk:      'タップ・トークで触れた人',
    talk_nocv: 'タップ・トークのみ（その施術は未予約）',
    cv:        '予約フォームで申し込んだ人',
  };

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
   * 1グループぶんの対象者を抽出する（かけ合わせ配信でも使うため独立させた）。
   * 戻り値: { picked: サマリー行の配列（そのグループの並び順）,
   *           info: {userId: {due/engage/hot/why の説明文}} }
   */
  function _pickGroup(group, rows, alive, quotaInfo) {
    var g = GROUPS[group];
    var picked;
    var dueInfo = {};      // userId -> 'そろそろ' の説明文
    var engagedInfo = {};  // userId -> '📈スコア◯…' の説明文
    var hotInfo = {};      // userId -> '🔥興味あり' の説明文
    var purposeInfo = {};  // userId -> '🎯選定理由' の説明文
    if (g.purpose) {
      // 目的別: 予約回数(CV)と最終予約日で属性を分ける（対象外ステージは除外）
      var base2 = alive.filter(function (r) { return r[COL.stage] !== '対象外'; });
      var cvOf = function (r) { return Number(r[COL.cv]) || 0; };
      if (g.purpose === 'first') {
        // 一度も予約していない全員
        picked = base2.filter(function (r) { return cvOf(r) === 0; });
      } else if (g.purpose === 'interest') {
        // 予約0回だが、予約ボタンを押した or ボタン2種類以上 = 興味あり
        picked = base2.filter(function (r) {
          if (cvOf(r) !== 0) return false;
          var reserve = Number(r[COL.reserveBtn]) || 0;
          var kinds = 0;
          for (var c = 5; c <= 10; c++) if ((Number(r[c]) || 0) > 0) kinds++;
          if (reserve === 0 && kinds < 2) return false;
          var parts = [];
          if (reserve > 0) parts.push('予約ボタン' + reserve + '回');
          if (kinds >= 2) parts.push('ボタン' + kinds + '種');
          purposeInfo[r[COL.userId]] = parts.join('・');
          return true;
        });
        // 興味の強い順（予約ボタン回数→ボタン種類数）
        picked.sort(function (a, b) {
          var ra = Number(a[COL.reserveBtn]) || 0, rb = Number(b[COL.reserveBtn]) || 0;
          if (rb !== ra) return rb - ra;
          var ka = 0, kb = 0;
          for (var c = 5; c <= 10; c++) {
            if ((Number(a[c]) || 0) > 0) ka++;
            if ((Number(b[c]) || 0) > 0) kb++;
          }
          return kb - ka;
        });
      } else if (g.purpose === 'rebook') {
        // 予約経験あり＆最終予約からg.days日以上経過
        var cutoffP = new Date();
        cutoffP.setDate(cutoffP.getDate() - g.days);
        var cutoffPMs = cutoffP.getTime();
        picked = base2.filter(function (r) {
          if (cvOf(r) < 1) return false;
          var lc = r[COL.lastCv];
          var lcDate = (lc instanceof Date) ? lc : new Date(lc);
          if (!lc || lc === '' || isNaN(lcDate.getTime())) {
            // 予約はあるが日付不明（列追加前の旧サマリー等）→ 含めて理由に明記
            purposeInfo[r[COL.userId]] = '予約' + cvOf(r) + '回（最終予約日は不明）';
            return true;
          }
          if (lcDate.getTime() >= cutoffPMs) return false;
          purposeInfo[r[COL.userId]] = '予約' + cvOf(r) + '回・最終予約 ' + _fmt(lcDate);
          return true;
        });
        // 最終予約が古い順
        picked.sort(function (a, b) {
          var da = a[COL.lastCv] instanceof Date ? a[COL.lastCv].getTime() : 0;
          var db = b[COL.lastCv] instanceof Date ? b[COL.lastCv].getTime() : 0;
          return da - db;
        });
      } else if (g.purpose === 'loyal') {
        // 予約2回以上のリピーター（回数の多い順）
        picked = base2.filter(function (r) {
          if (cvOf(r) < 2) return false;
          var lc2 = r[COL.lastCv];
          purposeInfo[r[COL.userId]] = '予約' + cvOf(r) + '回'
            + (lc2 instanceof Date ? '・最終予約 ' + _fmt(lc2) : '');
          return true;
        });
        picked.sort(function (a, b) { return cvOf(b) - cvOf(a); });
      } else {
        // 'all': 新製品・お知らせ（送信可能な全員）
        picked = base2;
      }
    } else if (g.stage) {
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
      if (g.hot) {
        // 興味あり = 予約ボタン1回以上 or メニュー系ボタン2種類以上
        // （サマリーの列5〜10 = 予約/キャンペーン/施術メニュー/よくある質問/アクセス/HP）
        picked = picked.filter(function (r) {
          var reserve = Number(r[5]) || 0;
          var kinds = 0;
          for (var c = 5; c <= 10; c++) if ((Number(r[c]) || 0) > 0) kinds++;
          if (reserve === 0 && kinds < 2) return false;
          var parts = [];
          if (reserve > 0) parts.push('予約ボタン' + reserve + '回');
          if (kinds >= 2) parts.push('ボタン' + kinds + '種');
          hotInfo[r[COL.userId]] = parts.join('・');
          return true;
        });
        // 興味の強い順（予約ボタン回数→ボタン種類数→トークが古い順）
        picked.sort(function (a, b) {
          var ra = Number(a[5]) || 0, rb = Number(b[5]) || 0;
          if (rb !== ra) return rb - ra;
          var ka = 0, kb = 0;
          for (var c = 5; c <= 10; c++) {
            if ((Number(a[c]) || 0) > 0) ka++;
            if ((Number(b[c]) || 0) > 0) kb++;
          }
          if (kb !== ka) return kb - ka;
          var da = a[COL.lastTalk] instanceof Date ? a[COL.lastTalk].getTime() : 0;
          var db = b[COL.lastTalk] instanceof Date ? b[COL.lastTalk].getTime() : 0;
          return da - db;
        });
      } else {
        // トークが古い順（一度もない人が先頭）
        picked.sort(function (a, b) {
          var da = a[COL.lastTalk] instanceof Date ? a[COL.lastTalk].getTime() : 0;
          var db = b[COL.lastTalk] instanceof Date ? b[COL.lastTalk].getTime() : 0;
          return da - db;
        });
      }
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
    var info = {};
    [['due', dueInfo], ['engage', engagedInfo], ['hot', hotInfo], ['why', purposeInfo]].forEach(function (p) {
      Object.keys(p[1]).forEach(function (id) { (info[id] = info[id] || {})[p[0]] = p[1][id]; });
    });
    return { picked: picked, info: info };
  }

  /**
   * グループの一覧を返す。
   * group: 'followup'（★のみ・現行条件） / 'top50' / 'top100' / 'top150'
   *        （top系＝ブロック以外を最終アクティブの新しい順に上位N人）
   * combo: {groups: ['nosend_1m', ...], mode: 'and'|'or'} を渡すと、メイングループと
   *        追加グループを「かつ(AND=全条件を満たす人だけ)」「または(OR=どれかに当てはまる人)」でかけ合わせる。
   * keyword: {text: 'ハイドロ', scope: 'any'|'talk'|'talk_nocv'|'cv'} を渡すと、
   *          行動ログの内容にそのキーワードを含む人だけにさらに絞り込む（施術名の抽出用）。
   */
  function getList(pin, group, excludeManualDays, combo, keyword) {
    _checkPin(pin);
    group = GROUPS[group] ? group : 'followup';
    var rows = _rows();
    var alive = rows.filter(function (r) { return r[COL.blocked] !== 1; });  // ブロック除外
    var quotaInfo = _quota();   // 開封見込みの選定人数にも使うので先に1回だけ取得

    // かけ合わせ対象のグループ列（先頭=メイングループ。重複と不明キーは捨てる）
    var keys = [group];
    var mode = 'and';
    if (combo && combo.groups && combo.groups.length) {
      combo.groups.forEach(function (k) {
        if (GROUPS[k] && keys.indexOf(k) === -1) keys.push(k);
      });
      mode = (combo.mode === 'or') ? 'or' : 'and';
    }
    var results = keys.map(function (k) { return _pickGroup(k, rows, alive, quotaInfo); });

    var picked;
    if (results.length === 1) {
      picked = results[0].picked;
    } else if (mode === 'and') {
      // かつ: 先頭グループの並び順のまま、他の全グループにも入っている人だけ残す
      var sets = results.slice(1).map(function (res) {
        var s = {};
        res.picked.forEach(function (r) { s[r[COL.userId]] = 1; });
        return s;
      });
      picked = results[0].picked.filter(function (r) {
        var id = r[COL.userId];
        for (var i = 0; i < sets.length; i++) if (!sets[i][id]) return false;
        return true;
      });
    } else {
      // または: 先頭グループの並び順を保ち、後のグループで新たに現れた人を後ろに足す
      var seen = {};
      picked = [];
      results.forEach(function (res) {
        res.picked.forEach(function (r) {
          var id = r[COL.userId];
          if (!seen[id]) { seen[id] = 1; picked.push(r); }
        });
      });
    }

    // 選定理由の説明はグループ横断でマージ（同じ項目は先のグループを優先）
    var info = {};
    results.forEach(function (res) {
      Object.keys(res.info).forEach(function (id) {
        var dst = info[id] = info[id] || {};
        var src = res.info[id];
        Object.keys(src).forEach(function (k) { if (!dst[k]) dst[k] = src[k]; });
      });
    });

    // オプション: キーワード絞り込み（例: 「ハイドロ」をタップ・トークした人／予約フォームで申し込んだ人）
    var kwText = (keyword && keyword.text) ? String(keyword.text).trim() : '';
    var kwScope = (keyword && KW_SCOPES[keyword.scope]) ? keyword.scope : 'any';
    if (kwText) {
      var kwMap = _keywordMatch(kwText);
      picked = picked.filter(function (r) {
        var e = kwMap[r[COL.userId]];
        if (!e) return false;
        if (kwScope === 'cv') return e.cvN > 0;
        if (kwScope === 'talk') return e.talkN > 0;
        if (kwScope === 'talk_nocv') return e.talkN > 0 && e.cvN === 0;
        return true;   // any
      });
      picked.forEach(function (r) {
        var e = kwMap[r[COL.userId]];
        if (!e) return;
        var parts = [];
        if (e.talkN) parts.push('タップ・トーク' + e.talkN + '回' + (e.talkLast ? '(最終 ' + _fmt(e.talkLast) + ')' : ''));
        if (e.cvN) parts.push('予約フォーム' + e.cvN + '回' + (e.cvLast ? '(最終 ' + _fmt(e.cvLast) + ')' : ''));
        (info[r[COL.userId]] = info[r[COL.userId]] || {}).kw = '「' + kwText + '」' + parts.join('・');
      });
    }

    // オプション: ◯日以内に手動チャットを送った（✅記録済みの）人をどのグループからも除く
    var excludedManual = 0;
    excludeManualDays = Number(excludeManualDays) || 0;
    if (excludeManualDays > 0) {
      var manualSendMap = Stage.getLastManualSendMap();
      var exCutoffMs = Date.now() - excludeManualDays * 86400000;
      var beforeN = picked.length;
      picked = picked.filter(function (r) {
        var d = manualSendMap[r[COL.userId]];
        return !(d && d.getTime() >= exCutoffMs);
      });
      excludedManual = beforeN - picked.length;
    }

    var users = picked.map(_toUser);
    users.forEach(function (u) {
      var m = info[u.userId];
      if (!m) return;
      if (m.due) u.due = m.due;
      if (m.engage) u.engage = m.engage;
      if (m.hot) u.hot = m.hot;
      if (m.why) u.why = m.why;
      if (m.kw) u.kw = m.kw;
    });

    // ラベルと文面注意: かけ合わせ時は全グループぶんを連結（配信ログにも条件が残る）
    var label = (keys.length === 1)
      ? GROUPS[group].label
      : '【' + keys.map(function (k) { return GROUPS[k].label; }).join((mode === 'or') ? '】または【' : '】かつ【') + '】';
    if (kwText) label += ' ＋🔍「' + kwText + '」(' + KW_SCOPES[kwScope] + ')';
    var notes = [];
    keys.forEach(function (k) {
      var n = GROUPS[k].note;
      if (n && notes.indexOf(n) === -1) notes.push(n);
    });

    return {
      group: group,
      groupLabel: label,
      groupNote: notes.join(' ／ '),   // 目的別グループの文面注意（誤送信防止）
      groupStage: (keys.length === 1 && GROUPS[group].stage) || '',   // ステージ別グループのときのステージ名
      totalLogged: alive.length,   // 母数（ログに現れたブロック以外の全員）
      count: picked.length,
      excludedManual: excludedManual,   // 手動送信済みとして除外した人数
      users: users,
      stageCounts: _stageCounts(rows),
      stages: Stage.STAGES,
      templates: Templates.list(),
      quota: quotaInfo,   // {limit, used, remaining} または null
      recentSends: _recentSends(5),
      bestTimeLabel: Insights.heatmap().label,   // おすすめ配信タイム
      dueCount: (keys.length === 1 && group === 'due') ? picked.length : Insights.dueList().length,
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
   * テキスト＋media（画像・タップ動作）から送信メッセージ配列を組み立てる（本配信・テスト配信共通）。
   * media: {imageUrl, tap:'none'|'url'|'keyword', linkUrl, keyword, replyText, aspect}
   *   tap='url' はタップでリンクを開く。tap='keyword' はタップでキーワードがトークに送信され、
   *   AutoReplyの自動応答（Reply API・通数消費なし）が返る。この登録もここで行う。
   *   テキスト＋画像は1回の送信にまとめるので消費は1人1通のまま。
   * 戻り値: {messages, logTag}
   */
  function _buildMessages(text, media) {
    text = String(text || '').trim();
    var imageUrl = (media && media.imageUrl) ? String(media.imageUrl).trim() : '';
    if (!text && !imageUrl) throw new Error('メッセージか画像URLのどちらかを入力してください。');
    if (text.length > 1000) throw new Error('メッセージが長すぎます（1000文字まで）。');

    // メッセージ組み立て（テキスト→画像の順・最大2吹き出し）
    var messages = [];
    var logTag = '';
    if (text) messages.push({ type: 'text', text: text });
    if (imageUrl) {
      if (imageUrl.indexOf('https://') !== 0) throw new Error('画像URLは https:// で始まる必要があります。');
      var tap = (media.tap === 'url' || media.tap === 'keyword') ? media.tap : 'none';
      if (tap === 'none') {
        // タップ動作なし: 通常の画像メッセージ（元の縦横比のまま届く）
        messages.push({ type: 'image', originalContentUrl: imageUrl, previewImageUrl: imageUrl });
        logTag = '[🖼画像] ';
      } else {
        var action;
        if (tap === 'url') {
          var linkUrl = String(media.linkUrl || '').trim();
          if (linkUrl.indexOf('https://') !== 0) throw new Error('タップで開くURLは https:// で始まる必要があります。');
          action = { type: 'uri', label: '開く', uri: linkUrl };
          logTag = '[🖼画像→リンク] ';
        } else {
          var kw = String(media.keyword || '').trim();
          if (!kw) throw new Error('タップ時に送信されるキーワードを入力してください。');
          if (kw.length > 50) throw new Error('キーワードは50文字までにしてください。');
          // タップ→自動応答を「自動応答」シートに登録（同キーワードは上書き）。本文が空ならここで止まる
          AutoReply.save(kw, media.replyText);
          action = { type: 'message', label: '詳しく見る', text: kw };
          logTag = '[🖼画像→応答:' + kw + '] ';
        }
        var aspect = { '1:1': '1:1', '3:2': '3:2', '16:9': '16:9', '2:3': '2:3' }[media.aspect] || '1:1';
        messages.push({
          type: 'flex',
          altText: text ? text.slice(0, 100) : '画像のお知らせ',
          contents: {
            type: 'bubble',
            hero: { type: 'image', url: imageUrl, size: 'full', aspectRatio: aspect, aspectMode: 'cover', action: action },
          },
        });
      }
    }

    return { messages: messages, logTag: logTag };
  }

  /**
   * 指定したuserIdの人だけに送信（チェックを外した人には送らない）。
   * userIds はサマリーに実在しブロックでない人だけに絞ってから送る。
   */
  function send(text, pin, userIds, groupLabel, media) {
    _checkPin(pin);
    text = String(text || '').trim();
    if (!userIds || !userIds.length) throw new Error('送信先が選ばれていません。');
    var built = _buildMessages(text, media);
    var messages = built.messages;
    var logTag = built.logTag;
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
        payload: JSON.stringify({ to: targets.slice(i, i + 500), messages: messages }),
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
      ok ? 'OK' : 'エラー: ' + errors.join(' / '), logTag + text, names.join('、'),
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

  /**
   * テスト配信: 「テスト登録」で登録した自分のLINEに1通だけ送る（Push API・1通消費）。
   * タップ→自動応答の登録も本番同様に行うので、実機でそのままの流れを確認できる。
   * ステージ・配信先履歴には記録しない（テストなので反応待ち判定等に影響させない）。
   */
  function sendTest(pin, text, media) {
    _checkPin(pin);
    var testId = _props().getProperty('LINE_TEST_USER_ID');
    if (!testId) {
      throw new Error('テスト配信先が未登録です。\nご自分のスマホから公式LINEに「テスト登録」とトークを送ってください（自動で登録完了の返信が届きます）。そのあと、もう一度このボタンを押してください。');
    }
    var built = _buildMessages(text, media);
    var quota = _quota();
    if (quota && quota.remaining != null && quota.remaining < 1) {
      throw new Error('今月の残り通数がないためテスト配信できません。');
    }
    var token = _props().getProperty('LINE_CHANNEL_ACCESS_TOKEN');
    if (!token) throw new Error('LINE_CHANNEL_ACCESS_TOKEN が未設定です。');
    var res = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + token },
      payload: JSON.stringify({ to: testId, messages: built.messages }),
      muteHttpExceptions: true,
    });
    if (res.getResponseCode() !== 200) {
      throw new Error('テスト配信でエラー: ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 200));
    }
    _sendLogSheet().appendRow([
      new Date(), '🧪テスト配信', 1, 'OK(テスト)',
      built.logTag + String(text || '').trim(), '(テスト用LINE)',
    ]);
    return { sent: 1 };
  }

  /** 初回セットアップ: 毎朝6時台の自動集計トリガー作成（何度呼んでも安全。PINは廃止） */
  function setup(pin) {
    ScriptApp.getProjectTriggers().forEach(function (t) {
      if (t.getHandlerFunction() === 'updateLineUserSummary') ScriptApp.deleteTrigger(t);
    });
    ScriptApp.newTrigger('updateLineUserSummary').timeBased().everyDays(1).atHour(6).create();
    return { trigger: '毎日6〜7時に updateLineUserSummary を実行' };
  }

  return { getList: getList, send: send, sendTest: sendTest, setup: setup, setStage: setStage, saveTemplate: saveTemplate, getReport: getReport, recordManual: recordManual };
})();

// --- スマホ用ページ(?page=line / ?page=report)の google.script.run から呼ばれる ---
function lineConsoleGetList(pin, group, excludeManualDays, combo, keyword) { return FollowUp.getList(pin, group, excludeManualDays, combo, keyword); }
function lineConsoleGetReport(pin) { return FollowUp.getReport(pin); }
function lineConsoleSend(text, pin, userIds, groupLabel, media) { return FollowUp.send(text, pin, userIds, groupLabel, media); }
function lineConsoleSendTest(pin, text, media) { return FollowUp.sendTest(pin, text, media); }
function lineConsoleSetStage(pin, userId, name, stage, memo) { return FollowUp.setStage(pin, userId, name, stage, memo); }
function lineConsoleSaveTemplate(pin, stage, title, body) { return FollowUp.saveTemplate(pin, stage, title, body); }
function lineConsoleRecordManual(pin, users, text) { return FollowUp.recordManual(pin, users, text); }

/** GASエディタから手動セットアップする用 */
function setupLineDailyFromEditor() {
  Logger.log(JSON.stringify(FollowUp.setup()));
}

/** エディタから実行: 権限承認＋毎朝6時台の自動集計トリガー作成（PIN不要） */
function authorizeAndCreateDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'updateLineUserSummary') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('updateLineUserSummary').timeBased().everyDays(1).atHour(6).create();
  Logger.log('トリガー作成OK: 毎日6〜7時に updateLineUserSummary を自動実行');
}
