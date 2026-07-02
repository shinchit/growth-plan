import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { handler } from './index';

const ddbMock = mockClient(DynamoDBDocumentClient);
beforeEach(() => ddbMock.reset());

function makeEvent(body: object) {
  return {
    requestContext: { authorizer: { claims: { sub: 'user-123' } } },
    body: JSON.stringify(body),
  } as any;
}

test('returns 200 and updates only the specified fields', async () => {
  ddbMock.on(UpdateCommand).resolves({});

  const result = await handler(makeEvent({
    date: '2026-06-22',
    habits: { logical: true },
    today_done: 'done stuff',
  }), {} as any, {} as any) as any;

  expect(result.statusCode).toBe(200);
  expect(JSON.parse(result.body)).toEqual({ ok: true });
  expect(ddbMock).toHaveReceivedCommandWith(UpdateCommand, {
    Key: { userId: 'user-123', date: '2026-06-22' },
    ExpressionAttributeValues: expect.objectContaining({
      ':habits': { logical: true },
      ':done': 'done stuff',
    }),
  });
});

test('only updates daily_tasks when only tasks are sent', async () => {
  ddbMock.on(UpdateCommand).resolves({});
  const tasks = [{ text: 'タスク1', duration: 30, done: false }];

  await handler(makeEvent({ date: '2026-06-22', daily_tasks: tasks }), {} as any, {} as any);

  const values = ddbMock.commandCalls(UpdateCommand)[0].args[0].input.ExpressionAttributeValues!;
  expect(values[':tasks']).toEqual(tasks);
  expect(values[':habits']).toBeUndefined();
  expect(values[':done']).toBeUndefined();
});

// ── carry-forward scenarios ──────────────────────────────────────────────────

test('saves carried-forward tasks with done:false', async () => {
  ddbMock.on(UpdateCommand).resolves({});
  const carried = [
    { text: '昨日の未完了', start_time: '09:00', duration: 45, done: false },
    { text: '別のタスク',   start_time: '',       duration: 30, done: false },
  ];

  await handler(makeEvent({ date: '2026-07-02', daily_tasks: carried }), {} as any, {} as any);

  const values = ddbMock.commandCalls(UpdateCommand)[0].args[0].input.ExpressionAttributeValues!;
  expect(values[':tasks']).toEqual(carried);
  expect(values[':tasks'].every((t: any) => t.done === false)).toBe(true);
});

test('preserves done:true on existing tasks when saving after carry-forward', async () => {
  ddbMock.on(UpdateCommand).resolves({});
  const mixed = [
    { text: '完了済み',     start_time: '08:00', duration: 30, done: true  },
    { text: '引き継ぎタスク', start_time: '09:00', duration: 45, done: false },
  ];

  await handler(makeEvent({ date: '2026-07-02', daily_tasks: mixed }), {} as any, {} as any);

  const saved = ddbMock.commandCalls(UpdateCommand)[0].args[0].input.ExpressionAttributeValues![':tasks'];
  expect(saved[0].done).toBe(true);
  expect(saved[1].done).toBe(false);
});

test('does not include template_id on plain carried-forward tasks', async () => {
  ddbMock.on(UpdateCommand).resolves({});
  const plain = [{ text: '一回限り', start_time: '', duration: 30, done: false }];

  await handler(makeEvent({ date: '2026-07-02', daily_tasks: plain }), {} as any, {} as any);

  const saved = ddbMock.commandCalls(UpdateCommand)[0].args[0].input.ExpressionAttributeValues![':tasks'];
  expect(saved[0].template_id).toBeUndefined();
});
