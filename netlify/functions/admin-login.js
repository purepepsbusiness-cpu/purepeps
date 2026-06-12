// netlify/functions/admin-login.js
const crypto = require('crypto');
const { recordLoginAttempt, checkLockout, getClientIp } = require('./_lockout-helper');

const TOKEN_LIFETIME_SECONDS = 8 * 60 * 60;

function sha256Hex(input) {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

function getAdminAccounts() {
  const accounts = [];
  for (let i = 1; i <= 5; i++) {
    const email = process.env[`ADMIN_EMAIL_${i}`];
    const hash = process.env[`ADMIN_PASSWORD_HASH_${i}`];
    if (email && hash) {
      accounts.push({ email: email.toLowerCase().trim(), hash: hash.toLowerCase().trim() });
    }
  }
  return accounts;
}

function signToken(payload, secret) {
  const payloadStr = JSON.stringify(payload);
  const payloadB64 = Buffer.from(payloadStr).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
  return `${payloadB64}.${sig}`;
}

function safeHashEquals(candidateHex, storedHex) {
  if (storedHex.length !== 64 || candidateHex.length !== 64) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(candidateHex, 'hex'), Buffer.from(storedHex, 'hex'));
  } catch (e) {
    return false;
  }
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

  const ADMIN_SECRET = process.env.ADMIN_SECRET;
  if (!ADMIN_SECRET) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Server misconfigured: ADMIN_SECRET not set' }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const email = (body.email || '').toLowerCase().trim();
  const password = body.password || '';

  if (!email || !password) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Email and password required' }) };
  }

  const accounts = getAdminAccounts();
  if (accounts.length === 0) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Server misconfigured: no admin accounts configured' }),
    };
  }

  const SHEET_API_URL = process.env.SHEET_API_URL;
  const ip = getClientIp(event);

  if (SHEET_API_URL) {
    const lockout = await checkLockout(SHEET_API_URL, email);
    if (lockout.lockedOut) {
      const retryMinutes = Math.ceil((lockout.retryAfterMs || 0) / 60000);
      return {
        statusCode: 429,
        headers,
        body: JSON.stringify({
          error: `Too many failed attempts. Try again in ${retryMinutes} minute${retryMinutes === 1 ? '' : 's'}.`,
          retryAfterMs: lockout.retryAfterMs,
        }),
      };
    }
  }

  const candidateHash = sha256Hex(password);

  let matched = null;
  for (const acct of accounts) {
    const hashOk = safeHashEquals(candidateHash, acct.hash);
    const emailOk = acct.email === email;
    if (hashOk && emailOk) matched = acct;
  }

  if (SHEET_API_URL) {
    await recordLoginAttempt(SHEET_API_URL, email, !!matched, ip);
  }

  if (!matched) {
    return { statusCode:
