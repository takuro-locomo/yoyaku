/**
 * Setup.gs - スプレッドシートの初期セットアップ
 *
 * GASエディタから setup() を手動実行して全シート/データを一括作成する。
 * スキーマ変更後は resetAndSetup() を実行してシートを再作成すること。
 */

function setSpreadsheetId(id) {
  if (!id) throw new Error('引数 id が未指定です。setup() から呼び出してください。');
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', id);
  Logger.log('SPREADSHEET_ID を設定しました: ' + id);
}

/**
 * 初回セットアップ。GASエディタからこの関数を実行する。
 */
function setup() {
  setSpreadsheetId('1VjY6iweo0BD_kgOTUw4gsS7IyL9MuvArSF09fp-NQG0');
  initSpreadsheet();
  insertSampleData();
  Logger.log('=== セットアップ完了 ===');
}

/**
 * スキーマ変更時に全シートを再作成する。
 * 既存データは消えるので注意。
 */
function resetAndSetup() {
  setSpreadsheetId('1VjY6iweo0BD_kgOTUw4gsS7IyL9MuvArSF09fp-NQG0');
  const ss = SpreadsheetApp.openById(
    PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID')
  );
  const MANAGED = ['reservations','rooms','equipment','staff','services','patients','scheduleReservations','patientReservations'];
  MANAGED.forEach(name => {
    const sheet = ss.getSheetByName(name);
    if (sheet) ss.deleteSheet(sheet);
  });
  Logger.log('既存シートを削除しました');
  initSpreadsheet();
  insertSampleData();
  Logger.log('=== リセット & セットアップ完了 ===');
}

/**
 * 全シートとヘッダー行を初期作成する（既存シートはスキップ）。
 */
function initSpreadsheet() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('先に setSpreadsheetId() を実行してください');

  const ss = SpreadsheetApp.openById(id);

  const SHEETS = [
    {
      name: 'reservations',
      headers: ['id','patientId','serviceId','roomId','equipmentId','staffId',
                'startAt','endAt','status','note','createdAt','updatedAt'],
    },
    {
      // 予約表グリッド専用シート (machineId = roomId)
      // status: 'confirmed' (スタッフ作成) | 'pending' (患者予約から自動作成)
      name: 'scheduleReservations',
      headers: ['id','date','machineId','timeSlot','durationSlots',
                'patientName','treatmentId','staffId','note','status','createdAt','updatedAt'],
    },
    {
      // area / areaColor を追加
      name: 'rooms',
      headers: ['id','name','area','areaColor','isActive','createdAt','updatedAt'],
    },
    {
      name: 'equipment',
      headers: ['id','name','description','isActive','createdAt','updatedAt'],
    },
    {
      // color カラムを追加
      name: 'staff',
      headers: ['id','name','email','lineUserId','color','isActive','createdAt','updatedAt'],
    },
    {
      name: 'services',
      headers: ['id','name','durationMinutes','requiresEquipmentId',
                'price','isActive','createdAt','updatedAt'],
    },
    {
      name: 'patients',
      headers: ['id','lineUserId','name','phone','email','birthDate','createdAt','updatedAt'],
    },
    {
      name: 'patientReservations',
      headers: ['id','menuId','menuName','durationMin','patientName','phone','lineUserId',
                'date','startTime','status','confirmationNo','note','createdAt'],
    },
  ];

  SHEETS.forEach(({ name, headers }) => {
    let sheet = ss.getSheetByName(name);
    if (sheet) {
      Logger.log('スキップ (既存): ' + name);
      return;
    }
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#4A86E8');
    headerRange.setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);

    Logger.log('作成完了: ' + name);
  });

  Logger.log('initSpreadsheet 完了');
}

/**
 * 予約表の列定義に合わせた実データを挿入する。
 */
function insertSampleData() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('SPREADSHEET_ID が設定されていません');

  // ── 部屋 (= 予約表の列) ──
  const areaMap = [
    { area: '1F脱毛エリア', color: '#dbeafe',
      machines: ['ベロシティ','クラリティ','ジェントル','ベクタス'] },
    { area: '2F',           color: '#fce7f3',
      machines: ['ピコシュアエリート'] },
    { area: 'Ope室',        color: '#fee2e2',
      machines: ['Vビーム\nマイセル/エコ2\nスペクトラ'] },
    { area: '診察室',       color: '#dcfce7',
      machines: ['BTX\nhy BNLS'] },
    { area: '1F',           color: '#fef9c3',
      machines: ['モザイク\nヒーライト'] },
    { area: '2F',           color: '#ede9fe',
      machines: ['メディオスター','スペクトラ','アートメイク','メタトロン'] },
  ];
  areaMap.forEach(({ area, color, machines }) => {
    machines.forEach(machineName => {
      Resource.upsertRoom({ name: machineName, area: area, areaColor: color });
    });
  });

  // ── スタッフ ──
  Resource.upsertStaff({ name: 'スタッフA', color: '#bfdbfe', email: 'a@clinic.example' });
  Resource.upsertStaff({ name: 'スタッフB', color: '#bbf7d0', email: 'b@clinic.example' });
  Resource.upsertStaff({ name: 'スタッフC', color: '#fde68a', email: 'c@clinic.example' });

  // ── 機械 (施術機器マスタ) ──
  Resource.upsertEquipment({ name: 'YAGレーザー',    description: '脱毛・シミ治療用' });
  Resource.upsertEquipment({ name: 'IPL機器',        description: 'フォトフェイシャル用' });
  Resource.upsertEquipment({ name: 'ピコレーザー機',  description: 'ピコシュア/ピコウェイ' });

  // ── サービス ──
  Resource.upsertService({ name: 'フェイシャルトリートメント', durationMinutes: 60, price: 8000 });
  Resource.upsertService({ name: 'レーザー脱毛 (顔)',          durationMinutes: 30, price: 15000 });
  Resource.upsertService({ name: 'フォトフェイシャル',          durationMinutes: 45, price: 12000 });
  Resource.upsertService({ name: 'ボトックス注射',              durationMinutes: 30, price: 20000 });

  Logger.log('サンプルデータ挿入完了');
}
