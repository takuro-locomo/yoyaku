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

  function _getSpreadsheet() {
    const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
    if (!id) throw new Error('Script Properties に SPREADSHEET_ID が設定されていません');
    return SpreadsheetApp.openById(id);
  }

  function _getSheet(name) {
    const sheet = _getSpreadsheet().getSheetByName(name);
    if (!sheet) throw new Error(`シート "${name}" が見つかりません`);
    return sheet;
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
  function _toObjects(sheet) {
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    if (lastRow < 2 || lastCol < 1) return [];

    const data = sheet.getRange(1, 1, lastRow, lastCol).getValues();
    const headers = data[0];
    const tz = Session.getScriptTimeZone();

    return data.slice(1).map(row => {
      const obj = {};
      headers.forEach((h, i) => {
        if (h === '') return;
        let val = row[i];
        if (val === '') {
          val = '';
        } else if (val instanceof Date) {
          const hasTime = val.getHours() !== 0 || val.getMinutes() !== 0 || val.getSeconds() !== 0;
          val = hasTime
            ? Utilities.formatDate(val, tz, "yyyy-MM-dd'T'HH:mm:ssXXX")
            : Utilities.formatDate(val, tz, 'yyyy-MM-dd');
        }
        obj[h] = val;
      });
      return obj;
    });
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
    return _toObjects(_getSheet(sheetName));
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
        headers.forEach((h, colIdx) => {
          if (updates[h] !== undefined) {
            sheet.getRange(i + 1, colIdx + 1).setValue(updates[h]);
          }
        });
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
        return true;
      }
    }
    return false;
  }

  /** UUID v4 を生成する */
  function generateId() {
    return Utilities.getUuid();
  }

  return { findAll, findById, findWhere, insert, updateById, deleteById, generateId };
})();
