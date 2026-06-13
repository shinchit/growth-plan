import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { handler } from './index';

const ddbMock = mockClient(DynamoDBDocumentClient);
beforeEach(() => ddbMock.reset());

const baseEvent = {
  requestContext: { authorizer: { claims: { sub: 'user-123' } } },
} as any;

test('returns stored skill scores', async () => {
  const scores = { logical: 4, critical: 3, reading: 3, ai: 5, blog: 2, system: 3 };
  ddbMock.on(GetCommand).resolves({ Item: { userId: 'user-123', date: 'skills', scores } });

  const result = await handler(baseEvent, {} as any, {} as any) as any;
  expect(result.statusCode).toBe(200);
  expect(JSON.parse(result.body)).toEqual(scores);
  expect(ddbMock).toHaveReceivedCommandWith(GetCommand, { Key: { userId: 'user-123', date: 'skills' } });
});

test('returns default zeros when no skills record exists', async () => {
  ddbMock.on(GetCommand).resolves({ Item: undefined });

  const result = await handler(baseEvent, {} as any, {} as any) as any;
  expect(JSON.parse(result.body)).toEqual({ logical: 0, critical: 0, reading: 0, ai: 0, blog: 0, system: 0 });
});
