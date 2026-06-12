import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyHandler } from 'aws-lambda';
import { createDocumentClient } from '../shared/dynamo';
import { corsHeaders } from '../shared/cors';

let client: DynamoDBDocumentClient;
const TABLE_NAME = process.env.TABLE_NAME!;

export const handler: APIGatewayProxyHandler = async (event) => {
  client ??= createDocumentClient();
  const userId = event.requestContext.authorizer!.claims['sub'] as string;
  const date = event.pathParameters!.date!;

  const result = await client.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { userId, date },
  }));

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify(result.Item ?? null),
  };
};
