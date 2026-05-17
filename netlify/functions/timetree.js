const https = require('https');

function request(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch(e) { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

exports.handler = async function(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const token = (event.headers['authorization'] || '').replace('Bearer ', '');
  if (!token) return { statusCode: 401, headers, body: JSON.stringify({ error: 'No token' }) };

  const params = event.queryStringParameters || {};
  const path   = params.path || '/calendars';
  const days   = params.days || '30';

  const ttPath = path.startsWith('/') ? path : '/' + path;
  const query  = path.includes('upcoming_events')
    ? `?timezone=Asia%2FTokyo&days=${days}&include=attendees`
    : '';

  const options = {
    hostname: 'timetreeapp.com',
    path: ttPath + query,
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.timetree.v1+json',
    }
  };

  try {
    const result = await request(options);
    return {
      statusCode: result.status,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(result.body),
    };
  } catch(e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
