# デイリーチェックイン＆振り返りシステム 設計書

**作成日**: 2026-06-11  
**対象リポジトリ**: growth-plan (growth.calm-pm-lab.com)  
**ゴール**: シニアアーキテクト3か年成長計画の日次進捗確認・振り返りを継続的に行う仕組みを構築する

---

## 1. 概要

既存ダッシュボード (`index.html`) に加え、専用のデイリーチェックインページ (`daily.html`) を同一 GitHub Pages ドメインに追加する。記録データは AWS DynamoDB に保存し、Cognito で認証する。IaC は AWS CDK (TypeScript) で管理し、クレデンシャルはリポジトリに含めない。

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
       │
       ▼
[AWS Lambda × 3]
  checkin-upsert  : DynamoDB に当日レコードを作成・上書き (upsert)
  checkin-get     : 指定日のレコードを取得
  summary-get     : 直近30日を集計（streak・週次達成率・月次ブログ数）
       │
       ▼
[Amazon DynamoDB]
  テーブル: growth-checkins
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
- `Function` × 3 (Lambda, Node.js 22.x)
- `Table` (DynamoDB, PAY_PER_REQUEST)

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

---

## 8. デプロイフロー

1. `cdk deploy` でバックエンドをデプロイ → Cognito UserPoolId・ClientId・API URL を取得
2. GitHub Actions が `daily.html` のプレースホルダーを Secrets で置換して GitHub Pages へプッシュ
3. `index.html` の変更も同タイミングでデプロイ

---

## 9. 今後の拡張（スコープ外）

- 週次・月次振り返りレポート画面
- Push 通知・リマインダー
- スキルマップの自動更新（統計タブからの直接編集）
- CSV/JSON エクスポート
