/**
 * PatientBooking.gs - 患者向け予約ロジック
 *
 * LINE / LIFF / Web フォームから呼び出す患者向け予約 API。
 * スタッフ・部屋の割り当ては不要で、メニューごとのリソースグループで競合管理する。
 *
 * 同時予約ルール:
 *   laser   - 脱毛・スペクトラで共用 (同時1件のみ)
 *   healite - ヒーライト専用
 *   shoshin - 初診医師
 *
 *   ヒーライト × 脱毛      → OK  (healite と laser は独立)
 *   ヒーライト × スペクトラ → OK  (healite と laser は独立)
 *   脱毛 × スペクトラ      → NG  (どちらも laser を使用)
 *   同一メニュー同士        → NG  (同リソースが競合)
 */

const PatientBooking = (() => {

  const SHEET = 'patientReservations';

  /** メニュー定義 */
  const MENUS = [
    { id: 'datsu',           name: '脱毛',           durationMin: 30,  resources: ['laser']             },
    { id: 'healite',         name: 'ヒーライト',      durationMin: 15,  resources: ['healite']           },
    { id: 'spectra',         name: 'スペクトラ',       durationMin: 15,  resources: ['laser']             },
    { id: 'shoshin',         name: '初診のみ',         durationMin: 15,  resources: ['shoshin']           },
    { id: 'shoshin_datsu',   name: '初診＋脱毛',       durationMin: 45,  resources: ['shoshin', 'laser']  },
    { id: 'shoshin_healite', name: '初診＋ヒーライト', durationMin: 15,  resources: ['shoshin', 'healite']},
    { id: 'shoshin_spectra', name: '初診＋スペクトラ', durationMin: 30,  resources: ['shoshin', 'laser']  },
  ];

  /** リソースの同時予約上限 */
  const RESOURCE_CAPACITY = { laser: 1, healite: 1, shoshin: 1 };

  /** 営業時間 10:00-19:00, 15分刻み */
  const OPEN_MIN  = 10 * 60;
  const CLOSE_MIN = 19 * 60;
  const SLOT_MIN  = 15;

  /**
   * メニュー → scheduleReservations の machineId (= rooms.id) マッピング。
   * keyword: 部屋名の検索キーワード。
   * exact:   true = 完全一致 / false = 部分一致。
   *   スペクトラは "Vビーム\nマイセル/エコ2\nスペクトラ" と混同しないよう完全一致。
   */
  var MENU_MACHINE_MAP = {
    datsu:           { keyword: 'ベロシティ', exact: false },
    healite:         { keyword: 'ヒーライト', exact: false },
    spectra:         { keyword: 'スペクトラ', exact: true  },
    shoshin:         { keyword: 'BTX',        exact: false },
    shoshin_datsu:   { keyword: 'ベロシティ', exact: false },
    shoshin_healite: { keyword: 'ヒーライト', exact: false },
    shoshin_spectra: { keyword: 'スペクトラ', exact: true  },
  };

  // ---------------------------------------------------------------------------
  // 内部ユーティリティ
  // ---------------------------------------------------------------------------

  function _now() {
    return new Date().toISOString();
  }

  /** "HH:MM" または ISO8601 時刻 → 分 */
  function _toMin(hhmm) {
    var s = String(hhmm);
    if (s.indexOf('T') !== -1) s = s.split('T')[1].slice(0, 5);
    var parts = s.split(':');
    return Number(parts[0]) * 60 + Number(parts[1]);
  }

  /** 分 → "HH:MM" */
  function _toHHMM(min) {
    return String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');
  }

  /** 2つの時間帯が重複するか (端点一致は重複しない) */
  function _overlaps(aStart, aDur, bStart, bDur) {
    return aStart < bStart + bDur && aStart + aDur > bStart;
  }

  /**
   * 部屋名キーワードから rooms.id を取得する。
   * @param {string}  keyword
   * @param {boolean} exact - true: 完全一致 / false: 部分一致
   * @returns {string} rooms.id、見つからない場合は空文字
   */
  function _findMachineId(keyword, exact) {
    var rooms = Resource.getRooms(false); // isActive 問わず全件取得
    var found = rooms.find(function(r) {
      return exact
        ? r.name === keyword
        : String(r.name).indexOf(keyword) !== -1;
    });
    if (!found) {
      Logger.log('[PatientBooking._findMachineId] 部屋が見つかりません: keyword="%s" exact=%s', keyword, exact);
      return '';
    }
    return found.id;
  }

  /**
   * 患者予約レコードに対応する仮予約を scheduleReservations に作成する。
   * machineId が解決できない場合はスキップしてログのみ出力。
   */
  function _createPendingScheduleReservation(patientRecord, menu) {
    var machineConfig = MENU_MACHINE_MAP[menu.id];
    if (!machineConfig) {
      Logger.log('[PatientBooking] scheduleReservation スキップ: MENU_MACHINE_MAP 未定義 menuId=%s', menu.id);
      return;
    }

    var machineId = _findMachineId(machineConfig.keyword, machineConfig.exact);
    if (!machineId) {
      Logger.log('[PatientBooking] scheduleReservation スキップ: machineId 未解決 keyword="%s"', machineConfig.keyword);
      return;
    }

    var durationSlots = Math.round(menu.durationMin / 15);

    var schedRecord = {
      id:            SheetService.generateId(),
      date:          patientRecord.date,
      machineId:     machineId,
      timeSlot:      patientRecord.startTime,
      durationSlots: durationSlots,
      patientName:   patientRecord.patientName,
      treatmentId:   '',
      staffId:       '',
      note:          menu.name + '（患者予約 ' + patientRecord.confirmationNo + '）',
      status:        'pending',
      createdAt:     patientRecord.createdAt,
      updatedAt:     patientRecord.createdAt,
    };

    SheetService.insert('scheduleReservations', schedRecord);
    Logger.log('[PatientBooking] scheduleReservation 作成: id=%s machineId=%s date=%s timeSlot=%s status=pending',
      schedRecord.id, machineId, schedRecord.date, schedRecord.timeSlot);
  }

  /** 指定日の確定済み予約を取得し startTime を分に正規化して返す */
  function _getExistingForDate(date) {
    return SheetService.findWhere(SHEET, function(r) {
      return String(r.date).substring(0, 10) === date && r.status !== 'cancelled';
    }).map(function(r) {
      return {
        menuId:      r.menuId,
        startMin:    _toMin(r.startTime),
        durationMin: Number(r.durationMin),
      };
    });
  }

  /** 時間帯 [startMin, startMin+durationMin) でのリソース使用量を集計する */
  function _calcUsage(existing, startMin, durationMin) {
    var usage = {};
    existing.forEach(function(r) {
      if (!_overlaps(startMin, durationMin, r.startMin, r.durationMin)) return;
      var menu = MENUS.find(function(m) { return m.id === r.menuId; });
      if (!menu) return;
      menu.resources.forEach(function(res) {
        usage[res] = (usage[res] || 0) + 1;
      });
    });
    return usage;
  }

  /** メニューの必要リソースがすべて上限未満か */
  function _isAvailable(menu, existing, startMin) {
    var usage = _calcUsage(existing, startMin, menu.durationMin);
    return menu.resources.every(function(res) {
      return (usage[res] || 0) < (RESOURCE_CAPACITY[res] || 1);
    });
  }

  // ---------------------------------------------------------------------------
  // 公開 API
  // ---------------------------------------------------------------------------

  /** メニュー一覧を返す */
  function getMenus() {
    return MENUS.map(function(m) {
      return { id: m.id, name: m.name, durationMin: m.durationMin };
    });
  }

  /**
   * 指定日・メニューで予約可能な時間スロットを返す。
   * @param {string} menuId
   * @param {string} date - YYYY-MM-DD
   * @returns {string[]} ["10:00", "10:15", ...] の配列
   */
  function getAvailableSlots(menuId, date) {
    Logger.log('[getAvailableSlots] 受信: menuId=%s, date=%s', menuId, date);

    var menu = MENUS.find(function(m) { return m.id === menuId; });
    if (!menu) {
      Logger.log('[getAvailableSlots] ERROR: メニューが見つかりません menuId=%s', menuId);
      throw new Error('メニューが見つかりません: ' + menuId);
    }
    Logger.log('[getAvailableSlots] メニュー確定: %s (%s分) resources=%s',
      menu.name, menu.durationMin, JSON.stringify(menu.resources));

    var existing = _getExistingForDate(date);
    Logger.log('[getAvailableSlots] 既存予約件数: %s', existing.length);
    existing.forEach(function(r) {
      Logger.log('[getAvailableSlots]   既存: menuId=%s, startMin=%s, durationMin=%s',
        r.menuId, r.startMin, r.durationMin);
    });

    var slots = [];
    for (var start = OPEN_MIN; start + menu.durationMin <= CLOSE_MIN; start += SLOT_MIN) {
      if (_isAvailable(menu, existing, start)) {
        slots.push(_toHHMM(start));
      }
    }

    Logger.log('[getAvailableSlots] 空き枠数: %s (先頭3件: %s)',
      slots.length, JSON.stringify(slots.slice(0, 3)));
    return slots;
  }

  /**
   * 患者予約を作成する。
   * LockService で排他制御し、ロック後に再度空き確認を行う。
   *
   * @param {object} data
   * @param {string} data.menuId
   * @param {string} data.date        - YYYY-MM-DD
   * @param {string} data.startTime   - HH:MM
   * @param {string} data.patientName
   * @param {string} data.phone
   * @param {string} [data.lineUserId] - LINE連携時に設定
   * @param {string} [data.note]
   */
  function createReservation(data) {
    if (!data.menuId || !data.date || !data.startTime || !data.patientName || !data.phone) {
      throw new Error('必須パラメータが不足しています (menuId, date, startTime, patientName, phone)');
    }

    var menu = MENUS.find(function(m) { return m.id === data.menuId; });
    if (!menu) throw new Error('メニューが見つかりません: ' + data.menuId);

    var startMin = _toMin(data.startTime);
    if (startMin < OPEN_MIN || startMin + menu.durationMin > CLOSE_MIN) {
      throw new Error('営業時間外の時間帯です (10:00-19:00)');
    }

    var lock = LockService.getScriptLock();
    try {
      lock.waitLock(10000);

      // ロック取得後に再度空き確認 (同時リクエストによる二重予約を防止)
      var existing = _getExistingForDate(data.date);
      if (!_isAvailable(menu, existing, startMin)) {
        throw new Error('この時間帯はすでに満員です。別の時間をお選びください。');
      }

      var tz  = Session.getScriptTimeZone();
      var ymd = Utilities.formatDate(new Date(), tz, 'yyyyMMdd');
      var confirmationNo = 'C' + ymd + String(Math.floor(Math.random() * 10000)).padStart(4, '0');

      var record = {
        id:             SheetService.generateId(),
        menuId:         menu.id,
        menuName:       menu.name,
        durationMin:    menu.durationMin,
        patientName:    data.patientName,
        phone:          data.phone,
        lineUserId:     data.lineUserId || '',
        date:           data.date,
        startTime:      _toHHMM(startMin),
        status:         'confirmed',
        confirmationNo: confirmationNo,
        note:           data.note || '',
        createdAt:      _now(),
      };

      SheetService.insert(SHEET, record);

      // 予約表 (scheduleReservations) に仮予約を自動作成
      _createPendingScheduleReservation(record, menu);

      return record;

    } finally {
      lock.releaseLock();
    }
  }

  return { getMenus, getAvailableSlots, createReservation };

})();
