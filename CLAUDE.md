# 美容クリニック予約管理システム

## プロジェクト概要

美容クリニック向けの予約管理システム。部屋・機械・スタッフの3リソースを同時管理し、ダブルブッキングを防止する。

## アーキテクチャ

```
患者 (LINE) ──→ LINE Messaging API
                      │
                      ▼
              Google Apps Script (バックエンドAPI)
                      │
                      ▼
              Google Sheets (データストア)
                      ▲
                      │
スタッフ ──→ React管理画面 ──→ Google Apps Script
```

### 技術スタック

| レイヤー | 技術 |
|---|---|
| バックエンド | Google Apps Script (GAS) |
| データストア | Google Sheets |
| 患者UI | LINE Messaging API (Messaging API + LIFF) |
| スタッフ管理画面 | React (Vite) |

## 管理リソース

### 1. 部屋 (Room)
- 各施術ルームの予約枠管理
- 同一時間帯に1件のみ予約可能

### 2. 機械 (Equipment)
- レーザー機器・美容機器など施術機器の予約枠管理
- 複数の施術で共有するため競合管理が必要

### 3. スタッフ (Staff)
- 施術担当者のスケジュール管理
- 勤務シフトとの整合性チェック

## ディレクトリ構成

```
clinic-system/
├── CLAUDE.md
├── gas/                    # Google Apps Script
│   ├── Code.gs             # メインエントリポイント (doPost/doGet)
│   ├── Reservation.gs      # 予約ロジック
│   ├── Resource.gs         # リソース管理 (部屋/機械/スタッフ)
│   ├── LineHandler.gs      # LINE Webhook処理
│   ├── SheetService.gs     # Sheets CRUD操作
│   └── appsscript.json     # GASマニフェスト
└── admin/                  # React管理画面
    ├── src/
    │   ├── components/
    │   ├── pages/
    │   ├── hooks/
    │   └── api/            # GAS APIクライアント
    ├── package.json
    └── vite.config.ts
```

## Google Sheets 構成

| シート名 | 用途 |
|---|---|
| `reservations` | 予約データ本体 |
| `rooms` | 部屋マスタ |
| `equipment` | 機械マスタ |
| `staff` | スタッフマスタ |
| `services` | メニュー/施術マスタ |
| `patients` | 患者マスタ (LINE userId紐付け) |

### reservations シートのカラム

| カラム | 内容 |
|---|---|
| id | UUID |
| patientId | 患者ID |
| serviceId | 施術メニューID |
| roomId | 部屋ID |
| equipmentId | 機械ID (任意) |
| staffId | 担当スタッフID |
| startAt | 開始日時 (ISO8601) |
| endAt | 終了日時 (ISO8601) |
| status | pending / confirmed / cancelled |
| createdAt | 作成日時 |

## 予約の競合チェックルール

予約作成・変更時に以下を全て検証する:
1. 指定部屋が該当時間帯に空いているか
2. 指定機械が該当時間帯に空いているか (機械が必要なメニューのみ)
3. 指定スタッフが該当時間帯に空いているか
4. スタッフの勤務シフト内か

## GAS APIエンドポイント設計

GASはWebアプリとしてデプロイし、`doPost` / `doGet` で疑似RESTを実現する。

```
POST /exec?action=createReservation
POST /exec?action=cancelReservation
GET  /exec?action=getAvailableSlots&date=YYYY-MM-DD&serviceId=xxx
GET  /exec?action=getReservations&date=YYYY-MM-DD
POST /exec?action=upsertPatient
```

## LINE フロー

1. 患者がLINE公式アカウントに話しかける
2. GAS Webhookがメッセージを受信
3. Flex Messageで施術メニュー選択 → 日付選択 → 時間選択
4. 予約確定後に確認メッセージ送信
5. 前日リマインド通知 (GASトリガーで定期実行)

## React管理画面の主要ページ

| ページ | 機能 |
|---|---|
| `/` | 当日の予約一覧・タイムライン表示 |
| `/reservations` | 予約検索・編集・キャンセル |
| `/resources` | 部屋/機械/スタッフのマスタ管理 |
| `/schedule` | スタッフシフト管理 |
| `/patients` | 患者一覧・履歴 |

## LINE分析・ステージ管理（?page=line）

THE MODELのリードステージ管理をクリニック向けに翻案した機能群。予約・Webhook処理とは独立。

| ファイル | 役割 |
|---|---|
| `gas/ActivityLog.js` | 全Webhookイベントを「LINE行動ログ」スプレッドシートに記録（返信なし・2026-07-02開始） |
| `gas/SegmentSummary.js` | ログをユーザー単位に集計→「ユーザー別サマリー」シート（毎朝6時台トリガー＋リスト更新時） |
| `gas/Stage.js` | 6ステージの自動判定＋手動上書き（「ステージ管理」「配信先履歴」シート） |
| `gas/Templates.js` | ステージ別の文面テンプレート（「テンプレート」シート・初回作成時に初期文面をセット） |
| `gas/FollowUp.js` | 配信リスト作成・multicast送信・残り通数チェック・PIN保護 |
| `gas/LineConsole.html` | スマホ用ページ（?page=line）: ステージボード・リスト・テンプレ・送信・配信履歴 |

**6ステージ**: 新規（反応なし）／反応待ち（配信後反応なし）／反応あり（ボタン等の反応・未予約）／予約済み（フォームCV）／休眠（90日反応なし・予約済みでも落ちてリピート再アプローチ対象）／対象外（ブロック・手動除外＝送信ブロック）。手動上書きは自動判定より優先され、（自動）に戻すまで固定。

## 開発上の注意事項

- GASのコードは `clasp` でローカル開発・デプロイする
- Google Sheetsへの書き込みは排他制御 (`LockService`) を必ず使用してダブルブッキングを防ぐ
- LINE Webhookの署名検証 (`X-Line-Signature`) を必ず実装する
- 患者の個人情報はSpreadsheetsのアクセス権限で保護する
- GASのWebアプリURLは環境変数ではなく `PropertiesService` で管理する
