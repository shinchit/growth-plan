import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyHandler } from 'aws-lambda';
import { createDocumentClient, getJSTToday } from '../shared/dynamo';

let client: DynamoDBDocumentClient;
const TABLE_NAME = process.env.TABLE_NAME!;

function dateMinusDays(base: string, days: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export const handler: APIGatewayProxyHandler = async (event) => {
  client ??= createDocumentClient();
  const userId = event.requestContext.authorizer!.claims['sub'] as string;
  const today = event.queryStringParameters?.date ?? getJSTToday();
  const fromDate = dateMinusDays(today, 30);

  const result = await client.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'userId = :uid AND #d BETWEEN :from AND :to',
    ExpressionAttributeNames: { '#d': 'date' },
    ExpressionAttributeValues: { ':uid': userId, ':from': fromDate, ':to': today },
  }));

  const items = (result.Items ?? []).filter(i => i.date !== 'settings');
  const dateSet = new Set(items.map(i => i.date as string));

  // Streak: count consecutive days from today backwards
  let streak = 0;
  let cursor = today;
  while (dateSet.has(cursor)) {
    streak++;
    cursor = dateMinusDays(cursor, 1);
  }

  // This week rate (Monday-based)
  const todayDate = new Date(today);
  const dow = todayDate.getDay(); // 0=Sun
  const mondayOffset = dow === 0 ? 6 : dow - 1;
  let weekTotal = 0;
  let weekHit = 0;
  for (let i = 0; i <= mondayOffset; i++) {
    weekTotal++;
    if (dateSet.has(dateMinusDays(today, i))) weekHit++;
  }

  // This month blog count (latest record's blog_count)
  const thisMonth = today.slice(0, 7);
  const monthItems = items
    .filter(i => i.date.startsWith(thisMonth) && typeof i.blog_count === 'number')
    .sort((a, b) => (b.date as string).localeCompare(a.date as string));
  const thisMonthBlogCount = monthItems[0]?.blog_count ?? 0;
  const thisMonthCheckinDays = items.filter(i => i.date.startsWith(thisMonth)).length;

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      streak,
      this_week_rate: weekTotal > 0 ? Math.round((weekHit / weekTotal) * 100) / 100 : 0,
      this_month_blog_count: thisMonthBlogCount,
      this_month_checkin_days: thisMonthCheckinDays,
      today_habits_done: dateSet.has(today),
    }),
  };
};
