/**
 * CustomGroup.gs - カスタム送信グループ（フィルタ条件の保存・呼び出し・削除）
 *
 * 既存のハードコードされたグループ（ステージ別・top50等）に加えて、
 * ユーザーが自由にフィルタ条件を組み合わせたグループを名前付きで保存できる。
 *
 * シート: 「カスタムグループ」
 *   列: id / 名前 / 条件JSON / 作成日時
 *
 * 条件JSON例:
 *   { "stages": ["新規","反応待ち"], "levels": ["ホット"], "star": true, "interests": ["予約"] }
 *
 * 条件はAND結合: 全条件を満たすユーザーだけが対象。
 * 各条件内（stages配列など）はOR: いずれかに合致すればOK。
 * 条件キーが省略 or 空配列 → その項目はフィルタしない（全員通過）。
 */

const CustomGroup = (() => {

  const SHEET_NAME = 'カスタムグループ';
  const HEADERS = ['id', '名前', '条件JSON', '作成日時'];

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

  /** 全カスタムグループ一覧 [{id, name, conditions}] */
  function list() {
    var sheet = _sheet();
    if (sheet.getLastRow() < 2) return [];
    return sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues()
      .filter(function (r) { return r[0] && r[1]; })
      .map(function (r) {
        var cond = {};
        try { cond = JSON.parse(r[2]); } catch (e) {}
        return { id: String(r[0]), name: String(r[1]), conditions: cond };
      });
  }

  /** 保存（同名は上書き） */
  function save(name, conditions) {
    name = String(name || '').trim();
    if (!name) throw new Error('グループ名を入力してください。');
    if (name.length > 30) throw new Error('グループ名は30文字までです。');
    var condJson = JSON.stringify(conditions || {});
    var sheet = _sheet();
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      var rowIndex = 0;
      var existingId = '';
      if (sheet.getLastRow() >= 2) {
        var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
        for (var i = 0; i < rows.length; i++) {
          if (String(rows[i][1]) === name) {
            rowIndex = i + 2;
            existingId = String(rows[i][0]);
            break;
          }
        }
      }
      var id = existingId || Utilities.getUuid();
      var row = [id, name, condJson, new Date()];
      if (rowIndex) {
        sheet.getRange(rowIndex, 1, 1, 4).setValues([row]);
      } else {
        sheet.appendRow(row);
      }
      return { id: id, name: name, conditions: conditions };
    } finally {
      lock.releaseLock();
    }
  }

  /** 削除 */
  function remove(id) {
    if (!id) throw new Error('削除するグループIDがありません。');
    var sheet = _sheet();
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      if (sheet.getLastRow() < 2) throw new Error('グループが見つかりません。');
      var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
      for (var i = 0; i < rows.length; i++) {
        if (String(rows[i][0]) === String(id)) {
          sheet.deleteRow(i + 2);
          return { deleted: true };
        }
      }
      throw new Error('グループが見つかりません。');
    } finally {
      lock.releaseLock();
    }
  }

  /**
   * 条件に合致するかチェック。
   * user: { stage, level, star, interest, lastActiveDate } （_toUser形式のオブジェクト）
   * cond: { stages:[], levels:[], star:bool, interests:[], inactiveDays:number }
   *
   * inactiveDays: 指定日数以上やり取りがない人だけを対象にする。
   *   例: 7 → 1週間以上反応なし、30 → 1ヶ月以上、90 → 3ヶ月以上
   */
  function matches(user, cond) {
    if (!cond) return true;
    // stages: 指定ステージのいずれかに合致
    if (cond.stages && cond.stages.length > 0) {
      if (cond.stages.indexOf(user.stage) === -1) return false;
    }
    // levels: 指定アクティブ度のいずれかに合致
    if (cond.levels && cond.levels.length > 0) {
      if (cond.levels.indexOf(user.level) === -1) return false;
    }
    // star: ★のみ
    if (cond.star === true) {
      if (!user.star) return false;
    }
    // interests: 指定興味のいずれかに合致
    if (cond.interests && cond.interests.length > 0) {
      if (cond.interests.indexOf(user.interest) === -1) return false;
    }
    // inactiveDays: 指定日数以上やり取りがない人
    if (cond.inactiveDays && cond.inactiveDays > 0) {
      var last = user.lastActiveDate;
      if (!last || !(last instanceof Date)) return false;
      var now = new Date();
      var diffDays = (now.getTime() - last.getTime()) / (24 * 60 * 60 * 1000);
      if (diffDays < cond.inactiveDays) return false;  // まだアクティブ → 除外
    }
    return true;
  }

  return { list: list, save: save, remove: remove, matches: matches };
})();
