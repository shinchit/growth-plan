import { DynamoDBDocumentClient, ScanCommand, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { createDocumentClient, getJSTToday, dateMinusDays } from '../shared/dynamo';

let dynamo: DynamoDBDocumentClient;
let ses: SESClient;
const TABLE_NAME = process.env.TABLE_NAME!;
const FROM_EMAIL = process.env.FROM_EMAIL!;

interface Summary {
  streak: number;
  weekPct: number;
  blogCount: number;
  checkinDays: number;
}

interface SkillScores {
  logical: number; critical: number; reading: number;
  ai: number; blog: number; system: number;
}

const defaultSkills: SkillScores = { logical: 0, critical: 0, reading: 0, ai: 0, blog: 0, system: 0 };

async function fetchSkills(userId: string): Promise<SkillScores> {
  const result = await dynamo.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { userId, date: 'skills' },
  }));
  return (result.Item?.scores as SkillScores) ?? defaultSkills;
}

function buildChartUrl(s: SkillScores): string {
  const config = {
    type: 'radar',
    data: {
      labels: ['ロジカル思考', 'クリティカル思考', '読書・知識整理', 'AI活用', 'ブログ執筆', 'システム思考'],
      datasets: [{
        data: [s.logical, s.critical, s.reading, s.ai, s.blog, s.system],
        fill: true,
        backgroundColor: 'rgba(83,74,183,0.2)',
        borderColor: 'rgb(83,74,183)',
        pointBackgroundColor: 'rgb(83,74,183)',
      }],
    },
    options: {
      legend: { display: false },
      scale: { ticks: { min: 0, max: 5, stepSize: 1, display: false } },
    },
  };
  return `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(config))}&w=360&h=280&backgroundColor=white`;
}

async function fetchSummary(userId: string, today: string): Promise<Summary> {
  const fromDate = dateMinusDays(today, 30);
  const result = await dynamo.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'userId = :uid AND #d BETWEEN :from AND :to',
    ExpressionAttributeNames: { '#d': 'date' },
    ExpressionAttributeValues: { ':uid': userId, ':from': fromDate, ':to': today },
  }));

  const items = (result.Items ?? []).filter(i => i.date !== 'settings');
  const dateSet = new Set(items.map(i => i.date as string));

  let streak = 0;
  let cursor = today;
  while (dateSet.has(cursor)) { streak++; cursor = dateMinusDays(cursor, 1); }

  const dow = new Date(today).getDay();
  const mondayOffset = dow === 0 ? 6 : dow - 1;
  let weekTotal = 0, weekHit = 0;
  for (let i = 0; i <= mondayOffset; i++) {
    weekTotal++;
    if (dateSet.has(dateMinusDays(today, i))) weekHit++;
  }

  const thisMonth = today.slice(0, 7);
  const monthItems = items
    .filter(i => (i.date as string).startsWith(thisMonth) && typeof i.blog_count === 'number')
    .sort((a, b) => (b.date as string).localeCompare(a.date as string));

  return {
    streak,
    weekPct: weekTotal > 0 ? Math.round((weekHit / weekTotal) * 100) : 0,
    blogCount: (monthItems[0]?.blog_count as number) ?? 0,
    checkinDays: items.filter(i => (i.date as string).startsWith(thisMonth)).length,
  };
}

function buildHtml(s: Summary, chartUrl: string): string {
  return `<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Hiragino Sans',sans-serif;background:#f5f4f0;margin:0;padding:20px">
<div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden">
  <div style="background:#534AB7;padding:20px 24px">
    <h1 style="color:#fff;font-size:16px;margin:0">📅 今日のチェックインがまだです</h1>
  </div>
  <div style="padding:20px 24px">
    <p style="color:#5a5a56;font-size:13px;margin:0 0 20px">今日の習慣チェックを記録しましょう。</p>
    <table style="width:100%;border-collapse:collapse">
      <tr>
        <td style="padding:12px;background:#f5f4f0;border-radius:8px;text-align:center;width:48%">
          <div style="font-size:11px;color:#8c8b84;margin-bottom:4px">🔥 連続記録</div>
          <div style="font-size:28px;font-weight:700;color:#D85A30">${s.streak}日</div>
        </td>
        <td style="width:4%"></td>
        <td style="padding:12px;background:#f5f4f0;border-radius:8px;text-align:center;width:48%">
          <div style="font-size:11px;color:#8c8b84;margin-bottom:4px">📊 今週達成率</div>
          <div style="font-size:28px;font-weight:700;color:#534AB7">${s.weekPct}%</div>
        </td>
      </tr>
      <tr><td colspan="3" style="height:8px"></td></tr>
      <tr>
        <td style="padding:12px;background:#f5f4f0;border-radius:8px;text-align:center">
          <div style="font-size:11px;color:#8c8b84;margin-bottom:4px">📝 今月ブログ</div>
          <div style="font-size:28px;font-weight:700;color:#1D9E75">${s.blogCount}本</div>
        </td>
        <td style="width:4%"></td>
        <td style="padding:12px;background:#f5f4f0;border-radius:8px;text-align:center">
          <div style="font-size:11px;color:#8c8b84;margin-bottom:4px">📅 今月記録日数</div>
          <div style="font-size:28px;font-weight:700;color:#BA7517">${s.checkinDays}日</div>
        </td>
      </tr>
    </table>
    <div style="margin-top:20px;text-align:center">
      <div style="font-size:12px;font-weight:600;color:#5a5a56;margin-bottom:8px">📈 スキルマップ</div>
      <img src="${chartUrl}" width="360" height="280" alt="スキルマップ" style="max-width:100%;border-radius:8px">
    </div>
    <div style="margin-top:20px;text-align:center">
      <a href="https://growth.calm-pm-lab.com/daily.html"
         style="display:inline-block;background:#534AB7;color:#fff;text-decoration:none;padding:12px 32px;border-radius:8px;font-size:14px;font-weight:600">
        今日のチェックインを記録する →
      </a>
    </div>
  </div>
  <div style="padding:12px 24px;background:#f5f4f0;font-size:11px;color:#8c8b84;text-align:center">
    シニアアーキテクト成長計画 ·
    <a href="https://growth.calm-pm-lab.com" style="color:#534AB7">ダッシュボード</a>
  </div>
</div>
</body></html>`;
}

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
      const [summary, skills] = await Promise.all([fetchSummary(userId, today), fetchSkills(userId)]);
      const chartUrl = buildChartUrl(skills);
      await ses.send(new SendEmailCommand({
        Source: FROM_EMAIL,
        Destination: { ToAddresses: [reminder_email] },
        Message: {
          Subject: { Data: '【成長計画】今日のチェックインがまだです', Charset: 'UTF-8' },
          Body: {
            Html: { Data: buildHtml(summary, chartUrl), Charset: 'UTF-8' },
            Text: {
              Data: `今日の習慣チェックを記録しましょう。\n\n🔥 連続記録: ${summary.streak}日\n📊 今週達成率: ${summary.weekPct}%\n📝 今月ブログ: ${summary.blogCount}本\n📅 今月記録: ${summary.checkinDays}日\n\nhttps://growth.calm-pm-lab.com/daily.html`,
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
