import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { handler } from './index';

const ddbMock = mockClient(DynamoDBDocumentClient);
beforeEach(() => ddbMock.reset());

test('saves skill scores with date="skills" as sort key', async () => {
  ddbMock.on(PutCommand).resolves({});

  const scores = { logical: 4, critical: 3, reading: 3, ai: 5, blog: 2, system: 3 };
  const event = {
    requestContext: { authorizer: { claims: { sub: 'user-123' } } },
    body: JSON.stringify(scores),
  } as any;

  const result = await handler(event, {} as any, {} as any) as any;
  expect(result.statusCode).toBe(200);
  expect(JSON.parse(result.body)).toEqual({ ok: true });
  expect(ddbMock).toHaveReceivedCommandWith(PutCommand, {
    Item: { userId: 'user-123', date: 'skills', scores },
  });
});
