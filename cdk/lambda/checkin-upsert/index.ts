import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyHandler } from 'aws-lambda';
import { createDocumentClient } from '../shared/dynamo';
import { corsHeaders } from '../shared/cors';

let client: DynamoDBDocumentClient;
const TABLE_NAME = process.env.TABLE_NAME!;

const FIELD_MAP: Record<string, string> = {
  habits:         ':habits',
  today_done:     ':done',
  tomorrow_tasks: ':tomorrow',
  blog_count:     ':blog',
  insights:       ':insights',
  mood:           ':mood',
  obstacles:      ':obstacles',
  morning:        ':morning',
  daily_tasks:    ':tasks',
};

export const handler: APIGatewayProxyHandler = async (event) => {
  client ??= createDocumentClient();
  const userId = event.requestContext.authorizer!.claims['sub'] as string;
  const body = JSON.parse(event.body ?? '{}');

  const setClauses = ['updated_at = :ts'];
  const values: Record<string, unknown> = { ':ts': new Date().toISOString() };

  for (const [field, placeholder] of Object.entries(FIELD_MAP)) {
    if (body[field] !== undefined) {
      setClauses.push(`${field} = ${placeholder}`);
      values[placeholder] = body[field];
    }
  }

  await client.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { userId, date: body.date },
    UpdateExpression: 'SET ' + setClauses.join(', '),
    ExpressionAttributeValues: values,
  }));

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({ ok: true }),
  };
};
