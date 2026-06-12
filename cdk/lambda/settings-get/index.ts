import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyHandler } from 'aws-lambda';
import { createDocumentClient } from '../shared/dynamo';
import { corsHeaders } from '../shared/cors';

let client: DynamoDBDocumentClient;
const TABLE_NAME = process.env.TABLE_NAME!;

export const handler: APIGatewayProxyHandler = async (event) => {
  client ??= createDocumentClient();
  const userId = event.requestContext.authorizer!.claims['sub'] as string;

  const result = await client.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { userId, date: 'settings' },
  }));

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({
      reminder_enabled: result.Item?.reminder_enabled ?? false,
      reminder_email: result.Item?.reminder_email ?? '',
    }),
  };
};
