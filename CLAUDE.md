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
│   ├── Backup.js           # 週次/日次バックアップ・復元・大量登録の検知
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
| `_backups` | バックアップ台帳 (非表示シート・復元対象外) |

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

## バックアップと復元

データはGoogle Sheets1枚に集約されているため、スプレッドシートの消失や
大量の不正データ投入に備えて `gas/Backup.js` でスナップショットを保管する。

### 仕組み

- 毎週月曜3時台に**週次**、毎日4時台に**日次**でスプレッドシートを丸ごと複製し、
  Drive上の「clinic-system バックアップ」フォルダに保管する
- 保管本数は 週次12 / 日次14 / 手動20 / 復元直前10。超えた分はゴミ箱へ移動 (30日間は復旧可能)
- 日次ジョブは直近24時間の新規予約が閾値 (`ANOMALY_THRESHOLD`、既定60件) を超えたら管理者にメール通知する
- 復元は実行直前に `pre-restore` バックアップを自動取得してから上書きするため、戻しすぎても復旧できる
- 台帳シート `_backups` は復元対象から除外している (復元でバックアップ履歴を失わないため)
- `history` (操作履歴) も既定では巻き戻さない。誰がいつ何を入れたかの記録を
  残すため (`sheets` パラメータで明示指定すれば復元できる)
- LINE行動ログ・ステージ管理・テンプレートは別スプレッドシート
  (`LINE_ACTIVITY_LOG_SSID`) にあるため、`_line` 付きの別ファイルとして同時に複製する。
  こちらの復元は自動化していない — 複製をコピーして
  `LINE_ACTIVITY_LOG_SSID` を差し替える (管理画面の「LINE分」リンクから辿れる)

### 初回セットアップ (GASエディタで1度だけ)

1. `clasp push` でコードを反映し、**Webアプリを新バージョンで再デプロイ**する
   (Drive/Gmail/トリガーのスコープが増えるため再承認が必要)
2. 「プロジェクトの設定 → スクリプト プロパティ」で `BACKUP_ADMIN_TOKEN` に任意の合言葉を設定
   — **未設定の間は復元APIが常に拒否される** (エディタの実行ボタンでは引数を渡せないため、
   `setBackupAdminToken()` はコードから呼ぶ場合のみ使う)
3. `installBackupTriggers()` を実行 — 週次・日次トリガーを設置
4. `backupNow()` を実行して1件目のバックアップと保管フォルダを作成
5. 必要なら Script Properties に `BACKUP_ALERT_EMAIL` / `ANOMALY_THRESHOLD` を設定

### 管理画面

`/backup` ページで一覧・手動バックアップ・復元ができる。
復元は「管理トークン」+「RESTORE と入力」の二重確認を要求し、実行前に
現在の件数とバックアップ時点の件数の差分を表示する。

### API

| action | メソッド | 用途 |
|---|---|---|
| `getBackups` | GET | バックアップ一覧 |
| `getBackupStatus` | GET | 最終バックアップ・トリガー稼働状況 |
| `getBackupDiff` | GET | 現在とバックアップの件数差分 |
| `createBackup` | POST | 手動バックアップ |
| `restoreBackup` | POST | 復元 (`token` + `confirm='RESTORE'` 必須) |

## 開発上の注意事項

- GASのコードは `clasp` でローカル開発・デプロイする
- Google Sheetsへの書き込みは排他制御 (`LockService`) を必ず使用してダブルブッキングを防ぐ
- LINE Webhookの署名検証 (`X-Line-Signature`) を必ず実装する
- 患者の個人情報はSpreadsheetsのアクセス権限で保護する
- GASのWebアプリURLは環境変数ではなく `PropertiesService` で管理する
- WebアプリはANYONE_ANONYMOUS公開のため、破壊的な操作 (復元など) は必ず
  `BACKUP_ADMIN_TOKEN` の照合を通す

## 表示速度の改善（2026-09-18）

予約表の表示が遅いという指摘を受けて調査・改修した。**データ・シートの内容は一切変更していない。**

### 原因

計測の結果、遅さの本体は「シートを読む時間」ではなく **GASのリクエスト1本あたりの固定コスト** だった。

- 予約0件の日でも応答に **2.3秒** かかる（＝データ量ではなく実行環境の起動コスト）
- GASは同じ利用者からのリクエストを**順番待ち**で処理する。連続して叩くと急激に悪化し、
  計測中には同じリクエストが **32秒** までかかった
- つまり **リクエストの本数を減らすことがほぼ唯一の対策**

`/schedule` を1回開くだけで **10本** 叩いていた。

| 内訳 | 本数 | 理由 |
|---|---|---|
| `getScheduleReservations` | 7 | 日付タブの件数バッジが1日1本ずつ取得していた |
| `getClosures` | 2 | 閉じている `MonthDatePicker` / `AbsenceCalendarModal` が先読みしていた |
| `getMasters` | 1 | |

### 対応

| 版 | 内容 |
|---|---|
| GAS @89 | `getScheduleReservationsRange`（from〜toを1回で返す）を追加／`SheetService` に実行内キャッシュ（スプレッドシート・シート・行データ）／`updateById` を列ごとの `setValue` から1行1回の `setValues` に／`Utilities.formatDate` を値ごとにキャッシュ／履歴は末尾1500行だけ読み、足りない場合のみ全読み |
| GAS @90 | `getScheduleBootstrap`（マスタ＋期間の予約＋終日不在を1回の実行でまとめて返す）を追加 |
| 管理画面 | `useScheduleBootstrap` に集約／選択日の予約は週データから切り出す／`QueryClient` の既定で `refetchOnWindowFocus`・`refetchOnReconnect` を無効化／`useClosures` に `enabled` を追加し、閉じているモーダルは取得しない |

### 結果（本番実測）

| | 前 | 後 |
|---|---|---|
| 予約表を開く | 10本 | **2本** |
| タブに戻る | 4本 | **0本** |
| 日付タブを押す | 1本 | **0本** |
| 週ぶんの予約取得 | 17.3秒（7本） | **2.5秒（1本）** |

データの同一性は確認済み（108件・日別 15/12/11/12/22/36/0・マスタ 6エリア/4スタッフ/13部屋/4施術・終日不在0・日付と時刻の形式）。

### 残っている改善余地

1. **サイドバーの未確定バッジ**（`PendingBadge`）だけが `getScheduleReservations` を別に叩いている。
   bootstrap に当日ぶんを載せれば **2本→1本** になる
2. **予約の保存**が `upsertScheduleReservation` の更新経路でシートを3回読んでいる
   （競合チェック → `updateById` → `findById` で読み直し）。読み直しを省けば1〜2秒短縮できる
3. `getMasters` は部屋・スタッフ・施術がほぼ変わらないのに毎回シート4枚を読んでいる。
   `CacheService` に載せてマスタ更新時だけ破棄すると効く

---

## デプロイ手順（2026-09-18 時点で確認済み）

### 本番のデプロイID

管理画面（Vercel の `VITE_GAS_URL`）が叩いているのは **@87 系列のデプロイID**。
デプロイ一覧には同じ説明の複数バージョンが並ぶので、**IDで指定しないと本番に反映されない**。

```
AKfycbzx3Sn-Fmx_PVJHzYARUqyUYOkMNtZf9bimKws4INl-H_0II3BoB1gi7z3xYZHLHoWU
```

### 手順

```powershell
cd C:\Users\takur\projects\yoyaku
clasp push --force
clasp deploy -i AKfycbzx3Sn-Fmx_PVJHzYARUqyUYOkMNtZf9bimKws4INl-H_0II3BoB1gi7z3xYZHLHoWU -d "変更内容"
```

- `-i` を省くと**新しいURLのデプロイが増えるだけで本番は変わらない**
- 戻すときは同じIDに旧バージョンを指定：`clasp deploy -i <ID> -V 89`
- `clasp push` はスクリプトのソースを差し替えるだけで、`/exec` は再デプロイするまで変わらない。
  ただし**定期トリガー（バックアップ3〜4時台、LINE集計6時台）は push 直後から新コードで動く**
- GASを先、管理画面（Vercelへのマージ）を後にする。逆順だと新APIが無い状態で画面が呼び出してしまう

### 開発環境メモ

- Node.js 24 LTS と `@google/clasp` 3.4.1 をこのPCに導入済み（2026-09-18）
- 管理画面のビルド確認：`cd admin && npm run build`（`tsc -b && vite build`）
- GASを叩いて動作確認する場合、**連続して叩くと本番の応答が悪化する**。
  計測は控えめに行い、悪化させた場合は10〜15分置くと戻る
