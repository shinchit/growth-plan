import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { handler } from './index';

const ddbMock = mockClient(DynamoDBDocumentClient);
beforeEach(() => ddbMock.reset());

test('saves skill scores with date="skills" as sort key', async () => {
  ddbMock.on(PutCommand).resolves({});

  const scores = [70, 60, 55, 40, 35, 65, 50, 70];
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
