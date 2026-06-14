import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { APIGatewayProxyHandler } from 'aws-lambda';
import { createDocumentClient } from '../shared/dynamo';
import { corsHeaders } from '../shared/cors';

let dynamo: DynamoDBDocumentClient;
let cachedApiKey: string | null = null;
const ssm = new SSMClient({});
const TABLE_NAME = process.env.TABLE_NAME!;
const PARAM_NAME = process.env.ANTHROPIC_PARAM_NAME ?? '/growth-plan/anthropic-api-key';

async function getApiKey(): Promise<string> {
  if (cachedApiKey) return cachedApiKey;
  const result = await ssm.send(new GetParameterCommand({ Name: PARAM_NAME, WithDecryption: true }));
  cachedApiKey = result.Parameter!.Value!;
  return cachedApiKey;
}

function buildPrompt(item: Record<string, unknown>): string {
  const parts: string[] = [
    `以下は今日のチェックイン記録です。内容を読んで、明日以降の具体的なアクションにつながる提案を2〜3点、日本語で返してください。

ルール：
- 批評・評価・褒め言葉は一切不要
- 「〜してみる」「〜を試す」「〜を確認する」など実行可能な動詞で締める
- 1点につき1〜2文で簡潔に
- 記録が少ない場合は記録されている内容だけをもとにする\n`,
  ];
  if (item.today_done)     parts.push(`【今日やったこと】\n${item.today_done}`);
  if (item.tomorrow_tasks) parts.push(`【明日やること】\n${item.tomorrow_tasks}`);
  if (item.insights)       parts.push(`【気づき・発見】\n${item.insights}`);
  if (item.obstacles)      parts.push(`【障害・困っていること】\n${item.obstacles}`);
  if (item.morning)        parts.push(`【モーニングページ】\n${item.morning}`);
  if (item.mood)           parts.push(`【コンディション】${item.mood}`);
  return parts.join('\n\n');
}

export const handler: APIGatewayProxyHandler = async (event) => {
  dynamo ??= createDocumentClient();
  const userId = event.requestContext.authorizer!.claims['sub'] as string;
  const date = event.pathParameters!.date!;

  const result = await dynamo.send(new GetCommand({ TableName: TABLE_NAME, Key: { userId, date } }));
  if (!result.Item) {
    return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ error: 'not found' }) };
  }

  const prompt = buildPrompt(result.Item as Record<string, unknown>);
  const apiKey = await getApiKey();

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const data = await res.json() as { content: Array<{ type: string; text: string }> };
  const feedback = data.content[0]?.text ?? '';
  const generated_at = new Date().toISOString();

  await dynamo.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { userId, date },
    UpdateExpression: 'SET ai_feedback = :f',
    ExpressionAttributeValues: { ':f': { text: feedback, generated_at } },
  }));

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({ feedback, generated_at }),
  };
};
