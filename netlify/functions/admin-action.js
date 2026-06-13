const { requireAdmin } = require('./_verify-helper');

const ACTION_SCHEMAS = {
  fetch_orders:    { requires: [],                        status: null        },
  approve_order:   { requires: ['order_ref'],             status: 'APPROVED'  },
  deny_order:      { requires: ['order_ref'],             status: 'DENIED'    },
  waitlist_order:  { requires: ['order_ref'],             status: 'WAITLIST'  },
  mark_paid:       { requires: ['order_ref'],             status: 'PAID'      },
  mark_shipped:    { requires: ['order_ref', 'tracking'], status: 'SHIPPED'   },
  mark_delivered:  { requires: ['order_ref'],             status: 'DELIVERED' },
};

const VALID_TRANSITIONS = {
  PENDING:   ['APPROVED', 'DENIED', 'WAITLIST'],
  WAITLIST:  ['APPROVED', 'DENIED'],
  APPROVED:  ['PAID', 'DENIED'],
  PAID:      ['SHIPPED'],
  SHIPPED:   ['DELIVERED'],
  DELIVERED: [],
  DENIED:    [],
};

function validateTransition(currentStatus, targetStatus) {
  if (!targetStatus) return null;
  const current = (currentStatus || 'PENDING').toUpperCase();
  const allowed = VALID_TRANSITIONS[current];
  if (!allowed) return `Unknown current status: ${current}`;
  if (!allowed.includes(targetStatus)) {
    return `Cannot move from ${current} → ${targetStatus}. Allowed: ${allowed.join(', ') || 'none (terminal status)'}`;
  }
  return null;
}

function validatePayload(action, payload) {
  const schema = ACTION_SCHEMAS[action];
  const p = payload || {};
  for (const field of schema.requires) {
    if (p[field] === undefined || p[field] === null || p[field] === '') {
      return `Missing required field: ${field}`;
    }
  }
  return null;
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

  const auth = requireAdmin(event, headers);
  if (!auth.ok) return auth.response;

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { action, payload } = body;

  if (!action || !Object.prototype.hasOwnProperty.call(ACTION_SCHEMAS, action)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Unknown or missing action' }) };
  }

  const validationError = validatePayload(action, payload);
  if (validationError) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: validationError }) };
  }

  const SHEET_API_URL = process.env.SHEET_API_URL;
  if (!SHEET_API_URL) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server misconfigured: SHEET_API_URL not set' }) };
  }

  try {
    if (action === 'fetch_orders') {
      const resp = await fetch(SHEET_API_URL, { method: 'GET' });
      const data = await resp.json();
      return { statusCode: 200, headers, body: JSON.stringify(data) };
    }

    const schema = ACTION_SCHEMAS[action];
    const targetStatus = schema.status;

    if (targetStatus && payload && payload.order_ref) {
      const fetchResp = await fetch(SHEET_API_URL, { method: 'GET' });
      const fetchData = await fetchResp.json();

      if (fetchData && fetchData.success && Array.isArray(fetchData.data) && fetchData.data.length > 1) {
        const sheetHeaders = fetchData.data[0].map(h => String(h).toLowerCase().replace(/ /g, '_'));
        const rows = fetchData.data.slice(1);
        const orderRow = rows
          .map(row => { const obj = {}; sheetHeaders.forEach((h, i) => (obj[h] = row[i])); return obj; })
          .find(o => (o.order_ref || '').trim() === payload.order_ref.trim());

        if (orderRow) {
          const transitionError = validateTransition(orderRow.status, targetStatus);
          if (transitionError) {
            return { statusCode: 409, headers, body: JSON.stringify({ error: transitionError }) };
          }
        }
      }
    }

    const forwardPayload = { type: 'update_status', status: targetStatus, acted_by: auth.email };
    for (const field of schema.requires) {
      forwardPayload[field] = payload[field];
    }

    const resp = await fetch(SHEET_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(forwardPayload),
    });

    const text = await resp.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      data = { raw: text };
    }

    return { statusCode: resp.ok ? 200 : 502, headers, body: JSON.stringify(data) };
  } catch (err) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Failed to reach Google Sheet', detail: String(err) }) };
  }
};
