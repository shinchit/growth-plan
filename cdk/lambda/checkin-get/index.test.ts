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

// ── carry-forward scenarios ──────────────────────────────────────────────────

test('returns daily_tasks with done field preserved', async () => {
  const tasks = [
    { text: '未完了タスク', start_time: '09:00', duration: 30, done: false },
    { text: '完了タスク',   start_time: '10:00', duration: 60, done: true  },
  ];
  ddbMock.on(GetCommand).resolves({
    Item: { userId: 'user-123', date: '2026-07-01', daily_tasks: tasks },
  });

  const result = await handler(makeEvent('2026-07-01'), {} as any, {} as any) as any;
  const body = JSON.parse(result.body);

  expect(body.daily_tasks).toHaveLength(2);
  expect(body.daily_tasks[0].done).toBe(false);
  expect(body.daily_tasks[1].done).toBe(true);
});

test('returns empty daily_tasks array when no tasks were planned', async () => {
  ddbMock.on(GetCommand).resolves({
    Item: { userId: 'user-123', date: '2026-07-01', habits: { logical: true } },
  });

  const result = await handler(makeEvent('2026-07-01'), {} as any, {} as any) as any;
  const body = JSON.parse(result.body);

  expect(body.daily_tasks).toBeUndefined();
});

test('returns null for a date with no record (carry-forward: no data to pull)', async () => {
  ddbMock.on(GetCommand).resolves({ Item: undefined });

  const result = await handler(makeEvent('2026-07-01'), {} as any, {} as any) as any;

  expect(JSON.parse(result.body)).toBeNull();
});

test('returns daily_tasks including recurring task instances (template_id preserved)', async () => {
  const tasks = [
    { text: '朝のルーティン', start_time: '07:00', duration: 30, done: false, template_id: 'r_1234' },
    { text: '一回限りのタスク', start_time: '', duration: 60, done: false },
  ];
  ddbMock.on(GetCommand).resolves({
    Item: { userId: 'user-123', date: '2026-07-01', daily_tasks: tasks },
  });

  const result = await handler(makeEvent('2026-07-01'), {} as any, {} as any) as any;
  const body = JSON.parse(result.body);

  expect(body.daily_tasks[0].template_id).toBe('r_1234');
  expect(body.daily_tasks[1].template_id).toBeUndefined();
});
