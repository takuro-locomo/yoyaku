/**
 * Reservation.gs - 予約ロジック
 *
 * 予約の作成・更新・キャンセル・空き枠検索を担う。
 * 作成・更新時は LockService で排他制御し、3リソース (部屋/機械/スタッフ) の
 * 競合チェックを行う。
 */

const Reservation = (() => {

  const SHEET = 'reservations';

  // 営業設定 (将来的には SheetService から読む)
  const BUSINESS_HOURS = { open: 10, close: 19 }; // 10:00-19:00
  const SLOT_INTERVAL_MIN = 30;
  const TIMEZONE_OFFSET = '+09:00';

  // ---------------------------------------------------------------------------
  // 内部ユーティリティ
  // ---------------------------------------------------------------------------

  function _now() {
    return new Date().toISOString();
  }

  /**
   * "HH:MM" または SheetService が返す ISO8601 形式 ("1899-12-30T09:30:00+09:00") を
   * 0時からの経過分に変換する。
   */
  function _slotToMinutes(timeSlot) {
    var str = String(timeSlot);
    if (str.indexOf('T') !== -1) {
      // ISO8601 の場合は "T" 以降の HH:MM 部分を取り出す
      str = str.split('T')[1].slice(0, 5);
    }
    var parts = str.split(':');
    return Number(parts[0]) * 60 + Number(parts[1]);
  }

  /**
   * 2つのスケジュール予約スロットが時間的に重複するか判定する。
   * 1スロット = 15分。端点一致（隣接）は重複しない。
   */
  function _scheduleSlotOverlaps(aSlot, aDur, bSlot, bDur) {
    var aStart = _slotToMinutes(aSlot);
    var aEnd   = aStart + Number(aDur) * 15;
    var bStart = _slotToMinutes(bSlot);
    var bEnd   = bStart + Number(bDur) * 15;
    return aStart < bEnd && aEnd > bStart;
  }

  /**
   * 2つの時間帯が重複するかチェックする。
   * 端点が一致する場合 (隣接) は重複しないものとする。
   *   A overlaps B:  A.start < B.end  &&  A.end > B.start
   */
  function _overlaps(aStart, aEnd, bStart, bEnd) {
    return new Date(aStart) < new Date(bEnd) && new Date(aEnd) > new Date(bStart);
  }

  /**
   * 指定条件に一致するアクティブな予約を返す。
   * @param {string|null} excludeId - 更新時に自身を除外するための予約ID
   */
  function _getActiveReservations(excludeId) {
    return SheetService.findWhere(SHEET, r =>
      r.status !== 'cancelled' && r.id !== excludeId
    );
  }

  // ---------------------------------------------------------------------------
  // 競合チェック
  // ---------------------------------------------------------------------------

  /**
   * 3リソース (部屋・機械・スタッフ) の競合を検出する。
   *
   * @param {object} params
   * @param {string} params.roomId
   * @param {string|null} params.equipmentId  - 機械が不要なサービスは null
   * @param {string} params.staffId
   * @param {string} params.startAt           - ISO8601
   * @param {string} params.endAt             - ISO8601
   * @param {string|null} params.excludeId    - 更新時に自身を除外
   * @returns {{ room: object[], equipment: object[], staff: object[] }}
   */
  function checkConflicts({ roomId, equipmentId, staffId, startAt, endAt, excludeId = null }) {
    const active = _getActiveReservations(excludeId);
    const overlapping = active.filter(r => _overlaps(startAt, endAt, r.startAt, r.endAt));

    return {
      room:      overlapping.filter(r => r.roomId === roomId),
      equipment: equipmentId ? overlapping.filter(r => r.equipmentId === equipmentId) : [],
      staff:     overlapping.filter(r => r.staffId === staffId),
    };
  }

  /**
   * 競合結果からエラーメッセージを生成する。
   */
  function _buildConflictMessage(conflicts) {
    const msgs = [];
    if (conflicts.room.length)      msgs.push(`部屋が使用中 (${conflicts.room.map(r => r.id).join(', ')})`);
    if (conflicts.equipment.length) msgs.push(`機械が使用中 (${conflicts.equipment.map(r => r.id).join(', ')})`);
    if (conflicts.staff.length)     msgs.push(`スタッフが対応中 (${conflicts.staff.map(r => r.id).join(', ')})`);
    return msgs.join(' / ');
  }

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  /**
   * 予約を作成する。
   *
   * @param {object} params
   * @param {string} params.patientId
   * @param {string} params.serviceId
   * @param {string} params.roomId
   * @param {string} [params.equipmentId]
   * @param {string} params.staffId
   * @param {string} params.startAt  - ISO8601
   * @param {string} params.endAt    - ISO8601
   * @returns {object} 作成した予約オブジェクト
   */
  function create(params) {
    const { patientId, serviceId, roomId, equipmentId, staffId, startAt, endAt } = params;

    // 必須チェック
    if (!patientId || !serviceId || !roomId || !staffId || !startAt || !endAt) {
      throw new Error('必須パラメータが不足しています (patientId, serviceId, roomId, staffId, startAt, endAt)');
    }
    if (new Date(startAt) >= new Date(endAt)) {
      throw new Error('endAt は startAt より後にしてください');
    }

    const lock = LockService.getScriptLock();
    try {
      lock.waitLock(10000); // 最大10秒待機

      const conflicts = checkConflicts({ roomId, equipmentId: equipmentId || null, staffId, startAt, endAt });
      const hasConflict = conflicts.room.length || conflicts.equipment.length || conflicts.staff.length;
      if (hasConflict) {
        throw new Error(`予約の競合があります: ${_buildConflictMessage(conflicts)}`);
      }

      const reservation = {
        id:          SheetService.generateId(),
        patientId,
        serviceId,
        roomId,
        equipmentId: equipmentId || '',
        staffId,
        startAt,
        endAt,
        status:      'confirmed',
        note:        params.note || '',
        createdAt:   _now(),
        updatedAt:   _now(),
      };

      SheetService.insert(SHEET, reservation);
      return reservation;

    } finally {
      lock.releaseLock();
    }
  }

  /**
   * 予約を更新する (日時・リソースの変更)。
   * 競合チェックを行う。
   */
  function update(id, params) {
    const existing = SheetService.findById(SHEET, id);
    if (!existing) throw new Error(`予約が見つかりません: ${id}`);
    if (existing.status === 'cancelled') throw new Error('キャンセル済みの予約は変更できません');

    const merged = { ...existing, ...params };

    const lock = LockService.getScriptLock();
    try {
      lock.waitLock(10000);

      const conflicts = checkConflicts({
        roomId:      merged.roomId,
        equipmentId: merged.equipmentId || null,
        staffId:     merged.staffId,
        startAt:     merged.startAt,
        endAt:       merged.endAt,
        excludeId:   id,
      });
      const hasConflict = conflicts.room.length || conflicts.equipment.length || conflicts.staff.length;
      if (hasConflict) {
        throw new Error(`予約の競合があります: ${_buildConflictMessage(conflicts)}`);
      }

      const updates = {
        patientId:   merged.patientId,
        serviceId:   merged.serviceId,
        roomId:      merged.roomId,
        equipmentId: merged.equipmentId || '',
        staffId:     merged.staffId,
        startAt:     merged.startAt,
        endAt:       merged.endAt,
        note:        merged.note || '',
        updatedAt:   _now(),
      };
      SheetService.updateById(SHEET, id, updates);
      return { ...existing, ...updates };

    } finally {
      lock.releaseLock();
    }
  }

  /**
   * 予約をキャンセルする (status を 'cancelled' に変更)。
   */
  function cancel(id) {
    if (!id) throw new Error('id は必須です');
    const reservation = SheetService.findById(SHEET, id);
    if (!reservation) throw new Error(`予約が見つかりません: ${id}`);
    if (reservation.status === 'cancelled') throw new Error('すでにキャンセル済みです');

    SheetService.updateById(SHEET, id, { status: 'cancelled', updatedAt: _now() });
    return { ...reservation, status: 'cancelled' };
  }

  function getById(id) {
    const r = SheetService.findById(SHEET, id);
    if (!r) throw new Error(`予約が見つかりません: ${id}`);
    return r;
  }

  /**
   * 指定日の予約一覧 (キャンセル除く) を返す。
   * @param {string} date - YYYY-MM-DD
   */
  function getByDate(date) {
    if (!date) throw new Error('date (YYYY-MM-DD) は必須です');
    return SheetService.findWhere(SHEET, r =>
      typeof r.startAt === 'string' && r.startAt.startsWith(date) && r.status !== 'cancelled'
    );
  }

  // ---------------------------------------------------------------------------
  // 空き枠検索
  // ---------------------------------------------------------------------------

  /**
   * 指定日・サービスで予約可能な時間枠を返す。
   *
   * アルゴリズム:
   *   1. サービスの所要時間を取得する
   *   2. 営業時間内を SLOT_INTERVAL_MIN 刻みで走査する
   *   3. 各スロットについて、有効なリソース組み合わせ
   *      (部屋 × スタッフ × 機械) が1つ以上あれば空き枠として返す
   *
   * @param {string} date      - YYYY-MM-DD
   * @param {string} serviceId
   * @returns {Array<{ startAt: string, endAt: string }>}
   */
  function getAvailableSlots(date, serviceId) {
    if (!date || !serviceId) throw new Error('date と serviceId は必須です');

    const service = Resource.getServiceById(serviceId);
    if (!service) throw new Error(`サービスが見つかりません: ${serviceId}`);

    const durationMs = Number(service.durationMinutes) * 60 * 1000;
    const rooms      = Resource.getRooms();
    const staffList  = Resource.getStaff();
    const requiresEquipmentId = service.requiresEquipmentId || null;
    const equipmentOptions = requiresEquipmentId
      ? [Resource.getEquipmentById(requiresEquipmentId)].filter(Boolean)
      : [null]; // 機械不要なサービスは null を1要素として持つ配列

    // 当日の確定済み予約を一括取得
    const existingReservations = getByDate(date);

    const slots = [];

    const { open, close } = BUSINESS_HOURS;
    for (let hour = open; hour < close; hour++) {
      for (let min = 0; min < 60; min += SLOT_INTERVAL_MIN) {
        const startAt = _toJstIso(date, hour, min);
        const endDate = new Date(new Date(startAt).getTime() + durationMs);

        // 終了時刻が営業終了を超える枠はスキップ
        if (endDate.getUTCHours() + 9 > close) continue; // UTC+9 で比較

        const endAt = endDate.toISOString();

        // この時間帯に重複している既存予約
        const overlapping = existingReservations.filter(r =>
          _overlaps(startAt, endAt, r.startAt, r.endAt)
        );

        const busyRooms  = new Set(overlapping.map(r => r.roomId));
        const busyStaff  = new Set(overlapping.map(r => r.staffId));
        const busyEquip  = new Set(overlapping.map(r => r.equipmentId).filter(Boolean));

        // 利用可能な組み合わせが1つでもあれば枠として追加
        const available = rooms.some(room => {
          if (busyRooms.has(room.id)) return false;
          return staffList.some(staff => {
            if (busyStaff.has(staff.id)) return false;
            return equipmentOptions.some(eq => {
              if (eq === null) return true; // 機械不要
              return !busyEquip.has(eq.id);
            });
          });
        });

        if (available) {
          slots.push({ startAt, endAt });
        }
      }
    }

    return slots;
  }

  /**
   * YYYY-MM-DD + 時・分 から JST ISO8601 文字列を生成する。
   * 例: "2026-04-01T10:00:00+09:00"
   */
  function _toJstIso(date, hour, min) {
    const h = String(hour).padStart(2, '0');
    const m = String(min).padStart(2, '0');
    return `${date}T${h}:${m}:00${TIMEZONE_OFFSET}`;
  }

  /**
   * 指定患者の予約一覧を返す (全ステータス含む、新しい順)。
   * @param {string} patientId
   */
  function getByPatientId(patientId) {
    if (!patientId) throw new Error('patientId は必須です');
    const rows = SheetService.findWhere(SHEET, r => r.patientId === patientId);
    return rows.sort((a, b) => new Date(b.startAt) - new Date(a.startAt));
  }

  // ---------------------------------------------------------------------------
  // 予約表専用 CRUD (scheduleReservations シート)
  // ---------------------------------------------------------------------------

  const SCHEDULE_SHEET = 'scheduleReservations';

  /**
   * 指定日の予約表データを返す。
   * @param {string} date - YYYY-MM-DD
   */
  function getScheduleReservations(date) {
    if (!date) throw new Error('date (YYYY-MM-DD) は必須です');
    return SheetService.findWhere(SCHEDULE_SHEET, function(r) {
      // SheetService が日付を ISO8601 で返す場合も先頭10文字で比較
      return String(r.date).substring(0, 10) === date;
    }).map(function(r) {
      // timeSlot が "1899-12-30T09:00:00+09:00" 形式の場合は "HH:MM" に正規化する
      var ts = String(r.timeSlot);
      if (ts.indexOf('T') !== -1) {
        ts = ts.split('T')[1].slice(0, 5);
      }
      return Object.assign({}, r, {
        date:     String(r.date).substring(0, 10),
        timeSlot: ts,
      });
    });
  }

  /**
   * 予約表の競合チェック: 同日・同機械で時間帯が重複する予約を返す。
   * @param {string} date
   * @param {string} machineId
   * @param {string} timeSlot
   * @param {number} durationSlots
   * @param {string} excludeId - 更新時に自身を除外する予約ID (空文字可)
   * @returns {object[]}
   */
  function _checkScheduleConflicts(date, machineId, timeSlot, durationSlots, excludeId) {
    return SheetService.findWhere(SCHEDULE_SHEET, function(r) {
      // SheetService が日付を "2026-03-30T00:00:00+09:00" 形式で返す場合も先頭10文字で比較
      return String(r.date).substring(0, 10) === date
        && r.machineId === machineId
        && r.id !== excludeId
        && _scheduleSlotOverlaps(timeSlot, durationSlots, r.timeSlot, Number(r.durationSlots));
    });
  }

  /**
   * 予約表の予約を作成または更新する。
   * id がある場合は更新、ない場合は新規作成。
   * 同日・同機械の時間帯重複は LockService で排他制御しつつ弾く。
   */
  function upsertScheduleReservation(data) {
    if (data.id) {
      // 更新: 自身を除いた競合チェック
      var updateConflicts = _checkScheduleConflicts(
        data.date, data.machineId, data.timeSlot, Number(data.durationSlots), data.id
      );
      if (updateConflicts.length > 0) {
        throw new Error(
          'この機械・時間帯にはすでに予約が入っています (予約ID: ' +
          updateConflicts.map(function(r) { return r.id; }).join(', ') + ')'
        );
      }
      var updateFields = {
        machineId:     data.machineId,
        timeSlot:      data.timeSlot,
        durationSlots: Number(data.durationSlots),
        patientName:   data.patientName || '',
        treatmentId:   data.treatmentId || '',
        staffId:       data.staffId || '',
        note:          data.note || '',
        updatedAt:     _now(),
      };
      // status が明示されている場合のみ上書き (省略時は既存値を保持)
      if (data.status) updateFields.status = data.status;
      SheetService.updateById(SCHEDULE_SHEET, data.id, updateFields);
      return SheetService.findById(SCHEDULE_SHEET, data.id);
    }

    const lock = LockService.getScriptLock();
    try {
      lock.waitLock(10000);

      // 新規作成: ロック取得後に競合チェック (同時リクエストによる二重登録を防ぐ)
      var createConflicts = _checkScheduleConflicts(
        data.date, data.machineId, data.timeSlot, Number(data.durationSlots), ''
      );
      if (createConflicts.length > 0) {
        throw new Error(
          'この機械・時間帯にはすでに予約が入っています (予約ID: ' +
          createConflicts.map(function(r) { return r.id; }).join(', ') + ')'
        );
      }

      const record = {
        id:            SheetService.generateId(),
        date:          data.date,
        machineId:     data.machineId,
        timeSlot:      data.timeSlot,
        durationSlots: Number(data.durationSlots),
        patientName:   data.patientName || '',
        treatmentId:   data.treatmentId || '',
        staffId:       data.staffId || '',
        note:          data.note || '',
        // スタッフが直接作成する場合は confirmed、患者予約からの自動作成は pending
        status:        data.status || 'confirmed',
        createdAt:     _now(),
        updatedAt:     _now(),
      };
      SheetService.insert(SCHEDULE_SHEET, record);
      return record;
    } finally {
      lock.releaseLock();
    }
  }

  /**
   * 予約表の予約を削除する。
   * @param {string} id
   */
  function deleteScheduleReservation(id) {
    if (!id) throw new Error('id は必須です');
    const deleted = SheetService.deleteById(SCHEDULE_SHEET, id);
    if (!deleted) throw new Error('予約が見つかりません: ' + id);
    return { id: id };
  }

  return {
    create, update, cancel, getById, getByDate, getByPatientId, getAvailableSlots, checkConflicts,
    getScheduleReservations, upsertScheduleReservation, deleteScheduleReservation,
  };
})();
