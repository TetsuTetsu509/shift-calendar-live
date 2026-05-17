const https = require('https');

const FIREBASE_URL = 'https://shift-calendar-40605-default-rtdb.firebaseio.com/shiftCalData.json';
const REF_DATE = new Date(2026, 3, 1);
const CYCLE_LENGTH = 20;
const INITIAL_POSITIONS = { A: 14, B: 9, C: 4, D: 19 };

function getShift(group, date) {
  const refTime = REF_DATE.getTime();
  const targetTime = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const daysDiff = Math.round((targetTime - refTime) / 86400000);
  const pos = ((INITIAL_POSITIONS[group] + daysDiff) % CYCLE_LENGTH + CYCLE_LENGTH) % CYCLE_LENGTH;
  if (pos <= 4)  return 'ko';
  if (pos <= 6)  return 'off';
  if (pos <= 11) return 'otsu';
  if (pos === 12) return 'off';
  if (pos <= 17) return 'hei';
  return 'off';
}

function fetchData(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
      res.on('error', reject);
    }).on('error', reject);
  });
}

function pad(n) { return String(n).padStart(2, '0'); }

function formatDateStr(date) {
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`;
}

function icalDate(dateStr) { return dateStr.replace(/-/g, ''); }

function parseTime(t) {
  const [h, m] = (t || '0:00').split(':');
  return `${pad(h)}${pad(m||'00')}00`;
}

function escapeIcal(s) {
  return String(s).replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\n/g,'\\n');
}

exports.handler = async function(event) {
  const group = (event.queryStringParameters || {}).group || 'A';
  if (!['A','B','C','D'].includes(group)) {
    return { statusCode: 400, body: 'group must be A/B/C/D' };
  }

  let data;
  try {
    data = await fetchData(FIREBASE_URL);
  } catch(e) {
    return { statusCode: 500, body: 'Firebase fetch error: ' + e.message };
  }

  const settings  = data.settings  || {};
  const days      = data.days      || {};
  const children  = settings.children || [];
  const groupName = settings['name' + group] || group + '組';

  const labelKo   = settings.labelKo   || '甲（日勤）';
  const labelOtsu = settings.labelOtsu || '乙（準夜勤）';
  const labelHei  = settings.labelHei  || '丙（夜勤）';
  const labelOff  = settings.labelOff  || '休み';
  const timeKo    = settings.timeKo    || '8:00-16:30';
  const timeOtsu  = settings.timeOtsu  || '16:00-0:30';
  const timeHei   = settings.timeHei   || '0:00-8:30';

  const SHIFT_INFO = {
    ko:   { label: labelKo,   icon: '☀️'  },
    otsu: { label: labelOtsu, icon: '🌇' },
    hei:  { label: labelHei,  icon: '🌙' },
    off:  { label: labelOff,  icon: '🏠' },
  };

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ShiftCalendar//JP',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${groupName}シフト`,
    'X-WR-TIMEZONE:Asia/Tokyo',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ];

  const now = new Date();
  const dtStamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth()+1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;

  // 2026/4/1 〜 2027/3/31 のシフトを生成
  const startDate = new Date(2026, 3, 1);
  const endDate   = new Date(2027, 2, 31);
  const cur = new Date(startDate);

  while (cur <= endDate) {
    const shift   = getShift(group, cur);
    const info    = SHIFT_INFO[shift];
    const ds      = formatDateStr(cur);
    const iDate   = icalDate(ds);
    const uid     = `shift-${group}-${iDate}@shiftcal`;
    const dayData = days[ds] || {};

    // 説明：下校時間
    let desc = '';
    for (const child of children) {
      const t = (dayData.schoolTimes || {})[child.id];
      if (t) desc += `${child.name}下校: ${t}\n`;
    }
    if (dayData.memo) desc += dayData.memo;

    if (shift === 'off') {
      lines.push('BEGIN:VEVENT');
      lines.push(`UID:${uid}`);
      lines.push(`DTSTAMP:${dtStamp}`);
      lines.push(`DTSTART;VALUE=DATE:${iDate}`);
      lines.push(`DTEND;VALUE=DATE:${iDate}`);
      lines.push(`SUMMARY:${info.icon} ${info.label}`);
      if (desc) lines.push(`DESCRIPTION:${escapeIcal(desc)}`);
      lines.push('END:VEVENT');
    } else {
      let dtStart, dtEnd;
      if (shift === 'ko') {
        const [s, e] = timeKo.split('-');
        dtStart = `${iDate}T${parseTime(s)}`;
        dtEnd   = `${iDate}T${parseTime(e)}`;
      } else if (shift === 'otsu') {
        const [s, e] = timeOtsu.split('-');
        const next = new Date(cur); next.setDate(next.getDate()+1);
        dtStart = `${iDate}T${parseTime(s)}`;
        dtEnd   = `${icalDate(formatDateStr(next))}T${parseTime(e)}`;
      } else {
        const [s, e] = timeHei.split('-');
        dtStart = `${iDate}T${parseTime(s)}`;
        dtEnd   = `${iDate}T${parseTime(e)}`;
      }
      lines.push('BEGIN:VEVENT');
      lines.push(`UID:${uid}`);
      lines.push(`DTSTAMP:${dtStamp}`);
      lines.push(`DTSTART;TZID=Asia/Tokyo:${dtStart}`);
      lines.push(`DTEND;TZID=Asia/Tokyo:${dtEnd}`);
      lines.push(`SUMMARY:${info.icon} ${info.label}`);
      if (desc) lines.push(`DESCRIPTION:${escapeIcal(desc)}`);
      lines.push('END:VEVENT');
    }

    cur.setDate(cur.getDate() + 1);
  }

  // カスタム予定（全日付）
  for (const [ds, dayData] of Object.entries(days)) {
    const iDate = icalDate(ds);
    for (const evt of (dayData.events || [])) {
      const uid = `evt-${evt.id}@shiftcal`;
      lines.push('BEGIN:VEVENT');
      lines.push(`UID:${uid}`);
      lines.push(`DTSTAMP:${dtStamp}`);
      if (evt.startTime) {
        const dtStart = `${iDate}T${parseTime(evt.startTime)}`;
        const dtEnd   = evt.endTime ? `${iDate}T${parseTime(evt.endTime)}` : dtStart;
        lines.push(`DTSTART;TZID=Asia/Tokyo:${dtStart}`);
        lines.push(`DTEND;TZID=Asia/Tokyo:${dtEnd}`);
      } else {
        lines.push(`DTSTART;VALUE=DATE:${iDate}`);
        lines.push(`DTEND;VALUE=DATE:${iDate}`);
      }
      lines.push(`SUMMARY:${escapeIcal(evt.title)}`);
      if (evt.memo) lines.push(`DESCRIPTION:${escapeIcal(evt.memo)}`);
      lines.push('END:VEVENT');
    }
  }

  lines.push('END:VCALENDAR');

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'no-cache, no-store',
      'Access-Control-Allow-Origin': '*',
    },
    body: lines.join('\r\n'),
  };
};
