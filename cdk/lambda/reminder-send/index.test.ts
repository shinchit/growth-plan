import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { DynamoDBDocumentClient, ScanCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { handler } from './index';

const ddbMock = mockClient(DynamoDBDocumentClient);
const sesMock = mockClient(SESClient);

beforeEach(() => {
  ddbMock.reset();
  sesMock.reset();
  jest.useFakeTimers().setSystemTime(new Date('2026-06-11T10:00:00Z')); // JST 19:00
});
afterEach(() => jest.useRealTimers());

test('sends email when user has not checked in today', async () => {
  ddbMock.on(ScanCommand).resolves({
    Items: [{ userId: 'u1', date: 'settings', reminder_enabled: true, reminder_email: 'a@b.com' }],
  });
  ddbMock.on(GetCommand).resolves({ Item: undefined }); // no checkin
  sesMock.on(SendEmailCommand).resolves({});

  await handler({} as any);

  expect(sesMock).toHaveReceivedCommandWith(SendEmailCommand, {
    Destination: { ToAddresses: ['a@b.com'] },
  });
});

test('skips when user has already checked in today', async () => {
  ddbMock.on(ScanCommand).resolves({
    Items: [{ userId: 'u1', date: 'settings', reminder_enabled: true, reminder_email: 'a@b.com' }],
  });
  ddbMock.on(GetCommand).resolves({ Item: { userId: 'u1', date: '2026-06-11' } }); // checked in
  sesMock.on(SendEmailCommand).resolves({});

  await handler({} as any);

  expect(sesMock).not.toHaveReceivedCommand(SendEmailCommand);
});

test('skips when reminder_enabled is false', async () => {
  ddbMock.on(ScanCommand).resolves({
    Items: [], // filter expression prevents this from being returned
  });
  sesMock.on(SendEmailCommand).resolves({});

  await handler({} as any);

  expect(sesMock).not.toHaveReceivedCommand(SendEmailCommand);
});

test('continues processing other users when SES fails for one', async () => {
  ddbMock.on(ScanCommand).resolves({
    Items: [
      { userId: 'u1', date: 'settings', reminder_enabled: true, reminder_email: 'fail@b.com' },
      { userId: 'u2', date: 'settings', reminder_enabled: true, reminder_email: 'ok@b.com' },
    ],
  });
  ddbMock.on(GetCommand).resolves({ Item: undefined });
  sesMock.on(SendEmailCommand)
    .rejectsOnce(new Error('SES error'))
    .resolves({});

  await expect(handler({} as any)).resolves.not.toThrow();
  expect(sesMock).toHaveReceivedNthCommandWith(2, SendEmailCommand, {
    Destination: { ToAddresses: ['ok@b.com'] },
  });
});
