const https = require('https');

function requestJson(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let parsed = data;
        try { parsed = JSON.parse(data); } catch(e) {}
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

exports.handler = async function(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'POST only' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch(e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const apiKey = payload.apiKey || '';
  const image = payload.image || {};
  const year = Number(payload.year);
  const month = Number(payload.month);
  const workerName = payload.workerName || '白石';

  if (!apiKey || !image.mediaType || !image.base64 || !year || !month) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing required fields' }) };
  }

  const prompt =
`この画像は${year}年${month}月の勤務表です。
対象者は「${workerName}」です。

対象者の各日付の枠を読み取り、勤務日だけを抽出してください。
ルール：
- 対象者名「${workerName}」の行または枠だけを見る
- 枠に「早」が付いている日は早出として early:true
- 「早」が付いていない勤務日は定時として early:false
- 甲・乙・丙が枠内または近くに読める場合は shift に "甲" "乙" "丙" のいずれかを入れる
- 甲・乙・丙が読めない場合は shift を null にする
- 休み、空欄、有休、非番、対象者ではない枠は出さない
- 日付は1から31の数字

以下のJSON形式のみを返してください（他の文章は不要）：
{"days":[{"date":1,"shift":"甲","early":false},{"date":2,"shift":"乙","early":true}]}`;

  const body = JSON.stringify({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.base64 } },
        { type: 'text', text: prompt }
      ]
    }]
  });

  try {
    const result = await requestJson({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      }
    }, body);

    if (result.status < 200 || result.status >= 300) {
      const msg = result.body?.error?.message || result.body?.message || 'Anthropic API error';
      return { statusCode: result.status, headers, body: JSON.stringify({ error: msg }) };
    }

    const text = result.body?.content?.[0]?.text || '';
    const match = text.match(/\{[\s\S]*"days"[\s\S]*\}/);
    if (!match) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'AI応答のJSON解析に失敗しました', raw: text.slice(0, 500) }) };
    }

    const parsed = JSON.parse(match[0]);
    return { statusCode: 200, headers, body: JSON.stringify({ days: parsed.days || [] }) };
  } catch(e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
