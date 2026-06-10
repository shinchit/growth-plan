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
