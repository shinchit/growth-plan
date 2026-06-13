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
  const scores = [70, 60, 55, 40, 35, 65, 50, 70];
  ddbMock.on(GetCommand).resolves({ Item: { userId: 'user-123', date: 'skills', scores } });

  const result = await handler(baseEvent, {} as any, {} as any) as any;
  expect(result.statusCode).toBe(200);
  expect(JSON.parse(result.body)).toEqual(scores);
  expect(ddbMock).toHaveReceivedCommandWith(GetCommand, { Key: { userId: 'user-123', date: 'skills' } });
});

test('returns default scores when no skills record exists', async () => {
  ddbMock.on(GetCommand).resolves({ Item: undefined });

  const result = await handler(baseEvent, {} as any, {} as any) as any;
  expect(JSON.parse(result.body)).toEqual([60, 55, 45, 35, 30, 50, 40, 65]);
});
