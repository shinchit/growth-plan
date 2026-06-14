import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyHandler } from 'aws-lambda';
import { createDocumentClient } from '../shared/dynamo';
import { corsHeaders } from '../shared/cors';

let client: DynamoDBDocumentClient;
const TABLE_NAME = process.env.TABLE_NAME!;

export const handler: APIGatewayProxyHandler = async (event) => {
  client ??= createDocumentClient();
  const userId = event.requestContext.authorizer!.claims['sub'] as string;
  const body = JSON.parse(event.body ?? '{}');

  await client.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { userId, date: body.date },
    UpdateExpression: [
      'SET habits = :habits',
      'today_done = :done',
      'tomorrow_tasks = :tomorrow',
      'blog_count = :blog',
      'insights = :insights',
      'mood = :mood',
      'obstacles = :obstacles',
      'morning = :morning',
      'updated_at = :ts',
    ].join(', '),
    ExpressionAttributeValues: {
      ':habits':   body.habits ?? {},
      ':done':     body.today_done ?? '',
      ':tomorrow': body.tomorrow_tasks ?? '',
      ':blog':     body.blog_count ?? 0,
      ':insights': body.insights ?? '',
      ':mood':     body.mood ?? '',
      ':obstacles':body.obstacles ?? '',
      ':morning':  body.morning ?? '',
      ':ts':       new Date().toISOString(),
    },
  }));

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({ ok: true }),
  };
};
