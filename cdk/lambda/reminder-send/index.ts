import { DynamoDBDocumentClient, ScanCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { createDocumentClient, getJSTToday } from '../shared/dynamo';

let dynamo: DynamoDBDocumentClient;
let ses: SESClient;
const TABLE_NAME = process.env.TABLE_NAME!;
const FROM_EMAIL = process.env.FROM_EMAIL!;

export const handler = async (_event: unknown): Promise<void> => {
  dynamo ??= createDocumentClient();
  ses ??= new SESClient({});
  const today = getJSTToday();

  const scan = await dynamo.send(new ScanCommand({
    TableName: TABLE_NAME,
    FilterExpression: '#d = :settings AND reminder_enabled = :true',
    ExpressionAttributeNames: { '#d': 'date' },
    ExpressionAttributeValues: { ':settings': 'settings', ':true': true },
  }));

  for (const settings of scan.Items ?? []) {
    const { userId, reminder_email } = settings as { userId: string; reminder_email: string };
    if (!reminder_email) continue;

    const checkin = await dynamo.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { userId, date: today },
    }));

    if (checkin.Item) continue;

    try {
      await ses.send(new SendEmailCommand({
        Source: FROM_EMAIL,
        Destination: { ToAddresses: [reminder_email] },
        Message: {
          Subject: { Data: '【成長計画】今日のチェックインがまだです', Charset: 'UTF-8' },
          Body: {
            Text: {
              Data: '今日の習慣チェックを記録しましょう。\n\nhttps://growth.calm-pm-lab.com/daily.html',
              Charset: 'UTF-8',
            },
          },
        },
      }));
    } catch (err) {
      console.error(`Reminder failed for ${userId}:`, err);
    }
  }
};
