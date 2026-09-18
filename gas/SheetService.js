/**
 * SheetService.gs - Google Sheets CRUD 操作
 *
 * スプレッドシートIDは Script Properties の "SPREADSHEET_ID" キーに設定する。
 * 全シートは1行目をヘッダー行とし、"id" カラムを主キーとする。
 */

const SheetService = (() => {

  // ---------------------------------------------------------------------------
  // 内部ユーティリティ
  // ---------------------------------------------------------------------------

  // 1リクエスト（1回の実行）の中だけ有効なキャッシュ。
  // GAS は実行ごとにグローバルが初期化されるため、リクエストをまたいで古い値が
  // 残ることはない。同じ実行内で同じシートを何度も読み直す無駄だけを省く。
  let _ssCache = null;
  const _sheetCache = {};
  const _rowsCache  = {};

  function _getSpreadsheet() {
    if (_ssCache) return _ssCache;
    const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
    if (!id) throw new Error('Script Properties に SPREADSHEET_ID が設定されていません');
    _ssCache = SpreadsheetApp.openById(id);
    return _ssCache;
  }

  function _getSheet(name) {
    if (_sheetCache[name]) return _sheetCache[name];
    const sheet = _getSpreadsheet().getSheetByName(name);
    if (!sheet) throw new Error(`シート "${name}" が見つかりません`);
    _sheetCache[name] = sheet;
    return sheet;
  }

  /** 書き込み後にそのシートの行キャッシュを捨てる（次の読み取りで読み直す） */
  function _invalidate(name) {
    delete _rowsCache[name];
  }

  /**
   * シートの全データをオブジェクト配列に変換する。
   * ヘッダー行 (1行目) をキーとして使用する。
   *
   * Google Sheets は 'YYYY-MM-DD' 形式の文字列を自動でシリアル日付に変換する。
   * getValues() で読み戻すと Date オブジェクトになるため、文字列に正規化する。
   *   - 時刻成分がない (深夜 0 時ちょうど) → 'YYYY-MM-DD'
   *   - 時刻成分あり → ISO8601 文字列
   */
  function _toObjects(sheet, rows) {
    let data = rows;
    if (!data) {
      const lastRow = sheet.getLastRow();
      const lastCol = sheet.getLastColumn();
      if (lastRow < 2 || lastCol < 1) return [];
      data = sheet.getRange(1, 1, lastRow, lastCol).getValues();
    }
    if (data.length < 2) return [];

    const headers = data[0];
    const tz = Session.getScriptTimeZone();

    // Utilities.formatDate は1回ごとにコストがかかる。予約表では同じ日付・同じ
    // 時刻（09:00 など）が何十行も繰り返し現れるので、タイムスタンプをキーに
    // 結果を使い回して呼び出し回数を減らす（返す文字列は従来と同一）。
    const fmtCache = {};
    function _fmt(val) {
      const key = val.getTime();
      const hit = fmtCache[key];
      if (hit !== undefined) return hit;
      const hasTime = val.getHours() !== 0 || val.getMinutes() !== 0 || val.getSeconds() !== 0;
      const out = hasTime
        ? Utilities.formatDate(val, tz, "yyyy-MM-dd'T'HH:mm:ssXXX")
        : Utilities.formatDate(val, tz, 'yyyy-MM-dd');
      fmtCache[key] = out;
      return out;
    }

    // ヘッダーが空の列は毎行判定せず、あらかじめ対象列だけに絞る
    const cols = [];
    for (let i = 0; i < headers.length; i++) {
      if (headers[i] !== '') cols.push([headers[i], i]);
    }

    const out = new Array(data.length - 1);
    for (let r = 1; r < data.length; r++) {
      const row = data[r];
      const obj = {};
      for (let c = 0; c < cols.length; c++) {
        const val = row[cols[c][1]];
        obj[cols[c][0]] = (val instanceof Date) ? _fmt(val) : val;
      }
      out[r - 1] = obj;
    }
    return out;
  }

  /**
   * ヘッダー行に合わせて row 配列を生成する。
   */
  function _toRow(sheet, data) {
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    return headers.map(h => (data[h] !== undefined ? data[h] : ''));
  }

  // ---------------------------------------------------------------------------
  // 公開 API
  // ---------------------------------------------------------------------------

  function findAll(sheetName) {
    const hit = _rowsCache[sheetName];
    if (hit) return hit;
    const rows = _toObjects(_getSheet(sheetName));
    _rowsCache[sheetName] = rows;
    return rows;
  }

  /**
   * シート末尾から最大 maxRows 行だけ読む（追記型のシート用）。
   * 履歴のように行数が増え続けるシートを全読みしないために使う。
   * @returns {{rows: object[], truncated: boolean}}
   *          truncated=true ならさらに古い行が残っている
   *          （呼び出し側で findAll に切り替える判断に使う）
   */
  function findTail(sheetName, maxRows) {
    const sheet = _getSheet(sheetName);
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    if (lastRow < 2 || lastCol < 1) return { rows: [], truncated: false };

    const dataRows = lastRow - 1;                       // ヘッダーを除いた行数
    const take = Math.min(Math.max(1, Number(maxRows) || 500), dataRows);
    const startRow = lastRow - take + 1;

    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    const body    = sheet.getRange(startRow, 1, take, lastCol).getValues();
    return {
      rows: _toObjects(sheet, [headers].concat(body)),
      truncated: take < dataRows,
    };
  }

  function findById(sheetName, id) {
    return findAll(sheetName).find(r => r.id === id) || null;
  }

  /**
   * @param {string} sheetName
   * @param {function} predicate - (row: object) => boolean
   */
  function findWhere(sheetName, predicate) {
    return findAll(sheetName).filter(predicate);
  }

  /**
   * 行を末尾に追加する。
   * data には全カラムの値を含めること。
   */
  function insert(sheetName, data) {
    const sheet = _getSheet(sheetName);
    sheet.appendRow(_toRow(sheet, data));
    _invalidate(sheetName);
    return data;
  }

  /**
   * id が一致する行を更新する。
   * updates に含まれるキーのみ上書きする (部分更新)。
   * @returns {boolean} 更新できたか
   */
  function updateById(sheetName, id, updates) {
    const sheet = _getSheet(sheetName);
    const data = sheet.getDataRange().getValues();
    if (data.length < 2) return false;

    const headers = data[0];
    const idColIndex = headers.indexOf('id');
    if (idColIndex === -1) throw new Error(`シート "${sheetName}" に "id" カラムがありません`);

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][idColIndex]) === String(id)) {
        // 変更する列だけを既存行に当てて、1回の setValues で書き戻す。
        // 列ごとに setValue すると列数ぶんシートへの往復が発生して遅い。
        const row = data[i].slice();
        let changed = false;
        headers.forEach((h, colIdx) => {
          if (h !== '' && updates[h] !== undefined) {
            row[colIdx] = updates[h];
            changed = true;
          }
        });
        if (changed) {
          sheet.getRange(i + 1, 1, 1, headers.length).setValues([row]);
          _invalidate(sheetName);
        }
        return true;
      }
    }
    return false;
  }

  /**
   * id が一致する行を削除する。
   * 物理削除。キャンセルなどは status カラムの更新で対応する。
   * @returns {boolean} 削除できたか
   */
  function deleteById(sheetName, id) {
    const sheet = _getSheet(sheetName);
    const data = sheet.getDataRange().getValues();
    if (data.length < 2) return false;

    const headers = data[0];
    const idColIndex = headers.indexOf('id');

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][idColIndex]) === String(id)) {
        sheet.deleteRow(i + 1);
        _invalidate(sheetName);
        return true;
      }
    }
    return false;
  }

  /**
   * シートが存在しなければヘッダー付きで作成する。
   * 既存シートの場合は、不足しているヘッダー列を末尾に追加する（スキーマ追加に追従）。
   * @param {string} name
   * @param {string[]} headers
   * @returns {Sheet}
   */
  function ensureSheet(name, headers) {
    const ss = _getSpreadsheet();
    let sheet = ss.getSheetByName(name);
    if (sheet) {
      const lastCol = sheet.getLastColumn();
      const existing = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
      const missing = headers.filter(h => existing.indexOf(h) === -1);
      if (missing.length > 0) {
        const start = existing.length + 1;
        sheet.getRange(1, start, 1, missing.length).setValues([missing]);
        const added = sheet.getRange(1, start, 1, missing.length);
        added.setFontWeight('bold');
        added.setBackground('#4A86E8');
        added.setFontColor('#FFFFFF');
        _invalidate(name);
      }
      _sheetCache[name] = sheet;
      return sheet;
    }

    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#4A86E8');
    headerRange.setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
    _sheetCache[name] = sheet;
    _invalidate(name);
    return sheet;
  }

  /** UUID v4 を生成する */
  function generateId() {
    return Utilities.getUuid();
  }

  return { findAll, findTail, findById, findWhere, insert, updateById, deleteById, ensureSheet, generateId };
})();
