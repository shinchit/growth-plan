import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { handler } from './index';

const ddbMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => ddbMock.reset());

function makeEvent(date?: string) {
  return {
    requestContext: { authorizer: { claims: { sub: 'user-123' } } },
    queryStringParameters: date ? { date } : null,
  } as any;
}

test('calculates streak of 3 consecutive days', async () => {
  ddbMock.on(QueryCommand).resolves({
    Items: [
      { userId: 'user-123', date: '2026-06-11', blog_count: 2 },
      { userId: 'user-123', date: '2026-06-10', blog_count: 2 },
      { userId: 'user-123', date: '2026-06-09', blog_count: 1 },
    ],
  });

  const result = await handler(makeEvent('2026-06-11'), {} as any, {} as any) as any;
  const body = JSON.parse(result.body);

  expect(result.statusCode).toBe(200);
  expect(body.streak).toBe(3);
  expect(body.today_habits_done).toBe(true);
});

test('streak breaks on gap', async () => {
  ddbMock.on(QueryCommand).resolves({
    Items: [
      { userId: 'user-123', date: '2026-06-11', blog_count: 0 },
      { userId: 'user-123', date: '2026-06-09', blog_count: 0 }, // gap on 06-10
    ],
  });

  const result = await handler(makeEvent('2026-06-11'), {} as any, {} as any) as any;
  expect(JSON.parse(result.body).streak).toBe(1);
});

test('returns zero stats when no records', async () => {
  ddbMock.on(QueryCommand).resolves({ Items: [] });

  const result = await handler(makeEvent('2026-06-11'), {} as any, {} as any) as any;
  const body = JSON.parse(result.body);

  expect(body.streak).toBe(0);
  expect(body.today_habits_done).toBe(false);
  expect(body.this_month_blog_count).toBe(0);
});

test('returns latest blog_count for this month', async () => {
  ddbMock.on(QueryCommand).resolves({
    Items: [
      { userId: 'user-123', date: '2026-06-11', blog_count: 3 },
      { userId: 'user-123', date: '2026-06-10', blog_count: 2 },
    ],
  });

  const result = await handler(makeEvent('2026-06-11'), {} as any, {} as any) as any;
  expect(JSON.parse(result.body).this_month_blog_count).toBe(3);
});
