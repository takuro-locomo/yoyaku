/**
 * Resource.gs - マスタデータ管理 (部屋 / 機械 / スタッフ / サービス / 患者)
 *
 * 各エンティティの取得・作成・更新を提供する。
 * upsert 系は id があれば更新、なければ新規作成する。
 */

const Resource = (() => {

  // ---------------------------------------------------------------------------
  // 内部ヘルパー
  // ---------------------------------------------------------------------------

  function _isActive(record) {
    // Sheetsから読み込むと TRUE/FALSE が boolean または文字列になる場合がある
    return record.isActive === true || record.isActive === 'TRUE' || record.isActive === 'true';
  }

  function _now() {
    return new Date().toISOString();
  }

  // ---------------------------------------------------------------------------
  // 部屋 (rooms)
  // ---------------------------------------------------------------------------

  function getRooms(activeOnly = true) {
    const rows = SheetService.findAll('rooms');
    return activeOnly ? rows.filter(_isActive) : rows;
  }

  function getRoomById(id) {
    return SheetService.findById('rooms', id);
  }

  function upsertRoom(data) {
    if (data.id) {
      SheetService.updateById('rooms', data.id, { ...data, updatedAt: _now() });
      return SheetService.findById('rooms', data.id);
    }
    const record = {
      id: SheetService.generateId(),
      name: data.name || '',
      area: data.area || '',
      areaColor: data.areaColor || '#f1f5f9',
      isActive: true,
      createdAt: _now(),
      updatedAt: _now(),
    };
    SheetService.insert('rooms', record);
    return record;
  }

  // ---------------------------------------------------------------------------
  // 機械 (equipment)
  // ---------------------------------------------------------------------------

  function getEquipment(activeOnly = true) {
    const rows = SheetService.findAll('equipment');
    return activeOnly ? rows.filter(_isActive) : rows;
  }

  function getEquipmentById(id) {
    return SheetService.findById('equipment', id);
  }

  function upsertEquipment(data) {
    if (data.id) {
      SheetService.updateById('equipment', data.id, { ...data, updatedAt: _now() });
      return SheetService.findById('equipment', data.id);
    }
    const record = {
      id: SheetService.generateId(),
      name: data.name || '',
      description: data.description || '',
      isActive: true,
      createdAt: _now(),
      updatedAt: _now(),
    };
    SheetService.insert('equipment', record);
    return record;
  }

  // ---------------------------------------------------------------------------
  // スタッフ (staff)
  // ---------------------------------------------------------------------------

  function getStaff(activeOnly = true) {
    const rows = SheetService.findAll('staff');
    return activeOnly ? rows.filter(_isActive) : rows;
  }

  function getStaffById(id) {
    return SheetService.findById('staff', id);
  }

  function upsertStaff(data) {
    if (data.id) {
      SheetService.updateById('staff', data.id, { ...data, updatedAt: _now() });
      return SheetService.findById('staff', data.id);
    }
    const record = {
      id: SheetService.generateId(),
      name: data.name || '',
      email: data.email || '',
      lineUserId: data.lineUserId || '',
      color: data.color || '#bfdbfe',
      isActive: true,
      createdAt: _now(),
      updatedAt: _now(),
    };
    SheetService.insert('staff', record);
    return record;
  }

  // ---------------------------------------------------------------------------
  // サービス / 施術メニュー (services)
  // ---------------------------------------------------------------------------

  function getServices(activeOnly = true) {
    const rows = SheetService.findAll('services');
    return activeOnly ? rows.filter(_isActive) : rows;
  }

  function getServiceById(id) {
    return SheetService.findById('services', id);
  }

  function upsertService(data) {
    if (data.id) {
      SheetService.updateById('services', data.id, { ...data, updatedAt: _now() });
      return SheetService.findById('services', data.id);
    }
    const record = {
      id: SheetService.generateId(),
      name: data.name || '',
      durationMinutes: Number(data.durationMinutes) || 30,
      // 機械が必要なサービスは requiresEquipmentId に機械IDを設定する。不要なら空文字。
      requiresEquipmentId: data.requiresEquipmentId || '',
      price: Number(data.price) || 0,
      isActive: true,
      createdAt: _now(),
      updatedAt: _now(),
    };
    SheetService.insert('services', record);
    return record;
  }

  // ---------------------------------------------------------------------------
  // 患者 (patients)
  // ---------------------------------------------------------------------------

  function getPatients() {
    return SheetService.findAll('patients');
  }

  function getPatientById(id) {
    return SheetService.findById('patients', id);
  }

  function getPatientByLineUserId(lineUserId) {
    const results = SheetService.findWhere('patients', p => p.lineUserId === lineUserId);
    return results[0] || null;
  }

  /**
   * 患者を作成または更新する。
   *
   * 優先度:
   *   1. data.id がある場合 → ID で既存患者を更新 (管理画面での編集)
   *   2. data.lineUserId がある場合 → LINE userId をキーとして upsert (LINE経由)
   *   3. どちらもない場合 → 新規作成 (管理画面での手動登録)
   */
  function upsertPatient(data) {
    // (1) ID指定の更新
    if (data.id) {
      const updates = {
        name:      data.name      || '',
        phone:     data.phone     || '',
        email:     data.email     || '',
        birthDate: data.birthDate || '',
        updatedAt: _now(),
      };
      if (data.lineUserId !== undefined) updates.lineUserId = data.lineUserId;
      SheetService.updateById('patients', data.id, updates);
      return SheetService.findById('patients', data.id);
    }

    // (2) LINE userId をキーとした upsert
    if (data.lineUserId) {
      const existing = getPatientByLineUserId(data.lineUserId);
      if (existing) {
        const updates = {
          name:      data.name      || existing.name,
          phone:     data.phone     || existing.phone,
          email:     data.email     || existing.email,
          birthDate: data.birthDate || existing.birthDate || '',
          updatedAt: _now(),
        };
        SheetService.updateById('patients', existing.id, updates);
        return { ...existing, ...updates };
      }
    }

    // (3) 新規作成
    const record = {
      id:        SheetService.generateId(),
      lineUserId: data.lineUserId || '',
      name:      data.name      || '',
      phone:     data.phone     || '',
      email:     data.email     || '',
      birthDate: data.birthDate || '',
      createdAt: _now(),
      updatedAt: _now(),
    };
    SheetService.insert('patients', record);
    return record;
  }

  return {
    // 部屋
    getRooms, getRoomById, upsertRoom,
    // 機械
    getEquipment, getEquipmentById, upsertEquipment,
    // スタッフ
    getStaff, getStaffById, upsertStaff,
    // サービス
    getServices, getServiceById, upsertService,
    // 患者
    getPatients, getPatientById, getPatientByLineUserId, upsertPatient,
  };
})();
