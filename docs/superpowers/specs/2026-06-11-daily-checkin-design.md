# デイリーチェックイン＆振り返りシステム 設計書

**作成日**: 2026-06-11  
**対象リポジトリ**: growth-plan (growth.calm-pm-lab.com)  
**ゴール**: シニアアーキテクト3か年成長計画の日次進捗確認・振り返りを継続的に行う仕組みを構築する

---

## 1. 概要

既存ダッシュボード (`index.html`) に加え、専用のデイリーチェックインページ (`daily.html`) を同一 GitHub Pages ドメインに追加する。記録データは AWS DynamoDB に保存し、Cognito で認証する。未チェックイン時は設定したメールアドレスへ Amazon SES 経由でリマインダーを送信する。IaC は AWS CDK (TypeScript) で管理し、クレデンシャルはリポジトリに含めない。

---

## 2. アーキテクチャ

```
[ブラウザ]
  index.html  ─── サマリーカード（streak・今週達成率）を追加
  daily.html  ─── 新規：デイリーチェックインページ（タブ切り替え型）
       │
       │ HTTPS / JWT (Authorization header)
       ▼
[AWS Cognito User Pool]
  - メール＋パスワード認証
  - JWTトークン発行
  - amazon-cognito-identity-js をフロントに組み込み
       │
       │ Cognito Authorizer
       ▼
[Amazon API Gateway]
  POST   /checkins           → checkin-upsert Lambda
  GET    /checkins/{date}    → checkin-get Lambda
  GET    /checkins/summary   → summary-get Lambda
  GET    /settings           → settings-get Lambda
  PUT    /settings           → settings-upsert Lambda
       │
       ▼
[AWS Lambda × 5]
  checkin-upsert   : DynamoDB に当日レコードを作成・上書き (upsert)
  checkin-get      : 指定日のレコードを取得
  summary-get      : 直近30日を集計（streak・週次達成率・月次ブログ数）
  settings-get     : ユーザー設定を取得
  settings-upsert  : ユーザー設定を保存
  reminder-send    : EventBridge から起動。未チェックイン全ユーザーへ SES でメール送信
       │
       ▼
[Amazon DynamoDB]
  テーブル: growth-checkins（チェックインレコード＋設定レコードを同一テーブルで管理）

[Amazon EventBridge]
  スケジュールルール: cron(0 * * * ? *)  ─ 毎時0分に reminder-send Lambda を起動
  → 各ユーザーの設定 reminder_time と照合し、送信済みでなければ SES 経由でメール送信

[Amazon SES]
  送信元: noreply@<SES検証済みドメイン>
  宛先: ユーザーが設定した reminder_email
```

---

## 3. データモデル

### DynamoDB テーブル: `growth-checkins`

| キー | 型 | 説明 |
|---|---|---|
| `userId` (PK) | String | Cognito sub（ユーザー固有ID） |
| `date` (SK) | String | `YYYY-MM-DD` 形式 |
| `habits` | Map | 各習慣の実施フラグ（下記参照） |
| `today_done` | String | 今日やったこと・学んだこと（自由記述） |
| `tomorrow_tasks` | String | 明日やること（自由記述） |
| `blog_count` | Number | 今月のブログ記事数（累積） |
| `insights` | String | 気づき・発見（自由記述） |
| `mood` | String | モチベーション（`😄` / `🙂` / `😐` / `😔`） |
| `obstacles` | String | 障害・困っていること（自由記述） |
| `updated_at` | String | ISO 8601 タイムスタンプ |

#### `habits` マップのキー

| キー | 習慣 | 目安 |
|---|---|---|
| `logical` | ロジカル思考 | 15分/日 |
| `critical` | クリティカル思考 | 5分/日 |
| `reading` | 読書メモ・知識整理 | 10分/日 |
| `ai` | AI活用（Claude Code等） | 業務活用 |
| `blog` | ブログ執筆 | 週1〜2本 |
| `weekly_reflection` | システム思考の振り返り | 週1回 |

### 設定レコード（同一テーブル内）

| キー | 型 | 説明 |
|---|---|---|
| `userId` (PK) | String | Cognito sub |
| `date` (SK) | String | 固定値 `"settings"` |
| `reminder_enabled` | Boolean | リマインダーのオン/オフ |
| `reminder_time` | String | 送信時刻（`HH:MM`、JST） |
| `reminder_email` | String | 宛先メールアドレス |
| `last_reminded_date` | String | 最後に送信した日付（`YYYY-MM-DD`）。同日二重送信防止用 |

---

## 4. フロントエンド

### 4-1. `daily.html`（新規）

**認証フロー**:
1. ページロード時に Cognito トークンを確認
2. 未ログインならログインフォームを表示（Hosted UI は使わず、amazon-cognito-identity-js でページ内に埋め込む）
3. ログイン成功後にチェックインUIを表示

**タブ構成**:

| タブ | 必須 | 内容 |
|---|---|---|
| ✅ 習慣 | **必須** | 5項目の日次チェックボックス＋週次1項目 |
| 📝 記録 | 任意 | 今日やったこと・明日のタスク・月次ブログ本数 |
| 🔍 振り返り | 任意 | 気づき・モチベーション絵文字・障害メモ |
| 📊 統計 | 読み取り専用 | 達成率・連続日数・月次ブログ数、スキルマップリンク |
| ⚙️ 設定 | — | リマインダーのオン/オフ・送信時刻・宛先メールアドレス |

**保存動作**:
- 習慣タブの「保存して次へ」ボタンで `POST /checkins` を呼び出す
- 記録・振り返りタブは入力後に自動保存（debounce 1秒）
- 同日内は何度でも上書き可能（upsert）

**日付処理**:
- デフォルトは今日（ブラウザのローカル日付）
- ヘッダーの日付タップで過去7日分に遡れる（モバイル対応考慮）

### 4-2. `index.html`（変更箇所）

ヘッダー直下に「今日のチェックイン」サマリーカードを追加:
- 今日の習慣達成状況（当日未記録なら「記録する →」リンク）
- 今週の習慣達成率
- 連続チェックイン日数
- `daily.html` へのナビゲーションリンク

---

## 5. API 仕様

### POST /checkins

リクエスト（JSON）:
```json
{
  "date": "2026-06-11",
  "habits": { "logical": true, "critical": true, "reading": false, "ai": true, "blog": false, "weekly_reflection": false },
  "today_done": "PMBOKの第3章を読んだ…",
  "tomorrow_tasks": "第4章を読む",
  "blog_count": 2,
  "insights": "リスク管理の考え方が設計判断に使える",
  "mood": "😄",
  "obstacles": ""
}
```

レスポンス: `{ "ok": true }`

### GET /checkins/{date}

レスポンス: 上記レコード全体（存在しない場合は `null`）

### GET /settings

レスポンス:
```json
{
  "reminder_enabled": true,
  "reminder_time": "20:00",
  "reminder_email": "you@example.com"
}
```

### PUT /settings

リクエスト（JSON）:
```json
{
  "reminder_enabled": true,
  "reminder_time": "20:00",
  "reminder_email": "you@example.com"
}
```

レスポンス: `{ "ok": true }`

### GET /checkins/summary

クエリパラメータ: `?date=YYYY-MM-DD`（省略時はサーバー側の今日の日付）

レスポンス:
```json
{
  "streak": 4,
  "this_week_rate": 0.73,
  "this_month_blog_count": 2,
  "this_month_checkin_days": 11,
  "today_habits_done": true
}
```

**定義**:
- `streak`: 当日を含む連続チェックイン日数。1件以上のレコードが存在すれば1日とカウント（全習慣の完了は問わない）
- `this_week_rate`: 月曜起算の当週において、チェックイン済み日数 ÷ 経過日数（当日含む）
- `today_habits_done`: 当日のレコードが存在する場合 `true`（習慣の完了数は問わない）
- `this_month_blog_count`: 当月の最新レコードの `blog_count` 値（ユーザーが手入力する月次累計）

---

## 6. IaC（AWS CDK TypeScript）

管理リソース:
- `CfnUserPool` / `CfnUserPoolClient` (Cognito)
- `RestApi` + `CognitoUserPoolsAuthorizer` (API Gateway)
- `Function` × 6 (Lambda, Node.js 22.x)
- `Table` (DynamoDB, PAY_PER_REQUEST)
- `Rule` (EventBridge, cron 毎時)
- SES 送信元ドメイン検証（手動または CDK の `EmailIdentity`）

リポジトリ構成（追加分）:
```
growth-plan/
  cdk/
    bin/app.ts
    lib/growth-stack.ts
    lambda/
      checkin-upsert/index.ts
      checkin-get/index.ts
      summary-get/index.ts
      settings-get/index.ts
      settings-upsert/index.ts
      reminder-send/index.ts
  daily.html
  docs/superpowers/specs/2026-06-11-daily-checkin-design.md
```

クレデンシャル管理:
- AWS アカウントID・リージョンは CDK context または環境変数
- Cognito の UserPoolId / ClientId はビルド時に `daily.html` に埋め込む（GitHub Actions Secrets 経由）
- 本番 API Gateway の URL も同様

---

## 7. エラーハンドリング

| ケース | 対応 |
|---|---|
| 未認証アクセス | ログインフォームへリダイレクト |
| API タイムアウト（>10s） | 「保存に失敗しました。再試行してください。」トースト表示 |
| オフライン | 習慣チェックのみ LocalStorage に一時保存し、オンライン復帰後に同期 |
| 同日の重複保存 | upsert で上書き（エラーにしない） |
| リマインダー送信失敗（SES エラー） | Lambda が CloudWatch Logs に記録。ユーザーへの影響なし（サイレント失敗） |
| 当日チェックイン済みなのにリマインダー送信 | `last_reminded_date` と今日の日付を比較し、送信済みならスキップ。チェックイン済みかどうかも確認してスキップ |

---

## 8. デプロイフロー

1. `cdk deploy` でバックエンドをデプロイ → Cognito UserPoolId・ClientId・API URL を取得
2. GitHub Actions が `daily.html` のプレースホルダーを Secrets で置換して GitHub Pages へプッシュ
3. `index.html` の変更も同タイミングでデプロイ

---

## 9. リマインダー動作フロー

```
[EventBridge] 毎時0分
       │
       ▼
[reminder-send Lambda]
  1. DynamoDB で SK = "settings" の全レコードをスキャン
  2. reminder_enabled = true かつ reminder_time の時刻（JST）が現在時刻と一致するユーザーを抽出
  3. 対象ユーザーの当日チェックインレコード（SK = 今日の日付）を確認
  4. チェックイン未記録 かつ last_reminded_date ≠ 今日 → SES でメール送信
  5. last_reminded_date を今日の日付に更新（二重送信防止）
       │
       ▼
[Amazon SES]
  件名: 「【成長計画】今日のチェックインがまだです」
  本文:
    今日の習慣チェックを記録しましょう。
    → https://growth.calm-pm-lab.com/daily.html
```

**時刻照合の精度**: reminder_time は `HH:MM` で保存。EventBridge が毎時0分に起動するため、分は常に `00` 固定とし、ユーザーが設定できる送信時刻は `XX:00` のみ（例: 20:00、21:00）。

---

## 10. 今後の拡張（スコープ外）

- 週次・月次振り返りレポート画面
- スキルマップの自動更新（統計タブからの直接編集）
- CSV/JSON エクスポート
