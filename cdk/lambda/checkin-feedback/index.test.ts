import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

const ddbMock = mockClient(DynamoDBDocumentClient);
const ssmMock = mockClient(SSMClient);

beforeEach(() => {
  ddbMock.reset();
  ssmMock.reset();
  global.fetch = jest.fn();
});

import { handler } from './index';

const baseEvent = {
  requestContext: { authorizer: { claims: { sub: 'user-123' } } },
  pathParameters: { date: '2026-06-14' },
} as any;

test('generates and stores AI feedback', async () => {
  ddbMock.on(GetCommand).resolves({
    Item: {
      userId: 'user-123', date: '2026-06-14',
      today_done: 'PMBOKを読んだ', insights: '時間管理が大切だと気づいた',
    },
  });
  ssmMock.on(GetParameterCommand).resolves({ Parameter: { Value: 'test-api-key' } });
  (global.fetch as jest.Mock).mockResolvedValue({
    json: async () => ({ content: [{ type: 'text', text: 'フィードバックです。' }] }),
  });
  ddbMock.on(UpdateCommand).resolves({});

  const result = await handler(baseEvent, {} as any, {} as any) as any;
  expect(result.statusCode).toBe(200);
  expect(JSON.parse(result.body).feedback).toBe('フィードバックです。');
  expect(ddbMock).toHaveReceivedCommand(UpdateCommand);
});

test('returns 404 when checkin not found', async () => {
  ddbMock.on(GetCommand).resolves({ Item: undefined });

  const result = await handler(baseEvent, {} as any, {} as any) as any;
  expect(result.statusCode).toBe(404);
});
