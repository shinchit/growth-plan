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
