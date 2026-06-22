import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyHandler } from 'aws-lambda';
import { createDocumentClient } from '../shared/dynamo';
import { corsHeaders } from '../shared/cors';

let client: DynamoDBDocumentClient;
const TABLE_NAME = process.env.TABLE_NAME!;

const FIELD_MAP: Record<string, string> = {
  reminder_enabled: ':enabled',
  reminder_email:   ':email',
  recurring_tasks:  ':recurring',
};

export const handler: APIGatewayProxyHandler = async (event) => {
  client ??= createDocumentClient();
  const userId = event.requestContext.authorizer!.claims['sub'] as string;
  const body = JSON.parse(event.body ?? '{}');

  const setClauses = ['updated_at = :ts'];
  const values: Record<string, unknown> = { ':ts': new Date().toISOString() };

  for (const [field, placeholder] of Object.entries(FIELD_MAP)) {
    if (body[field] === undefined) continue;
    setClauses.push(`${field} = ${placeholder}`);
    values[placeholder] = field === 'reminder_enabled' ? Boolean(body[field]) : body[field];
  }

  await client.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { userId, date: 'settings' },
    UpdateExpression: 'SET ' + setClauses.join(', '),
    ExpressionAttributeValues: values,
  }));

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({ ok: true }),
  };
};
