import { jsonResponse } from './_verify-helper.js';

const ALLOWED_FIELDS = ['order_ref', 'status', 'date', 'items', 'total', 'payment_method', 'tracking'];

function normalizeKey(key) {
  return String(key).toLowerCase().replace(/ /g, '_');
}

async function verifyGoogleIdToken(idToken, env) {
  const resp = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
  );
  if (!resp.ok) throw new Error('Token validation failed');
  const payload = await resp.json();

  const EXPECTED_AUD = env.GOOGLE_CLIENT_ID;
  if (EXPECTED_AUD && payload.aud !== EXPECTED_AUD) {
    throw new Error('Token audience mismatch');
  }
  if (!payload.email_verified || payload.email_verified === 'false') {
    throw new Error('Email not verified');
  }
  return payload;
}

export async function onRequestPost({ request, env }) {
  const SHEET_API_URL = env.SHEET_API_URL;
  if (!SHEET_API_URL) return jsonResponse({ error: 'Server misconfigured: SHEET_API_URL not set' }, 500);

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const { email: claimedEmail, id_token } = body;

  if (!id_token) {
    return jsonResponse({ error: 'Authentication required: id_token missing' }, 401);
  }

  let verifiedEmail;
  try {
    const payload = await verifyGoogleIdToken(id_token, env);
    verifiedEmail = (payload.email || '').toLowerCase().trim();
  } catch (err) {
    return jsonResponse({ error: 'Invalid or expired Google token' }, 401);
  }

  const claimed = (claimedEmail || '').toLowerCase().trim();
  if (!verifiedEmail || verifiedEmail !== claimed) {
    return jsonResponse({ error: 'Token email does not match requested email' }, 403);
  }

  try {
    const resp = await fetch(SHEET_API_URL, { method: 'GET' });
    const data = await resp.json();

    if (!data || !data.success || !Array.isArray(data.data) || data.data.length < 2) {
      return jsonResponse({ success: true, orders: [] });
    }

    const sheetHeaders = data.data[0].map(normalizeKey);
    const rows = data.data.slice(1);

    const orders = rows
      .map((row) => {
        const obj = {};
        sheetHeaders.forEach((h, i) => (obj[h] = row[i]));
        return obj;
      })
      .filter((order) => (order.email || '').toLowerCase().trim() === verifiedEmail)
      .map((order) => {
        const filtered = {};
        for (const field of ALLOWED_FIELDS) {
          filtered[field] = order[field] !== undefined ? order[field] : '';
        }
        return filtered;
      });

    return jsonResponse({ success: true, orders });
  } catch (err) {
    return jsonResponse({ error: 'Failed to reach Google Sheet', detail: String(err) }, 502);
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    },
  });
}
