import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyHandler } from 'aws-lambda';
import { createDocumentClient } from '../shared/dynamo';
import { corsHeaders } from '../shared/cors';

let client: DynamoDBDocumentClient;
const TABLE_NAME = process.env.TABLE_NAME!;

export const handler: APIGatewayProxyHandler = async (event) => {
  client ??= createDocumentClient();
  const userId = event.requestContext.authorizer!.claims['sub'] as string;
  const body = JSON.parse(event.body ?? '{}');

  await client.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      userId,
      date: body.date,
      habits: body.habits ?? {},
      today_done: body.today_done ?? '',
      tomorrow_tasks: body.tomorrow_tasks ?? '',
      blog_count: body.blog_count ?? 0,
      insights: body.insights ?? '',
      mood: body.mood ?? '',
      obstacles: body.obstacles ?? '',
      updated_at: new Date().toISOString(),
    },
  }));

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({ ok: true }),
  };
};
