import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { handler } from './index';

const ddbMock = mockClient(DynamoDBDocumentClient);
beforeEach(() => ddbMock.reset());

test('updates reminder settings using UpdateCommand', async () => {
  ddbMock.on(UpdateCommand).resolves({});

  const event = {
    requestContext: { authorizer: { claims: { sub: 'user-123' } } },
    body: JSON.stringify({ reminder_enabled: true, reminder_email: 'a@b.com' }),
  } as any;

  const result = await handler(event, {} as any, {} as any) as any;
  expect(result.statusCode).toBe(200);
  expect(JSON.parse(result.body)).toEqual({ ok: true });
  expect(ddbMock).toHaveReceivedCommandWith(UpdateCommand, {
    Key: { userId: 'user-123', date: 'settings' },
    ExpressionAttributeValues: expect.objectContaining({
      ':enabled': true,
      ':email': 'a@b.com',
    }),
  });
});

test('only updates recurring_tasks when only that field is sent', async () => {
  ddbMock.on(UpdateCommand).resolves({});
  const recurring = [{ id: 'r_1', text: 'daily task', recur: 'daily', duration: 30 }];

  const event = {
    requestContext: { authorizer: { claims: { sub: 'user-123' } } },
    body: JSON.stringify({ recurring_tasks: recurring }),
  } as any;

  await handler(event, {} as any, {} as any);
  const values = ddbMock.commandCalls(UpdateCommand)[0].args[0].input.ExpressionAttributeValues!;
  expect(values[':recurring']).toEqual(recurring);
  expect(values[':enabled']).toBeUndefined();
  expect(values[':email']).toBeUndefined();
});
