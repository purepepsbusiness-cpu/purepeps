const ALLOWED_FIELDS = ['order_ref', 'status', 'date', 'items', 'total', 'payment_method', 'tracking'];

function normalizeKey(key) {
  return String(key).toLowerCase().replace(/ /g, '_');
}

exports.handler = async function (event) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const SHEET_API_URL = process.env.SHEET_API_URL;
  if (!SHEET_API_URL) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server misconfigured: SHEET_API_URL not set' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const email = (body.email || '').toLowerCase().trim();
  if (!email || !email.includes('@')) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Valid email required' }) };
  }

  try {
    const resp = await fetch(SHEET_API_URL, { method: 'GET' });
    const data = await resp.json();

    if (!data || !data.success || !Array.isArray(data.data) || data.data.length < 2) {
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, orders: [] }) };
    }

    const sheetHeaders = data.data[0].map(normalizeKey);
    const rows = data.data.slice(1);

    const orders = rows
      .map((row) => {
        const obj = {};
        sheetHeaders.forEach((h, i) => (obj[h] = row[i]));
        return obj;
      })
      .filter((order) => (order.email || '').toLowerCase().trim() === email)
      .map((order) => {
        const filtered = {};
        for (const field of ALLOWED_FIELDS) {
          filtered[field] = order[field] !== undefined ? order[field] : '';
        }
        return filtered;
      });

    return { statusCode: 200, headers, body: JSON.stringify({ success: true, orders }) };
  } catch (err) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Failed to reach Google Sheet', detail: String(err) }) };
  }
};
