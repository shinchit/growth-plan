# デイリーチェックインシステム 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** シニアアーキテクト成長計画のデイリーチェックイン・振り返りシステムを、Cognito認証 + DynamoDB永続化 + SESリマインダーで構築する

**Architecture:** 静的HTMLページ（GitHub Pages / gh-pages ブランチ）からCognito JWTで認証し、API Gateway + Lambda経由でDynamoDBに記録する。未チェックイン時はEventBridgeがJST 6:00/18:00にLambdaを起動しSESメールを送信する。IaC はAWS CDK TypeScriptで管理し、CognitoのID類はGitHub Actions Secretsで注入する。

**Tech Stack:** AWS CDK (TypeScript), Node.js 22.x Lambda, @aws-sdk/lib-dynamodb, @aws-sdk/client-ses, Jest + ts-jest + aws-sdk-client-mock, amazon-cognito-identity-js (CDN), Vanilla HTML/JS, GitHub Actions, peaceiris/actions-gh-pages

---

## ファイル構成

```
growth-plan/
  cdk/
    bin/app.ts                          # CDK アプリエントリーポイント
    lib/growth-stack.ts                 # 全AWSリソース定義
    lib/growth-stack.test.ts            # CDK assertions テスト
    lambda/
      shared/
        types.ts                        # Lambda共通型定義
        dynamo.ts                       # DynamoDBDocumentClient ファクトリ
      checkin-upsert/
        index.ts                        # POST /checkins ハンドラ
        index.test.ts
      checkin-get/
        index.ts                        # GET /checkins/{date} ハンドラ
        index.test.ts
      summary-get/
        index.ts                        # GET /checkins/summary ハンドラ
        index.test.ts
      settings-get/
        index.ts                        # GET /settings ハンドラ
        index.test.ts
      settings-upsert/
        index.ts                        # PUT /settings ハンドラ
        index.test.ts
      reminder-send/
        index.ts                        # EventBridge → SES ハンドラ
        index.test.ts
    package.json
    tsconfig.json
    jest.config.js
    cdk.json
  daily.html                            # デイリーチェックインページ（プレースホルダー入り）
  index.html                            # 既存ダッシュボード（サマリーカード追加）
  .github/
    workflows/
      deploy.yml                        # GitHub Pages デプロイ + Secret注入
```

---

## Task 1: CDK プロジェクト初期化

**Files:**
- Create: `cdk/package.json`
- Create: `cdk/tsconfig.json`
- Create: `cdk/jest.config.js`
- Create: `cdk/cdk.json`
- Create: `cdk/bin/app.ts`

- [ ] **Step 1: cdk/ ディレクトリを作成して npm プロジェクトを初期化する**

```bash
mkdir -p cdk/bin cdk/lib cdk/lambda/shared
cd cdk
npm init -y
```

- [ ] **Step 2: CDK + Lambda + テスト用パッケージをインストールする**

```bash
npm install aws-cdk-lib constructs
npm install --save-dev aws-cdk typescript ts-node ts-jest jest \
  @types/jest @types/node \
  @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb \
  @aws-sdk/client-ses aws-lambda @types/aws-lambda \
  aws-sdk-client-mock aws-sdk-client-mock-jest
```

- [ ] **Step 3: `cdk/tsconfig.json` を作成する**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "outDir": "dist",
    "rootDir": ".",
    "sourceMap": true
  },
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 4: `cdk/jest.config.js` を作成する**

```js
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testMatch: ['**/*.test.ts'],
  transform: { '^.+\\.tsx?$': 'ts-jest' },
};
```

- [ ] **Step 5: `cdk/cdk.json` を作成する**

```json
{
  "app": "npx ts-node --prefer-ts-exts bin/app.ts",
  "context": {}
}
```

- [ ] **Step 6: `cdk/bin/app.ts` を作成する**

```typescript
import * as cdk from 'aws-cdk-lib';
import { GrowthStack } from '../lib/growth-stack';

const app = new cdk.App();
new GrowthStack(app, 'GrowthStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'ap-northeast-1',
  },
});
```

- [ ] **Step 7: コンパイルが通ることを確認する**

```bash
cd cdk && npx tsc --noEmit
```
期待: エラーなし

- [ ] **Step 8: コミットする**

```bash
git add cdk/
git commit -m "feat: initialize CDK project"
```

---

## Task 2: CDK スタック — DynamoDB + Cognito

**Files:**
- Create: `cdk/lib/growth-stack.ts`
- Create: `cdk/lib/growth-stack.test.ts`

- [ ] **Step 1: テストを書く**

`cdk/lib/growth-stack.test.ts`:

```typescript
import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { GrowthStack } from './growth-stack';

let template: Template;
beforeAll(() => {
  const app = new cdk.App();
  const stack = new GrowthStack(app, 'TestStack');
  template = Template.fromStack(stack);
});

test('DynamoDB table is created with correct keys', () => {
  template.hasResourceProperties('AWS::DynamoDB::Table', {
    TableName: 'growth-checkins',
    KeySchema: [
      { AttributeName: 'userId', KeyType: 'HASH' },
      { AttributeName: 'date', KeyType: 'RANGE' },
    ],
    BillingMode: 'PAY_PER_REQUEST',
  });
});

test('Cognito User Pool is created', () => {
  template.hasResourceProperties('AWS::Cognito::UserPool', {
    UserPoolName: 'growth-plan-users',
  });
});

test('Cognito User Pool Client is created', () => {
  template.resourceCountIs('AWS::Cognito::UserPoolClient', 1);
});
```

- [ ] **Step 2: テストを実行してFAILを確認する**

```bash
cd cdk && npx jest lib/growth-stack.test.ts
```
期待: `Cannot find module './growth-stack'` などのエラー

- [ ] **Step 3: `cdk/lib/growth-stack.ts` の骨格（DynamoDB + Cognito のみ）を実装する**

```typescript
import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';

export class GrowthStack extends cdk.Stack {
  public readonly table: dynamodb.Table;
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.table = new dynamodb.Table(this, 'CheckinsTable', {
      tableName: 'growth-checkins',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'date', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: 'growth-plan-users',
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      passwordPolicy: { minLength: 8, requireUppercase: false, requireSymbols: false },
    });

    this.userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool: this.userPool,
      authFlows: { userPassword: true, userSrp: true },
      generateSecret: false,
    });

    new cdk.CfnOutput(this, 'UserPoolId', { value: this.userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: this.userPoolClient.userPoolClientId });
  }
}
```

- [ ] **Step 4: テストを実行してPASSを確認する**

```bash
cd cdk && npx jest lib/growth-stack.test.ts
```
期待: 3テスト全部 PASS

- [ ] **Step 5: コミットする**

```bash
git add cdk/lib/
git commit -m "feat: add DynamoDB table and Cognito User Pool to CDK stack"
```

---

## Task 3: Lambda 共通ユーティリティ

**Files:**
- Create: `cdk/lambda/shared/types.ts`
- Create: `cdk/lambda/shared/dynamo.ts`

- [ ] **Step 1: `cdk/lambda/shared/types.ts` を作成する**

```typescript
export interface Habits {
  logical: boolean;
  critical: boolean;
  reading: boolean;
  ai: boolean;
  blog: boolean;
  weekly_reflection: boolean;
}

export interface CheckinRecord {
  userId: string;
  date: string; // YYYY-MM-DD
  habits: Habits;
  today_done: string;
  tomorrow_tasks: string;
  blog_count: number;
  insights: string;
  mood: string;
  obstacles: string;
  updated_at: string;
}

export interface SettingsRecord {
  userId: string;
  date: 'settings';
  reminder_enabled: boolean;
  reminder_email: string;
}

export interface SummaryResponse {
  streak: number;
  this_week_rate: number;
  this_month_blog_count: number;
  this_month_checkin_days: number;
  today_habits_done: boolean;
}
```

- [ ] **Step 2: `cdk/lambda/shared/dynamo.ts` を作成する**

```typescript
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

export function createDocumentClient(): DynamoDBDocumentClient {
  return DynamoDBDocumentClient.from(new DynamoDBClient({}));
}

export function getJSTToday(): string {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}
```

- [ ] **Step 3: コミットする**

```bash
git add cdk/lambda/shared/
git commit -m "feat: add Lambda shared utilities"
```

---

## Task 4: Lambda — checkin-upsert

**Files:**
- Create: `cdk/lambda/checkin-upsert/index.ts`
- Create: `cdk/lambda/checkin-upsert/index.test.ts`

- [ ] **Step 1: テストを書く**

`cdk/lambda/checkin-upsert/index.test.ts`:

```typescript
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { handler } from './index';

const ddbMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => ddbMock.reset());

function makeEvent(body: object) {
  return {
    requestContext: { authorizer: { claims: { sub: 'user-123' } } },
    body: JSON.stringify(body),
  } as any;
}

test('returns 200 and saves record with required fields', async () => {
  ddbMock.on(PutCommand).resolves({});

  const result = await handler(makeEvent({
    date: '2026-06-11',
    habits: { logical: true, critical: false, reading: true, ai: true, blog: false, weekly_reflection: false },
  }), {} as any, {} as any) as any;

  expect(result.statusCode).toBe(200);
  expect(JSON.parse(result.body)).toEqual({ ok: true });
  expect(ddbMock).toHaveReceivedCommandWith(PutCommand, {
    Item: expect.objectContaining({ userId: 'user-123', date: '2026-06-11' }),
  });
});

test('saves optional fields as empty strings/zero when omitted', async () => {
  ddbMock.on(PutCommand).resolves({});

  await handler(makeEvent({ date: '2026-06-11', habits: {} }), {} as any, {} as any);

  expect(ddbMock).toHaveReceivedCommandWith(PutCommand, {
    Item: expect.objectContaining({
      today_done: '',
      tomorrow_tasks: '',
      blog_count: 0,
      insights: '',
      mood: '',
      obstacles: '',
    }),
  });
});
```

- [ ] **Step 2: テストを実行してFAILを確認する**

```bash
cd cdk && npx jest lambda/checkin-upsert/index.test.ts
```
期待: FAIL（`handler` が存在しない）

- [ ] **Step 3: `cdk/lambda/checkin-upsert/index.ts` を実装する**

```typescript
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyHandler } from 'aws-lambda';
import { createDocumentClient } from '../shared/dynamo';

let client: DynamoDBDocumentClient;
const TABLE_NAME = process.env.TABLE_NAME!;

export const handler: APIGatewayProxyHandler = async (event) => {
  client ??= createDocumentClient();
  const userId = event.requestContext.authorizer!.claims['sub'] as string;
  const body = JSON.parse(event.body ?? '{}');

  await client.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      userId,
      date: body.date,
      habits: body.habits ?? {},
      today_done: body.today_done ?? '',
      tomorrow_tasks: body.tomorrow_tasks ?? '',
      blog_count: body.blog_count ?? 0,
      insights: body.insights ?? '',
      mood: body.mood ?? '',
      obstacles: body.obstacles ?? '',
      updated_at: new Date().toISOString(),
    },
  }));

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true }),
  };
};
```

- [ ] **Step 4: テストを実行してPASSを確認する**

```bash
cd cdk && npx jest lambda/checkin-upsert/index.test.ts
```
期待: 2テスト PASS

- [ ] **Step 5: コミットする**

```bash
git add cdk/lambda/checkin-upsert/
git commit -m "feat: add checkin-upsert Lambda"
```

---

## Task 5: Lambda — checkin-get

**Files:**
- Create: `cdk/lambda/checkin-get/index.ts`
- Create: `cdk/lambda/checkin-get/index.test.ts`

- [ ] **Step 1: テストを書く**

`cdk/lambda/checkin-get/index.test.ts`:

```typescript
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { handler } from './index';

const ddbMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => ddbMock.reset());

function makeEvent(date: string) {
  return {
    requestContext: { authorizer: { claims: { sub: 'user-123' } } },
    pathParameters: { date },
  } as any;
}

test('returns checkin record when it exists', async () => {
  const record = { userId: 'user-123', date: '2026-06-11', habits: { logical: true } };
  ddbMock.on(GetCommand).resolves({ Item: record });

  const result = await handler(makeEvent('2026-06-11'), {} as any, {} as any) as any;

  expect(result.statusCode).toBe(200);
  expect(JSON.parse(result.body)).toEqual(record);
  expect(ddbMock).toHaveReceivedCommandWith(GetCommand, {
    Key: { userId: 'user-123', date: '2026-06-11' },
  });
});

test('returns null when record does not exist', async () => {
  ddbMock.on(GetCommand).resolves({ Item: undefined });

  const result = await handler(makeEvent('2026-06-10'), {} as any, {} as any) as any;

  expect(result.statusCode).toBe(200);
  expect(JSON.parse(result.body)).toBeNull();
});
```

- [ ] **Step 2: テストを実行してFAILを確認する**

```bash
cd cdk && npx jest lambda/checkin-get/index.test.ts
```
期待: FAIL

- [ ] **Step 3: `cdk/lambda/checkin-get/index.ts` を実装する**

```typescript
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyHandler } from 'aws-lambda';
import { createDocumentClient } from '../shared/dynamo';

let client: DynamoDBDocumentClient;
const TABLE_NAME = process.env.TABLE_NAME!;

export const handler: APIGatewayProxyHandler = async (event) => {
  client ??= createDocumentClient();
  const userId = event.requestContext.authorizer!.claims['sub'] as string;
  const date = event.pathParameters!.date!;

  const result = await client.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { userId, date },
  }));

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(result.Item ?? null),
  };
};
```

- [ ] **Step 4: テストを実行してPASSを確認する**

```bash
cd cdk && npx jest lambda/checkin-get/index.test.ts
```
期待: 2テスト PASS

- [ ] **Step 5: コミットする**

```bash
git add cdk/lambda/checkin-get/
git commit -m "feat: add checkin-get Lambda"
```

---

## Task 6: Lambda — summary-get

**Files:**
- Create: `cdk/lambda/summary-get/index.ts`
- Create: `cdk/lambda/summary-get/index.test.ts`

- [ ] **Step 1: テストを書く**

`cdk/lambda/summary-get/index.test.ts`:

```typescript
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { handler } from './index';

const ddbMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => ddbMock.reset());

function makeEvent(date?: string) {
  return {
    requestContext: { authorizer: { claims: { sub: 'user-123' } } },
    queryStringParameters: date ? { date } : null,
  } as any;
}

test('calculates streak of 3 consecutive days', async () => {
  ddbMock.on(QueryCommand).resolves({
    Items: [
      { userId: 'user-123', date: '2026-06-11', blog_count: 2 },
      { userId: 'user-123', date: '2026-06-10', blog_count: 2 },
      { userId: 'user-123', date: '2026-06-09', blog_count: 1 },
    ],
  });

  const result = await handler(makeEvent('2026-06-11'), {} as any, {} as any) as any;
  const body = JSON.parse(result.body);

  expect(result.statusCode).toBe(200);
  expect(body.streak).toBe(3);
  expect(body.today_habits_done).toBe(true);
});

test('streak breaks on gap', async () => {
  ddbMock.on(QueryCommand).resolves({
    Items: [
      { userId: 'user-123', date: '2026-06-11', blog_count: 0 },
      { userId: 'user-123', date: '2026-06-09', blog_count: 0 }, // gap on 06-10
    ],
  });

  const result = await handler(makeEvent('2026-06-11'), {} as any, {} as any) as any;
  expect(JSON.parse(result.body).streak).toBe(1);
});

test('returns zero stats when no records', async () => {
  ddbMock.on(QueryCommand).resolves({ Items: [] });

  const result = await handler(makeEvent('2026-06-11'), {} as any, {} as any) as any;
  const body = JSON.parse(result.body);

  expect(body.streak).toBe(0);
  expect(body.today_habits_done).toBe(false);
  expect(body.this_month_blog_count).toBe(0);
});

test('returns latest blog_count for this month', async () => {
  ddbMock.on(QueryCommand).resolves({
    Items: [
      { userId: 'user-123', date: '2026-06-11', blog_count: 3 },
      { userId: 'user-123', date: '2026-06-10', blog_count: 2 },
    ],
  });

  const result = await handler(makeEvent('2026-06-11'), {} as any, {} as any) as any;
  expect(JSON.parse(result.body).this_month_blog_count).toBe(3);
});
```

- [ ] **Step 2: テストを実行してFAILを確認する**

```bash
cd cdk && npx jest lambda/summary-get/index.test.ts
```
期待: FAIL

- [ ] **Step 3: `cdk/lambda/summary-get/index.ts` を実装する**

```typescript
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyHandler } from 'aws-lambda';
import { createDocumentClient, getJSTToday } from '../shared/dynamo';

let client: DynamoDBDocumentClient;
const TABLE_NAME = process.env.TABLE_NAME!;

function dateMinusDays(base: string, days: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export const handler: APIGatewayProxyHandler = async (event) => {
  client ??= createDocumentClient();
  const userId = event.requestContext.authorizer!.claims['sub'] as string;
  const today = event.queryStringParameters?.date ?? getJSTToday();
  const fromDate = dateMinusDays(today, 30);

  const result = await client.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'userId = :uid AND #d BETWEEN :from AND :to',
    ExpressionAttributeNames: { '#d': 'date' },
    ExpressionAttributeValues: { ':uid': userId, ':from': fromDate, ':to': today },
  }));

  const items = (result.Items ?? []).filter(i => i.date !== 'settings');
  const dateSet = new Set(items.map(i => i.date as string));

  // Streak
  let streak = 0;
  let cursor = today;
  while (dateSet.has(cursor)) {
    streak++;
    cursor = dateMinusDays(cursor, 1);
  }

  // This week rate (Monday-based)
  const todayDate = new Date(today);
  const dow = todayDate.getDay(); // 0=Sun
  const mondayOffset = dow === 0 ? 6 : dow - 1;
  let weekTotal = 0;
  let weekHit = 0;
  for (let i = 0; i <= mondayOffset; i++) {
    weekTotal++;
    if (dateSet.has(dateMinusDays(today, i))) weekHit++;
  }

  // This month blog count (latest record's blog_count)
  const thisMonth = today.slice(0, 7);
  const monthItems = items
    .filter(i => i.date.startsWith(thisMonth) && typeof i.blog_count === 'number')
    .sort((a, b) => (b.date as string).localeCompare(a.date as string));
  const thisMonthBlogCount = monthItems[0]?.blog_count ?? 0;
  const thisMonthCheckinDays = items.filter(i => i.date.startsWith(thisMonth)).length;

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      streak,
      this_week_rate: weekTotal > 0 ? Math.round((weekHit / weekTotal) * 100) / 100 : 0,
      this_month_blog_count: thisMonthBlogCount,
      this_month_checkin_days: thisMonthCheckinDays,
      today_habits_done: dateSet.has(today),
    }),
  };
};
```

- [ ] **Step 4: テストを実行してPASSを確認する**

```bash
cd cdk && npx jest lambda/summary-get/index.test.ts
```
期待: 4テスト PASS

- [ ] **Step 5: コミットする**

```bash
git add cdk/lambda/summary-get/
git commit -m "feat: add summary-get Lambda"
```

---

## Task 7: Lambda — settings-get + settings-upsert

**Files:**
- Create: `cdk/lambda/settings-get/index.ts`
- Create: `cdk/lambda/settings-get/index.test.ts`
- Create: `cdk/lambda/settings-upsert/index.ts`
- Create: `cdk/lambda/settings-upsert/index.test.ts`

- [ ] **Step 1: settings-get のテストを書く**

`cdk/lambda/settings-get/index.test.ts`:

```typescript
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { handler } from './index';

const ddbMock = mockClient(DynamoDBDocumentClient);
beforeEach(() => ddbMock.reset());

const baseEvent = {
  requestContext: { authorizer: { claims: { sub: 'user-123' } } },
} as any;

test('returns stored settings', async () => {
  ddbMock.on(GetCommand).resolves({
    Item: { userId: 'user-123', date: 'settings', reminder_enabled: true, reminder_email: 'a@b.com' },
  });

  const result = await handler(baseEvent, {} as any, {} as any) as any;
  expect(result.statusCode).toBe(200);
  expect(JSON.parse(result.body)).toEqual({ reminder_enabled: true, reminder_email: 'a@b.com' });
  expect(ddbMock).toHaveReceivedCommandWith(GetCommand, { Key: { userId: 'user-123', date: 'settings' } });
});

test('returns defaults when no settings record exists', async () => {
  ddbMock.on(GetCommand).resolves({ Item: undefined });

  const result = await handler(baseEvent, {} as any, {} as any) as any;
  expect(JSON.parse(result.body)).toEqual({ reminder_enabled: false, reminder_email: '' });
});
```

- [ ] **Step 2: settings-upsert のテストを書く**

`cdk/lambda/settings-upsert/index.test.ts`:

```typescript
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { handler } from './index';

const ddbMock = mockClient(DynamoDBDocumentClient);
beforeEach(() => ddbMock.reset());

test('saves settings with date="settings" as sort key', async () => {
  ddbMock.on(PutCommand).resolves({});

  const event = {
    requestContext: { authorizer: { claims: { sub: 'user-123' } } },
    body: JSON.stringify({ reminder_enabled: true, reminder_email: 'a@b.com' }),
  } as any;

  const result = await handler(event, {} as any, {} as any) as any;
  expect(result.statusCode).toBe(200);
  expect(JSON.parse(result.body)).toEqual({ ok: true });
  expect(ddbMock).toHaveReceivedCommandWith(PutCommand, {
    Item: { userId: 'user-123', date: 'settings', reminder_enabled: true, reminder_email: 'a@b.com' },
  });
});
```

- [ ] **Step 3: テストを実行してFAILを確認する**

```bash
cd cdk && npx jest lambda/settings-get/index.test.ts lambda/settings-upsert/index.test.ts
```
期待: FAIL（両方）

- [ ] **Step 4: settings-get を実装する**

`cdk/lambda/settings-get/index.ts`:

```typescript
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyHandler } from 'aws-lambda';
import { createDocumentClient } from '../shared/dynamo';

let client: DynamoDBDocumentClient;
const TABLE_NAME = process.env.TABLE_NAME!;

export const handler: APIGatewayProxyHandler = async (event) => {
  client ??= createDocumentClient();
  const userId = event.requestContext.authorizer!.claims['sub'] as string;

  const result = await client.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { userId, date: 'settings' },
  }));

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      reminder_enabled: result.Item?.reminder_enabled ?? false,
      reminder_email: result.Item?.reminder_email ?? '',
    }),
  };
};
```

- [ ] **Step 5: settings-upsert を実装する**

`cdk/lambda/settings-upsert/index.ts`:

```typescript
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyHandler } from 'aws-lambda';
import { createDocumentClient } from '../shared/dynamo';

let client: DynamoDBDocumentClient;
const TABLE_NAME = process.env.TABLE_NAME!;

export const handler: APIGatewayProxyHandler = async (event) => {
  client ??= createDocumentClient();
  const userId = event.requestContext.authorizer!.claims['sub'] as string;
  const body = JSON.parse(event.body ?? '{}');

  await client.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      userId,
      date: 'settings',
      reminder_enabled: Boolean(body.reminder_enabled),
      reminder_email: body.reminder_email ?? '',
    },
  }));

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true }),
  };
};
```

- [ ] **Step 6: テストを実行してPASSを確認する**

```bash
cd cdk && npx jest lambda/settings-get/index.test.ts lambda/settings-upsert/index.test.ts
```
期待: 3テスト PASS

- [ ] **Step 7: コミットする**

```bash
git add cdk/lambda/settings-get/ cdk/lambda/settings-upsert/
git commit -m "feat: add settings-get and settings-upsert Lambdas"
```

---

## Task 8: Lambda — reminder-send

**Files:**
- Create: `cdk/lambda/reminder-send/index.ts`
- Create: `cdk/lambda/reminder-send/index.test.ts`

- [ ] **Step 1: テストを書く**

`cdk/lambda/reminder-send/index.test.ts`:

```typescript
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { DynamoDBDocumentClient, ScanCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { handler } from './index';

const ddbMock = mockClient(DynamoDBDocumentClient);
const sesMock = mockClient(SESClient);

beforeEach(() => {
  ddbMock.reset();
  sesMock.reset();
  jest.useFakeTimers().setSystemTime(new Date('2026-06-11T10:00:00Z')); // JST 19:00
});
afterEach(() => jest.useRealTimers());

test('sends email when user has not checked in today', async () => {
  ddbMock.on(ScanCommand).resolves({
    Items: [{ userId: 'u1', date: 'settings', reminder_enabled: true, reminder_email: 'a@b.com' }],
  });
  ddbMock.on(GetCommand).resolves({ Item: undefined }); // no checkin
  sesMock.on(SendEmailCommand).resolves({});

  await handler({} as any);

  expect(sesMock).toHaveReceivedCommandWith(SendEmailCommand, {
    Destination: { ToAddresses: ['a@b.com'] },
  });
});

test('skips when user has already checked in today', async () => {
  ddbMock.on(ScanCommand).resolves({
    Items: [{ userId: 'u1', date: 'settings', reminder_enabled: true, reminder_email: 'a@b.com' }],
  });
  ddbMock.on(GetCommand).resolves({ Item: { userId: 'u1', date: '2026-06-11' } }); // checked in
  sesMock.on(SendEmailCommand).resolves({});

  await handler({} as any);

  expect(sesMock).not.toHaveReceivedCommand(SendEmailCommand);
});

test('skips when reminder_enabled is false', async () => {
  ddbMock.on(ScanCommand).resolves({
    Items: [{ userId: 'u1', date: 'settings', reminder_enabled: false, reminder_email: 'a@b.com' }],
  });
  ddbMock.on(GetCommand).resolves({ Item: undefined });
  sesMock.on(SendEmailCommand).resolves({});

  await handler({} as any);

  expect(sesMock).not.toHaveReceivedCommand(SendEmailCommand);
});

test('continues processing other users when SES fails for one', async () => {
  ddbMock.on(ScanCommand).resolves({
    Items: [
      { userId: 'u1', date: 'settings', reminder_enabled: true, reminder_email: 'fail@b.com' },
      { userId: 'u2', date: 'settings', reminder_enabled: true, reminder_email: 'ok@b.com' },
    ],
  });
  ddbMock.on(GetCommand).resolves({ Item: undefined });
  sesMock.on(SendEmailCommand)
    .rejectsOnce(new Error('SES error'))
    .resolves({});

  await expect(handler({} as any)).resolves.not.toThrow();
  expect(sesMock).toHaveReceivedNthCommandWith(2, SendEmailCommand, {
    Destination: { ToAddresses: ['ok@b.com'] },
  });
});
```

- [ ] **Step 2: テストを実行してFAILを確認する**

```bash
cd cdk && npx jest lambda/reminder-send/index.test.ts
```
期待: FAIL

- [ ] **Step 3: `cdk/lambda/reminder-send/index.ts` を実装する**

```typescript
import { DynamoDBDocumentClient, ScanCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { createDocumentClient, getJSTToday } from '../shared/dynamo';

let dynamo: DynamoDBDocumentClient;
let ses: SESClient;
const TABLE_NAME = process.env.TABLE_NAME!;
const FROM_EMAIL = process.env.FROM_EMAIL!;

export const handler = async (_event: unknown): Promise<void> => {
  dynamo ??= createDocumentClient();
  ses ??= new SESClient({});
  const today = getJSTToday();

  const scan = await dynamo.send(new ScanCommand({
    TableName: TABLE_NAME,
    FilterExpression: '#d = :settings AND reminder_enabled = :true',
    ExpressionAttributeNames: { '#d': 'date' },
    ExpressionAttributeValues: { ':settings': 'settings', ':true': true },
  }));

  for (const settings of scan.Items ?? []) {
    const { userId, reminder_email } = settings as { userId: string; reminder_email: string };
    if (!reminder_email) continue;

    const checkin = await dynamo.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { userId, date: today },
    }));

    if (checkin.Item) continue;

    try {
      await ses.send(new SendEmailCommand({
        Source: FROM_EMAIL,
        Destination: { ToAddresses: [reminder_email] },
        Message: {
          Subject: { Data: '【成長計画】今日のチェックインがまだです', Charset: 'UTF-8' },
          Body: {
            Text: {
              Data: '今日の習慣チェックを記録しましょう。\n\nhttps://growth.calm-pm-lab.com/daily.html',
              Charset: 'UTF-8',
            },
          },
        },
      }));
    } catch (err) {
      console.error(`Reminder failed for ${userId}:`, err);
    }
  }
};
```

- [ ] **Step 4: テストを実行してPASSを確認する**

```bash
cd cdk && npx jest lambda/reminder-send/index.test.ts
```
期待: 4テスト PASS

- [ ] **Step 5: 全 Lambda テストをまとめて実行する**

```bash
cd cdk && npx jest
```
期待: 全テスト PASS

- [ ] **Step 6: コミットする**

```bash
git add cdk/lambda/reminder-send/
git commit -m "feat: add reminder-send Lambda"
```

---

## Task 9: CDK スタック — API Gateway + EventBridge + SES + 全Lambda配線

**Files:**
- Modify: `cdk/lib/growth-stack.ts`
- Modify: `cdk/lib/growth-stack.test.ts`

- [ ] **Step 1: growth-stack.test.ts にテストを追加する**

既存テストの末尾に追記:

```typescript
test('API Gateway is created', () => {
  template.resourceCountIs('AWS::ApiGateway::RestApi', 1);
});

test('all Lambda functions exist', () => {
  template.resourceCountIs('AWS::Lambda::Function', 6);
});

test('two EventBridge rules are created', () => {
  template.resourceCountIs('AWS::Events::Rule', 2);
});

test('CFN outputs include UserPoolId, UserPoolClientId, ApiUrl', () => {
  template.hasOutput('UserPoolId', {});
  template.hasOutput('UserPoolClientId', {});
  template.hasOutput('ApiUrl', {});
});
```

- [ ] **Step 2: テストを実行してFAILを確認する**

```bash
cd cdk && npx jest lib/growth-stack.test.ts
```
期待: 新しいテストが FAIL（Lambda 0個、API GW なし等）

- [ ] **Step 3: `cdk/lib/growth-stack.ts` を全リソース入りに更新する**

```typescript
import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejsLambda from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import * as path from 'path';

export class GrowthStack extends cdk.Stack {
  public readonly table: dynamodb.Table;
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // DynamoDB
    this.table = new dynamodb.Table(this, 'CheckinsTable', {
      tableName: 'growth-checkins',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'date', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Cognito
    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: 'growth-plan-users',
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      passwordPolicy: { minLength: 8, requireUppercase: false, requireSymbols: false },
    });

    this.userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool: this.userPool,
      authFlows: { userPassword: true, userSrp: true },
      generateSecret: false,
    });

    const fromEmail = 'noreply@calm-pm-lab.com';
    const commonEnv = { TABLE_NAME: this.table.tableName, FROM_EMAIL: fromEmail };
    const lambdaDir = path.join(__dirname, '../lambda');

    const makeFn = (id: string, entry: string) =>
      new nodejsLambda.NodejsFunction(this, id, {
        entry: path.join(lambdaDir, entry),
        handler: 'handler',
        runtime: lambda.Runtime.NODEJS_22_X,
        environment: commonEnv,
        timeout: cdk.Duration.seconds(10),
      });

    const checkinUpsert = makeFn('CheckinUpsert', 'checkin-upsert/index.ts');
    const checkinGet    = makeFn('CheckinGet',    'checkin-get/index.ts');
    const summaryGet    = makeFn('SummaryGet',    'summary-get/index.ts');
    const settingsGet   = makeFn('SettingsGet',   'settings-get/index.ts');
    const settingsUpsert = makeFn('SettingsUpsert', 'settings-upsert/index.ts');
    const reminderSend  = makeFn('ReminderSend',  'reminder-send/index.ts');

    this.table.grantReadWriteData(checkinUpsert);
    this.table.grantReadData(checkinGet);
    this.table.grantReadData(summaryGet);
    this.table.grantReadData(settingsGet);
    this.table.grantWriteData(settingsUpsert);
    this.table.grantReadData(reminderSend);

    // SES send permission for reminder
    reminderSend.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ses:SendEmail'],
      resources: ['*'],
    }));

    // API Gateway
    const api = new apigateway.RestApi(this, 'GrowthApi', {
      restApiName: 'growth-plan-api',
      defaultCorsPreflightOptions: {
        allowOrigins: ['https://growth.calm-pm-lab.com'],
        allowMethods: ['GET', 'POST', 'PUT', 'OPTIONS'],
        allowHeaders: ['Authorization', 'Content-Type'],
      },
    });

    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'Authorizer', {
      cognitoUserPools: [this.userPool],
    });
    const authOpts: apigateway.MethodOptions = {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    };

    const checkins = api.root.addResource('checkins');
    checkins.addMethod('POST', new apigateway.LambdaIntegration(checkinUpsert), authOpts);
    const checkinDate = checkins.addResource('{date}');
    checkinDate.addMethod('GET', new apigateway.LambdaIntegration(checkinGet), authOpts);
    const summary = checkins.addResource('summary');
    summary.addMethod('GET', new apigateway.LambdaIntegration(summaryGet), authOpts);

    const settings = api.root.addResource('settings');
    settings.addMethod('GET', new apigateway.LambdaIntegration(settingsGet), authOpts);
    settings.addMethod('PUT', new apigateway.LambdaIntegration(settingsUpsert), authOpts);

    // EventBridge rules (JST 6:00 = UTC 21:00, JST 18:00 = UTC 9:00)
    new events.Rule(this, 'ReminderMorning', {
      schedule: events.Schedule.cron({ hour: '21', minute: '0' }),
      targets: [new targets.LambdaFunction(reminderSend)],
    });
    new events.Rule(this, 'ReminderEvening', {
      schedule: events.Schedule.cron({ hour: '9', minute: '0' }),
      targets: [new targets.LambdaFunction(reminderSend)],
    });

    // Outputs
    new cdk.CfnOutput(this, 'UserPoolId', { value: this.userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: this.userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, 'ApiUrl', { value: api.url });
  }
}
```

- [ ] **Step 4: テストを実行してPASSを確認する**

```bash
cd cdk && npx jest lib/growth-stack.test.ts
```
期待: 全テスト PASS

- [ ] **Step 5: コミットする**

```bash
git add cdk/lib/growth-stack.ts cdk/lib/growth-stack.test.ts
git commit -m "feat: complete CDK stack with API Gateway, EventBridge, and all Lambdas"
```

---

## Task 10: CDK デプロイ + SES ドメイン検証（手動）

- [ ] **Step 1: AWS 認証情報が設定されていることを確認する**

```bash
aws sts get-caller-identity
```
期待: `Account`, `UserId`, `Arn` が表示される

- [ ] **Step 2: CDK bootstrap を実行する（初回のみ）**

```bash
cd cdk && npx cdk bootstrap
```
期待: `✅  Environment aws://ACCOUNT/ap-northeast-1 bootstrapped`

- [ ] **Step 3: CDK deploy を実行する**

```bash
cd cdk && npx cdk deploy --require-approval never
```
期待: `✅  GrowthStack` + Outputs が表示される

- [ ] **Step 4: 出力値を GitHub Secrets に登録する**

表示された Outputs から以下を GitHub の Settings → Secrets and variables → Actions に登録:
- `COGNITO_USER_POOL_ID` ← `UserPoolId` の値
- `COGNITO_CLIENT_ID` ← `UserPoolClientId` の値
- `API_URL` ← `ApiUrl` の値（末尾スラッシュを除く）

- [ ] **Step 5: Cognito でテストユーザーを作成する**

```bash
aws cognito-idp admin-create-user \
  --user-pool-id <UserPoolId> \
  --username <自分のメールアドレス> \
  --temporary-password TempPass1! \
  --message-action SUPPRESS

aws cognito-idp admin-set-user-password \
  --user-pool-id <UserPoolId> \
  --username <自分のメールアドレス> \
  --password <本番パスワード> \
  --permanent
```

- [ ] **Step 6: SES でドメイン/メールアドレスを検証する**

SES Sandbox 解除 or 送信元メールを検証:
```bash
aws ses verify-email-identity --email-address noreply@calm-pm-lab.com
```
または SES コンソール → Verified identities → ドメイン `calm-pm-lab.com` を追加してDNSレコードを設定する。

---

## Task 11: daily.html — ベース構造 + Cognito 認証

**Files:**
- Create: `daily.html`

- [ ] **Step 1: daily.html の基本HTML（プレースホルダー入り）を作成する**

```html
<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>デイリーチェックイン</title>
<script src="https://unpkg.com/amazon-cognito-identity-js@6.3.12/dist/amazon-cognito-identity.min.js"></script>
<style>
/* 既存ダッシュボードと同じCSS変数を引き継ぐ */
:root {
  --bg: #ffffff; --bg2: #f5f4f0; --bg3: #eeecea;
  --text: #1a1a18; --text2: #5a5a56; --text3: #8c8b84;
  --border: rgba(0,0,0,0.1); --border2: rgba(0,0,0,0.18);
  --purple: #534AB7; --purple-l: #EEEDFE; --purple-d: #3C3489;
  --teal: #1D9E75; --teal-l: #E1F5EE; --coral: #D85A30;
  --amber: #BA7517; --radius: 10px;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #1c1c1a; --bg2: #252523; --bg3: #2e2e2b;
    --text: #e8e6df; --text2: #a8a69e; --text3: #6e6c66;
    --border: rgba(255,255,255,0.1); --border2: rgba(255,255,255,0.18);
    --purple-l: #26215C; --purple-d: #CECBF6;
  }
}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Hiragino Sans', 'Yu Gothic UI', sans-serif;
       background: var(--bg); color: var(--text); line-height: 1.6; font-size: 15px; }
.container { max-width: 600px; margin: 0 auto; padding: 0 0 4rem; }
#login-view, #app-view { }
#login-view { display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 2rem; }
.login-box { width: 100%; max-width: 360px; }
.login-box h1 { font-size: 20px; font-weight: 600; margin-bottom: 1.5rem; }
.field { margin-bottom: 12px; }
.field label { display: block; font-size: 12px; color: var(--text2); margin-bottom: 4px; }
.field input { width: 100%; border: 1px solid var(--border2); border-radius: 7px;
               padding: 10px 12px; font-size: 14px; background: var(--bg2); color: var(--text); }
.btn-primary { width: 100%; background: var(--purple); color: #fff; border: none;
               border-radius: 7px; padding: 11px; font-size: 14px; font-weight: 600; cursor: pointer; }
.error-msg { font-size: 12px; color: var(--coral); margin-top: 8px; }

/* App header */
.app-header { background: var(--purple); color: #fff; padding: 14px 16px;
              display: flex; justify-content: space-between; align-items: center; }
.app-header-left h1 { font-size: 15px; font-weight: 600; }
.app-header-left .date-nav { font-size: 12px; opacity: 0.85; margin-top: 2px; }
.streak-badge { background: rgba(255,255,255,0.2); border-radius: 12px;
                padding: 3px 10px; font-size: 12px; }

/* Tabs */
.tab-bar { display: flex; border-bottom: 1px solid var(--border); background: var(--bg);
           padding: 0 8px; overflow-x: auto; }
.tab-btn { padding: 10px 12px; font-size: 12px; border: none; background: transparent;
           color: var(--text2); cursor: pointer; border-bottom: 2px solid transparent;
           white-space: nowrap; transition: color .15s; }
.tab-btn.active { color: var(--purple); border-bottom-color: var(--purple); font-weight: 600; }
.tab-panel { display: none; padding: 16px; }
.tab-panel.active { display: block; }

/* Common form elements */
.section-label { font-size: 11px; font-weight: 700; text-transform: uppercase;
                 letter-spacing: .05em; color: var(--text3); margin-bottom: 10px; }
.habit-row { display: flex; align-items: center; gap: 10px; background: var(--bg);
             border: 1px solid var(--border); border-radius: 7px; padding: 10px 12px;
             margin-bottom: 6px; cursor: pointer; }
.habit-row input[type=checkbox] { width: 16px; height: 16px; accent-color: var(--purple); flex-shrink: 0; }
.habit-row .habit-name { font-size: 13px; flex: 1; }
.habit-row .habit-freq { font-size: 11px; color: var(--text3); }
textarea { width: 100%; border: 1px solid var(--border); border-radius: 7px; padding: 10px;
           font-size: 13px; background: var(--bg2); color: var(--text); resize: none;
           font-family: inherit; }
.field-label { font-size: 12px; font-weight: 600; margin-bottom: 5px; margin-top: 14px; }
.btn-save { width: 100%; margin-top: 16px; background: var(--purple); color: #fff;
            border: none; border-radius: 7px; padding: 11px; font-size: 13px;
            font-weight: 600; cursor: pointer; }
.save-status { font-size: 11px; color: var(--text3); text-align: center; margin-top: 6px;
               min-height: 16px; }
.stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px; }
.stat-card { background: var(--bg2); border-radius: 7px; padding: 10px; text-align: center; }
.stat-label { font-size: 10px; color: var(--text3); margin-bottom: 3px; }
.stat-value { font-size: 22px; font-weight: 700; color: var(--purple); }
.stat-sub { font-size: 11px; color: var(--text3); }
.toggle-row { display: flex; align-items: center; justify-content: space-between;
              padding: 12px 0; border-bottom: 1px solid var(--border); }
.toggle-row:last-child { border-bottom: none; }
.toggle-label { font-size: 13px; }
.toggle-desc { font-size: 11px; color: var(--text3); margin-top: 2px; }
</style>
</head>
<body>
<div class="container">

<!-- ログインビュー -->
<div id="login-view">
  <div class="login-box">
    <h1>デイリーチェックイン</h1>
    <div class="field"><label>メールアドレス</label>
      <input type="email" id="email" placeholder="you@example.com">
    </div>
    <div class="field"><label>パスワード</label>
      <input type="password" id="password" placeholder="パスワード">
    </div>
    <button class="btn-primary" onclick="login()">ログイン</button>
    <div class="error-msg" id="login-error"></div>
  </div>
</div>

<!-- アプリビュー（認証後） -->
<div id="app-view" style="display:none">
  <div class="app-header">
    <div class="app-header-left">
      <h1>デイリーチェックイン</h1>
      <div class="date-nav">
        <button onclick="shiftDate(-1)" style="background:none;border:none;color:#fff;cursor:pointer">◀</button>
        <span id="header-date"></span>
        <button onclick="shiftDate(1)" id="btn-next-day" style="background:none;border:none;color:#fff;cursor:pointer">▶</button>
      </div>
    </div>
    <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
      <span class="streak-badge" id="streak-badge">🔥 -日</span>
      <a href="index.html" style="font-size:11px;opacity:0.75;color:#fff;text-decoration:none">← ダッシュボード</a>
    </div>
  </div>

  <div class="tab-bar">
    <button class="tab-btn active" onclick="switchTab('habits',this)">✅ 習慣</button>
    <button class="tab-btn" onclick="switchTab('record',this)">📝 記録</button>
    <button class="tab-btn" onclick="switchTab('reflect',this)">🔍 振り返り</button>
    <button class="tab-btn" onclick="switchTab('stats',this)">📊 統計</button>
    <button class="tab-btn" onclick="switchTab('config',this)">⚙️ 設定</button>
  </div>

  <!-- 習慣タブ / 記録タブ / 振り返りタブ / 統計タブ / 設定タブ は Task 12〜15 で追加 -->
</div>

</div><!-- /container -->

<script>
const CONFIG = {
  userPoolId: '__COGNITO_USER_POOL_ID__',
  clientId: '__COGNITO_CLIENT_ID__',
  apiUrl: '__API_URL__',
};

// Cognito セットアップ
const poolData = { UserPoolId: CONFIG.userPoolId, ClientId: CONFIG.clientId };
const userPool = new AmazonCognitoIdentity.CognitoUserPool(poolData);

let currentUser = null;
let idToken = null;
let currentDate = getTodayJST();
let selectedMood = '';  // Task 14で更新される

function getTodayJST() {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

function switchTab(name, btn) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  btn.classList.add('active');
  if (name === 'stats') loadStats();
  if (name === 'config') loadSettings();
}

function shiftDate(delta) {
  const d = new Date(currentDate);
  d.setDate(d.getDate() + delta);
  const next = d.toISOString().slice(0, 10);
  if (next > getTodayJST()) return;
  currentDate = next;
  updateDateHeader();
  loadCurrentDateData();
}

function updateDateHeader() {
  const d = new Date(currentDate + 'T00:00:00');
  const days = ['日','月','火','水','木','金','土'];
  document.getElementById('header-date').textContent =
    `${currentDate.replace(/-/g, '/')}（${days[d.getDay()]}）`;
  document.getElementById('btn-next-day').style.opacity = currentDate === getTodayJST() ? '0.3' : '1';
}

async function api(path, options = {}) {
  const res = await fetch(CONFIG.apiUrl + path, {
    ...options,
    headers: { 'Authorization': `Bearer ${idToken}`, 'Content-Type': 'application/json', ...options.headers },
  });
  return res.json();
}

// 認証チェック（ページロード時）
window.addEventListener('load', () => {
  const user = userPool.getCurrentUser();
  if (!user) return;
  user.getSession((err, session) => {
    if (err || !session.isValid()) return;
    currentUser = user;
    idToken = session.getIdToken().getJwtToken();
    showApp();
  });
});

function showApp() {
  document.getElementById('login-view').style.display = 'none';
  document.getElementById('app-view').style.display = 'block';
  updateDateHeader();
  loadCurrentDateData();
  loadSummaryBadge();
}

function login() {
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  const errEl = document.getElementById('login-error');
  errEl.textContent = '';

  const cognitoUser = new AmazonCognitoIdentity.CognitoUser({ Username: email, Pool: userPool });
  const authDetails = new AmazonCognitoIdentity.AuthenticationDetails({ Username: email, Password: password });

  cognitoUser.authenticateUser(authDetails, {
    onSuccess(session) {
      currentUser = cognitoUser;
      idToken = session.getIdToken().getJwtToken();
      showApp();
    },
    onFailure(err) {
      errEl.textContent = 'ログインに失敗しました。メールアドレスとパスワードを確認してください。';
      console.error(err);
    },
  });
}

async function loadSummaryBadge() {
  try {
    const data = await api(`/checkins/summary?date=${getTodayJST()}`);
    document.getElementById('streak-badge').textContent = `🔥 ${data.streak}日`;
  } catch (e) { /* silent */ }
}

async function loadCurrentDateData() {
  // Task 12以降で実装
}
</script>
</body>
</html>
```

- [ ] **Step 2: ブラウザで動作確認する（ローカルファイルとして開く）**

```bash
open daily.html
```
確認: ログインフォームが表示される（Cognito は未接続なのでログインはまだ不可）

- [ ] **Step 3: コミットする**

```bash
git add daily.html
git commit -m "feat: add daily.html base structure with Cognito auth"
```

---

## Task 12: daily.html — 習慣タブ

**Files:**
- Modify: `daily.html`

- [ ] **Step 1: アプリビュー内に習慣タブのHTMLを追加する**

`<!-- 習慣タブ / ...` のコメントを以下で置き換える:

```html
<!-- 習慣タブ -->
<div id="tab-habits" class="tab-panel active">
  <div class="section-label">必須 — 今日の習慣チェック</div>
  <label class="habit-row"><input type="checkbox" id="h-logical" onchange="onHabitChange()">
    <span class="habit-name">ロジカル思考</span><span class="habit-freq">15分/日</span></label>
  <label class="habit-row"><input type="checkbox" id="h-critical" onchange="onHabitChange()">
    <span class="habit-name">クリティカル思考</span><span class="habit-freq">5分/日</span></label>
  <label class="habit-row"><input type="checkbox" id="h-reading" onchange="onHabitChange()">
    <span class="habit-name">読書メモ・知識整理</span><span class="habit-freq">10分/日</span></label>
  <label class="habit-row"><input type="checkbox" id="h-ai" onchange="onHabitChange()">
    <span class="habit-name">AI活用（Claude Code等）</span><span class="habit-freq">業務活用</span></label>
  <label class="habit-row"><input type="checkbox" id="h-blog" onchange="onHabitChange()">
    <span class="habit-name">ブログ執筆</span><span class="habit-freq">週1〜2本</span></label>
  <div class="section-label" style="margin-top:16px">週次（任意）</div>
  <label class="habit-row" style="opacity:0.75"><input type="checkbox" id="h-weekly" onchange="onHabitChange()">
    <span class="habit-name">システム思考の振り返り</span><span class="habit-freq">週1回</span></label>
  <button class="btn-save" onclick="saveHabits()">保存して次へ →</button>
  <div class="save-status" id="habits-status"></div>
</div>

<!-- 記録タブ（Task 13で追加） -->
<div id="tab-record" class="tab-panel"></div>
<!-- 振り返りタブ（Task 14で追加） -->
<div id="tab-reflect" class="tab-panel"></div>
<!-- 統計タブ（Task 15で追加） -->
<div id="tab-stats" class="tab-panel"></div>
<!-- 設定タブ（Task 16で追加） -->
<div id="tab-config" class="tab-panel"></div>
```

- [ ] **Step 2: `<script>` に習慣の保存・ロード関数を追加する**

`loadCurrentDateData` 関数を以下に置き換え、`saveHabits` / `onHabitChange` / `getHabits` を追加:

```javascript
const HABIT_KEYS = ['logical','critical','reading','ai','blog','weekly'];

function getHabits() {
  return Object.fromEntries(HABIT_KEYS.map(k => [k === 'weekly' ? 'weekly_reflection' : k,
    document.getElementById('h-' + k).checked]));
}

function setHabits(habits) {
  HABIT_KEYS.forEach(k => {
    const key = k === 'weekly' ? 'weekly_reflection' : k;
    document.getElementById('h-' + k).checked = habits?.[key] ?? false;
  });
}

function onHabitChange() {
  // オフライン対応: LocalStorageにも保存
  localStorage.setItem('habits_draft_' + currentDate, JSON.stringify(getHabits()));
}

async function saveHabits() {
  const status = document.getElementById('habits-status');
  status.textContent = '保存中...';
  try {
    await api('/checkins', {
      method: 'POST',
      body: JSON.stringify({ date: currentDate, habits: getHabits() }),
    });
    status.textContent = '✓ 保存しました';
    await loadSummaryBadge();
    setTimeout(() => {
      status.textContent = '';
      switchTab('record', document.querySelector('.tab-btn:nth-child(2)'));
    }, 800);
  } catch (e) {
    status.textContent = '保存に失敗しました。再試行してください。';
  }
}

async function loadCurrentDateData() {
  const draft = localStorage.getItem('habits_draft_' + currentDate);
  try {
    const data = await api('/checkins/' + currentDate);
    if (data) {
      setHabits(data.habits);
      // 記録・振り返りフィールドはTask 13-14で設定
    } else if (draft) {
      setHabits(JSON.parse(draft));
    } else {
      setHabits({});
    }
  } catch (e) {
    if (draft) setHabits(JSON.parse(draft));
  }
}
```

- [ ] **Step 3: デプロイ済み環境でブラウザ動作確認する**

デプロイ後（Task 10完了後）:
1. `daily.html` をブラウザで開いてログイン
2. 習慣チェックを入れて「保存して次へ」をクリック
3. DynamoDB コンソールで `growth-checkins` テーブルにレコードが作成されることを確認

- [ ] **Step 4: コミットする**

```bash
git add daily.html
git commit -m "feat: add habits tab to daily.html"
```

---

## Task 13: daily.html — 記録タブ（auto-save）

**Files:**
- Modify: `daily.html`

- [ ] **Step 1: 記録タブのHTMLを追加する**

`<div id="tab-record" class="tab-panel"></div>` を置き換え:

```html
<div id="tab-record" class="tab-panel">
  <div class="field-label">📖 今日やったこと・学んだこと</div>
  <textarea id="f-today-done" rows="4" placeholder="PMBOKの第3章を読んだ…" oninput="scheduleAutoSave()"></textarea>
  <div class="field-label">→ 明日やること</div>
  <textarea id="f-tomorrow-tasks" rows="3" placeholder="第4章を読む" oninput="scheduleAutoSave()"></textarea>
  <div class="field-label">📝 今月のブログ記事数（累計）</div>
  <div style="display:flex;align-items:center;gap:10px">
    <input type="number" id="f-blog-count" min="0" value="0"
           style="width:72px;border:1px solid var(--border);border-radius:7px;padding:8px;font-size:16px;text-align:center;background:var(--bg2);color:var(--text)"
           oninput="scheduleAutoSave()">
    <span style="font-size:12px;color:var(--text2)">本</span>
  </div>
  <div class="save-status" id="record-status"></div>
</div>
```

- [ ] **Step 2: auto-save ロジックを script に追加する**

```javascript
let autoSaveTimer = null;

function scheduleAutoSave() {
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(autoSave, 1000);
}

async function autoSave() {
  const statusEls = document.querySelectorAll('.save-status');
  statusEls.forEach(el => el.textContent = '保存中...');
  try {
    await api('/checkins', {
      method: 'POST',
      body: JSON.stringify({
        date: currentDate,
        habits: getHabits(),
        today_done: document.getElementById('f-today-done')?.value ?? '',
        tomorrow_tasks: document.getElementById('f-tomorrow-tasks')?.value ?? '',
        blog_count: parseInt(document.getElementById('f-blog-count')?.value ?? '0', 10),
        insights: document.getElementById('f-insights')?.value ?? '',
        mood: selectedMood,
        obstacles: document.getElementById('f-obstacles')?.value ?? '',
      }),
    });
    statusEls.forEach(el => { el.textContent = '✓ 自動保存'; setTimeout(() => el.textContent='', 2000); });
  } catch (e) {
    statusEls.forEach(el => el.textContent = '保存に失敗しました');
  }
}
```

- [ ] **Step 3: `loadCurrentDateData` に記録フィールドのセットを追加する**

```javascript
// loadCurrentDateData の data が存在する場合に追加:
if (data) {
  setHabits(data.habits);
  if (document.getElementById('f-today-done')) {
    document.getElementById('f-today-done').value = data.today_done ?? '';
    document.getElementById('f-tomorrow-tasks').value = data.tomorrow_tasks ?? '';
    document.getElementById('f-blog-count').value = data.blog_count ?? 0;
  }
}
```

- [ ] **Step 4: コミットする**

```bash
git add daily.html
git commit -m "feat: add record tab with auto-save to daily.html"
```

---

## Task 14: daily.html — 振り返りタブ

**Files:**
- Modify: `daily.html`

- [ ] **Step 1: 振り返りタブのHTMLを追加する**

`<div id="tab-reflect" class="tab-panel"></div>` を置き換え:

```html
<div id="tab-reflect" class="tab-panel">
  <div class="field-label">💡 気づき・発見</div>
  <textarea id="f-insights" rows="3" placeholder="今日の学びで「これは使える」と思ったこと…" oninput="scheduleAutoSave()"></textarea>
  <div class="field-label">🧭 モチベーション・コンディション</div>
  <div style="display:flex;gap:8px;margin-bottom:4px" id="mood-picker">
    <button class="mood-btn" data-mood="😄" onclick="selectMood('😄',this)">😄</button>
    <button class="mood-btn" data-mood="🙂" onclick="selectMood('🙂',this)">🙂</button>
    <button class="mood-btn" data-mood="😐" onclick="selectMood('😐',this)">😐</button>
    <button class="mood-btn" data-mood="😔" onclick="selectMood('😔',this)">😔</button>
  </div>
  <style>
    .mood-btn { flex:1; font-size:22px; padding:8px; border:1px solid var(--border);
                border-radius:7px; background:var(--bg); cursor:pointer; }
    .mood-btn.selected { border-color:var(--purple); background:var(--purple-l); }
  </style>
  <div class="field-label">🚧 障害・困っていること</div>
  <textarea id="f-obstacles" rows="2" placeholder="時間確保が難しかった、など…" oninput="scheduleAutoSave()"></textarea>
  <div class="save-status" id="reflect-status"></div>
</div>
```

- [ ] **Step 2: mood 変数と selectMood 関数を script に追加する**

```javascript
let selectedMood = '';

function selectMood(mood, el) {
  selectedMood = mood;
  document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('selected'));
  el.classList.add('selected');
  scheduleAutoSave();
}
```

- [ ] **Step 3: `loadCurrentDateData` に振り返りフィールドのセットを追加する**

```javascript
if (data) {
  // 既存フィールドに加えて:
  if (document.getElementById('f-insights')) {
    document.getElementById('f-insights').value = data.insights ?? '';
    document.getElementById('f-obstacles').value = data.obstacles ?? '';
    if (data.mood) {
      selectedMood = data.mood;
      document.querySelectorAll('.mood-btn').forEach(b => {
        b.classList.toggle('selected', b.dataset.mood === data.mood);
      });
    }
  }
}
```

- [ ] **Step 4: コミットする**

```bash
git add daily.html
git commit -m "feat: add retrospective tab to daily.html"
```

---

## Task 15: daily.html — 統計タブ + 設定タブ

**Files:**
- Modify: `daily.html`

- [ ] **Step 1: 統計タブのHTMLを追加する**

`<div id="tab-stats" class="tab-panel"></div>` を置き換え:

```html
<div id="tab-stats" class="tab-panel">
  <div class="stat-grid" id="stats-grid">
    <div class="stat-card"><div class="stat-label">今週の習慣達成率</div>
      <div class="stat-value" id="s-week-rate">-</div></div>
    <div class="stat-card"><div class="stat-label">連続チェックイン</div>
      <div class="stat-value" id="s-streak" style="color:#D85A30">-</div>
      <div class="stat-sub">日連続 🔥</div></div>
    <div class="stat-card"><div class="stat-label">今月のブログ記事</div>
      <div class="stat-value" id="s-blog" style="color:#1D9E75">-</div>
      <div class="stat-sub">本</div></div>
    <div class="stat-card"><div class="stat-label">今月の記録日数</div>
      <div class="stat-value" id="s-days" style="color:#BA7517">-</div>
      <div class="stat-sub">日</div></div>
  </div>
  <button onclick="location.href='index.html'" style="width:100%;margin-top:4px;background:var(--bg2);border:1px solid var(--border);border-radius:7px;padding:10px;font-size:12px;color:var(--text2);cursor:pointer">
    ダッシュボード（スキルマップ）を開く →
  </button>
</div>
```

- [ ] **Step 2: 設定タブのHTMLを追加する**

`<div id="tab-config" class="tab-panel"></div>` を置き換え:

```html
<div id="tab-config" class="tab-panel">
  <div class="section-label">リマインダー設定</div>
  <div class="toggle-row">
    <div>
      <div class="toggle-label">リマインダーメール</div>
      <div class="toggle-desc">未チェックイン時に 6:00 / 18:00 に送信</div>
    </div>
    <input type="checkbox" id="cfg-enabled" style="width:18px;height:18px;accent-color:var(--purple)" onchange="saveSettings()">
  </div>
  <div class="field-label">宛先メールアドレス</div>
  <input type="email" id="cfg-email" placeholder="you@example.com"
         style="width:100%;border:1px solid var(--border);border-radius:7px;padding:10px;font-size:13px;background:var(--bg2);color:var(--text)"
         oninput="scheduleSettingsSave()">
  <div class="save-status" id="config-status"></div>
</div>
```

- [ ] **Step 3: 統計・設定のロジックを script に追加する**

```javascript
async function loadStats() {
  try {
    const data = await api(`/checkins/summary?date=${getTodayJST()}`);
    document.getElementById('s-week-rate').textContent = Math.round(data.this_week_rate * 100) + '%';
    document.getElementById('s-streak').textContent = data.streak;
    document.getElementById('s-blog').textContent = data.this_month_blog_count;
    document.getElementById('s-days').textContent = data.this_month_checkin_days;
  } catch (e) { /* silent */ }
}

async function loadSettings() {
  try {
    const data = await api('/settings');
    document.getElementById('cfg-enabled').checked = data.reminder_enabled;
    document.getElementById('cfg-email').value = data.reminder_email;
  } catch (e) { /* silent */ }
}

let settingsSaveTimer = null;
function scheduleSettingsSave() {
  clearTimeout(settingsSaveTimer);
  settingsSaveTimer = setTimeout(saveSettings, 1000);
}

async function saveSettings() {
  const status = document.getElementById('config-status');
  status.textContent = '保存中...';
  try {
    await api('/settings', {
      method: 'PUT',
      body: JSON.stringify({
        reminder_enabled: document.getElementById('cfg-enabled').checked,
        reminder_email: document.getElementById('cfg-email').value,
      }),
    });
    status.textContent = '✓ 保存しました';
    setTimeout(() => status.textContent = '', 2000);
  } catch (e) {
    status.textContent = '保存に失敗しました';
  }
}
```

- [ ] **Step 4: コミットする**

```bash
git add daily.html
git commit -m "feat: add stats and settings tabs to daily.html"
```

---

## Task 16: index.html — サマリーカード追加

**Files:**
- Modify: `index.html`

- [ ] **Step 1: `index.html` の `<head>` に Cognito SDK を追加する**

`</style>` の直前に追記:

```css
/* サマリーカード */
.daily-card { background: var(--purple-l); border-radius: var(--radius); padding: 1rem 1.25rem;
              margin-bottom: 2rem; display: flex; align-items: center; justify-content: space-between; }
.daily-card-left { display: flex; flex-direction: column; gap: 4px; }
.daily-card-title { font-size: 13px; font-weight: 600; color: var(--purple-d); }
.daily-card-stats { font-size: 12px; color: var(--text2); display: flex; gap: 14px; }
.daily-card-link { font-size: 12px; font-weight: 600; color: var(--purple); text-decoration: none;
                   padding: 6px 14px; border: 1px solid var(--purple); border-radius: 20px; white-space: nowrap; }
```

- [ ] **Step 2: `.header` divの直後にサマリーカードHTMLを追加する**

```html
<!-- デイリーサマリーカード（認証時のみ表示） -->
<div class="daily-card" id="daily-summary-card" style="display:none">
  <div class="daily-card-left">
    <div class="daily-card-title" id="dsc-title">今日のチェックイン</div>
    <div class="daily-card-stats">
      <span id="dsc-streak">🔥 - 日連続</span>
      <span id="dsc-week">今週 -%</span>
    </div>
  </div>
  <a href="daily.html" class="daily-card-link" id="dsc-link">記録する →</a>
</div>
```

- [ ] **Step 3: `</body>` 直前にサマリーカードのscriptを追加する**

```html
<script src="https://unpkg.com/amazon-cognito-identity-js@6.3.12/dist/amazon-cognito-identity.min.js"></script>
<script>
(function() {
  const CONFIG = { userPoolId: '__COGNITO_USER_POOL_ID__', clientId: '__COGNITO_CLIENT_ID__', apiUrl: '__API_URL__' };
  const userPool = new AmazonCognitoIdentity.CognitoUserPool({ UserPoolId: CONFIG.userPoolId, ClientId: CONFIG.clientId });

  function getTodayJST() {
    const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
    return jst.toISOString().slice(0, 10);
  }

  const user = userPool.getCurrentUser();
  if (!user) return;
  user.getSession(async (err, session) => {
    if (err || !session.isValid()) return;
    const token = session.getIdToken().getJwtToken();
    try {
      const res = await fetch(`${CONFIG.apiUrl}/checkins/summary?date=${getTodayJST()}`,
        { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      document.getElementById('dsc-streak').textContent = `🔥 ${data.streak}日連続`;
      document.getElementById('dsc-week').textContent = `今週 ${Math.round(data.this_week_rate * 100)}%`;
      document.getElementById('dsc-link').textContent = data.today_habits_done ? '確認する →' : '記録する →';
      document.getElementById('daily-summary-card').style.display = 'flex';
    } catch (e) { /* silent */ }
  });
})();
</script>
```

- [ ] **Step 4: ブラウザで確認する**

```bash
open index.html
```
確認: ログイン済みの場合にサマリーカードが表示される

- [ ] **Step 5: コミットする**

```bash
git add index.html
git commit -m "feat: add daily check-in summary card to index.html"
```

---

## Task 17: GitHub Actions デプロイパイプライン

**Files:**
- Create: `.github/workflows/deploy.yml`

- [ ] **Step 1: ワークフローファイルを作成する**

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: write

    steps:
      - uses: actions/checkout@v4

      - name: Inject Cognito and API config
        env:
          COGNITO_USER_POOL_ID: ${{ secrets.COGNITO_USER_POOL_ID }}
          COGNITO_CLIENT_ID: ${{ secrets.COGNITO_CLIENT_ID }}
          API_URL: ${{ secrets.API_URL }}
        run: |
          sed -i "s|__COGNITO_USER_POOL_ID__|${COGNITO_USER_POOL_ID}|g" daily.html index.html
          sed -i "s|__COGNITO_CLIENT_ID__|${COGNITO_CLIENT_ID}|g" daily.html index.html
          sed -i "s|__API_URL__|${API_URL}|g" daily.html index.html

      - name: Deploy to GitHub Pages
        uses: peaceiris/actions-gh-pages@v4
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./
          publish_branch: gh-pages
          cname: growth.calm-pm-lab.com
          exclude_assets: '.github,cdk,docs,node_modules,.gitignore'
```

- [ ] **Step 2: GitHub Pages の配信ブランチを `gh-pages` に変更する**

GitHub リポジトリの Settings → Pages → Branch を `gh-pages` に変更する。

- [ ] **Step 3: main にプッシュしてActions実行を確認する**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: add GitHub Actions deploy workflow with secret injection"
git push origin main
```

GitHub Actions タブでワークフローが成功することを確認する。

- [ ] **Step 4: デプロイ後に https://growth.calm-pm-lab.com/daily.html を開いてログインできることを確認する**

1. ログインフォームが表示される
2. Task 10 で作成したユーザーでログインできる
3. 習慣タブが表示される
4. 習慣チェックして「保存して次へ」→ 記録タブに移動する

- [ ] **Step 5: リマインダーの動作テストをする（オプション）**

```bash
# reminder-send Lambda を手動起動してメールが届くか確認
aws lambda invoke \
  --function-name GrowthStack-ReminderSend \
  --payload '{}' \
  /tmp/reminder-response.json
cat /tmp/reminder-response.json
```
期待: `{}` が返りメールが届く

---

## 全テスト実行確認

- [ ] **最終: CDK Lambda テストが全部パスすることを確認する**

```bash
cd cdk && npx jest --verbose
```
期待:

```
PASS lambda/checkin-upsert/index.test.ts (2 tests)
PASS lambda/checkin-get/index.test.ts (2 tests)
PASS lambda/summary-get/index.test.ts (4 tests)
PASS lambda/settings-get/index.test.ts (2 tests)
PASS lambda/settings-upsert/index.test.ts (1 test)
PASS lambda/reminder-send/index.test.ts (4 tests)
PASS lib/growth-stack.test.ts (7 tests)

Tests: 22 passed
```
