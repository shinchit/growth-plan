import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { handler } from './index';

const ddbMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => ddbMock.reset());

function makeEvent(body: object) {
  return {
    requestContext: { authorizer: { claims: { sub: 'user-123' } } },
    body: JSON.stringify(body),
  } as any;
}

test('returns 200 and saves record with required fields', async () => {
  ddbMock.on(PutCommand).resolves({});

  const result = await handler(makeEvent({
    date: '2026-06-11',
    habits: { logical: true, critical: false, reading: true, ai: true, blog: false, weekly_reflection: false },
  }), {} as any, {} as any) as any;

  expect(result.statusCode).toBe(200);
  expect(JSON.parse(result.body)).toEqual({ ok: true });
  expect(ddbMock).toHaveReceivedCommandWith(PutCommand, {
    Item: expect.objectContaining({ userId: 'user-123', date: '2026-06-11' }),
  });
});

test('saves optional fields as empty strings/zero when omitted', async () => {
  ddbMock.on(PutCommand).resolves({});

  await handler(makeEvent({ date: '2026-06-11', habits: {} }), {} as any, {} as any);

  expect(ddbMock).toHaveReceivedCommandWith(PutCommand, {
    Item: expect.objectContaining({
      today_done: '',
      tomorrow_tasks: '',
      blog_count: 0,
      insights: '',
      mood: '',
      obstacles: '',
    }),
  });
});
