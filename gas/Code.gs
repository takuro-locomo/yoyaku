/**
 * Code.gs - メインエントリポイント
 *
 * GAS Webアプリとしてデプロイし、doPost / doGet でリクエストを受け付ける。
 * LINE Webhook も同じエンドポイントで受信し、bodyの形式で振り分ける。
 */

// ---------------------------------------------------------------------------
// エントリポイント
// ---------------------------------------------------------------------------

function doPost(e) {
  try {
    const body = e.postData ? JSON.parse(e.postData.contents) : {};

    // LINE Webhook の判定 (destination + events フィールドが存在する)
    if (body.destination !== undefined && Array.isArray(body.events)) {
      return LineHandler.handle(e, body);
    }

    const action = e.parameter.action || body.action;
    return _route(action, body);
  } catch (err) {
    Logger.log(err.stack);
    return _buildResponse({ success: false, error: err.message });
  }
}

function doGet(e) {
  try {
    const action = e.parameter.action;
    return _route(action, e.parameter);
  } catch (err) {
    Logger.log(err.stack);
    return _buildResponse({ success: false, error: err.message });
  }
}

// ---------------------------------------------------------------------------
// ルーター
// ---------------------------------------------------------------------------

function _route(action, params) {
  switch (action) {

    // --- 予約 ---
    case 'createReservation':
      return _buildResponse({ success: true, data: Reservation.create(params) });

    case 'cancelReservation':
      return _buildResponse({ success: true, data: Reservation.cancel(params.id) });

    case 'updateReservation':
      return _buildResponse({ success: true, data: Reservation.update(params.id, params) });

    case 'getReservations':
      return _buildResponse({ success: true, data: Reservation.getByDate(params.date) });

    case 'getReservationById':
      return _buildResponse({ success: true, data: Reservation.getById(params.id) });

    case 'getAvailableSlots':
      return _buildResponse({ success: true, data: Reservation.getAvailableSlots(params.date, params.serviceId) });

    // --- 患者 (管理画面用) ---
    case 'upsertPatient':
      return _buildResponse({ success: true, data: Resource.upsertPatient(params) });

    case 'getPatients':
      return _buildResponse({ success: true, data: Resource.getPatients() });

    // --- 患者向け予約 (Web / LINE) ---
    case 'getPatientMenus':
      return _buildResponse({ success: true, data: PatientBooking.getMenus() });

    case 'getPatientSlots':
      return _buildResponse({ success: true, data: PatientBooking.getAvailableSlots(params.menuId, params.date) });

    case 'createPatientReservation':
      return _buildResponse({ success: true, data: PatientBooking.createReservation(params) });

    case 'getPatientReservations':
      return _buildResponse({ success: true, data: Reservation.getByPatientId(params.patientId) });

    // --- マスタ一括取得 (管理画面用) ---
    case 'getMasters':
      return _buildResponse({ success: true, data: _getMasters() });

    // --- 予約表専用 ---
    case 'getScheduleReservations':
      return _buildResponse({ success: true, data: Reservation.getScheduleReservations(params.date) });

    case 'upsertScheduleReservation':
      return _buildResponse({ success: true, data: Reservation.upsertScheduleReservation(params) });

    case 'deleteScheduleReservation':
      return _buildResponse({ success: true, data: Reservation.deleteScheduleReservation(params.id) });

    // --- マスタ取得 (個別) ---
    case 'getRooms':
      return _buildResponse({ success: true, data: Resource.getRooms() });

    case 'getEquipment':
      return _buildResponse({ success: true, data: Resource.getEquipment() });

    case 'getStaff':
      return _buildResponse({ success: true, data: Resource.getStaff() });

    case 'getServices':
      return _buildResponse({ success: true, data: Resource.getServices() });

    // --- マスタ更新 ---
    case 'upsertRoom':
      return _buildResponse({ success: true, data: Resource.upsertRoom(params) });

    case 'upsertEquipment':
      return _buildResponse({ success: true, data: Resource.upsertEquipment(params) });

    case 'upsertStaff':
      return _buildResponse({ success: true, data: Resource.upsertStaff(params) });

    case 'upsertService':
      return _buildResponse({ success: true, data: Resource.upsertService(params) });

    default:
      return _buildResponse({ success: false, error: `Unknown action: ${action}` });
  }
}

// ---------------------------------------------------------------------------
// getMasters ヘルパー
// ---------------------------------------------------------------------------

/**
 * 管理画面が必要とするマスタを一括返却する。
 * rooms を area ごとにグループ化して machineAreas 形式に変換する。
 */
function _getMasters() {
  const rooms     = Resource.getRooms();
  const staff     = Resource.getStaff();
  const equipment = Resource.getEquipment();
  const services  = Resource.getServices();

  // area ごとにグループ化 (挿入順を保持)
  const areaMap = {};
  rooms.forEach(function(room) {
    const areaKey   = room.area || 'その他';
    const areaColor = room.areaColor || '#f1f5f9';
    if (!areaMap[areaKey]) {
      areaMap[areaKey] = {
        id:        'area-' + areaKey,
        name:      areaKey,
        areaColor: areaColor,
        machines:  [],
      };
    }
    areaMap[areaKey].machines.push({ id: room.id, name: room.name });
  });

  return {
    machineAreas: Object.values(areaMap),
    staff: staff.map(function(s) {
      return { id: s.id, name: s.name, color: s.color || '#bfdbfe' };
    }),
    rooms:     rooms,
    equipment: equipment,
    services:  services,
  };
}

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

function _buildResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
