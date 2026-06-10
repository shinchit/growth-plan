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
