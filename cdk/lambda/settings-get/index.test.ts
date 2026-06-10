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
