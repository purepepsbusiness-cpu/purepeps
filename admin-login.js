import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { recordLoginAttempt, checkLockout, getClientIp } from './_lockout-helper.js';
import { jsonResponse } from './_verify-helper.js';

const TOKEN_LIFETIME_SECONDS = 8 * 60 * 60;

function sha256Hex(input) {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

function getAdminAccounts(env) {
  const accounts = [];
  for (let i = 1; i <= 5; i++) {
    const email = env[`ADMIN_EMAIL_${i}`];
    const hash = env[`ADMIN_PASSWORD_HASH_${i}`];
    if (email && hash) accounts.push({ email: email.toLowerCase().trim(), hash: hash.toLowerCase().trim() });
  }
  return accounts;
}

function signToken(payload, secret) {
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', secret).update(payloadB64).digest('base64url');
  return `${payloadB64}.${sig}`;
}

function safeHashEquals(a, b) {
  if (b.length !== 64 || a.length !== 64) return false;
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch (e) {
    return false;
  }
}

export async function onRequestPost({ request, env }) {
  const ADMIN_SECRET = env.ADMIN_SECRET;
  if (!ADMIN_SECRET) return jsonResponse({ error: 'Server misconfigured: ADMIN_SECRET not set' }, 500);

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const email = (body.email || '').toLowerCase().trim();
  const password = body.password || '';
  if (!email || !password) return jsonResponse({ error: 'Email and password required' }, 400);

  const accounts = getAdminAccounts(env);
  if (accounts.length === 0) return jsonResponse({ error: 'Server misconfigured: no admin accounts configured' }, 500);

  const SHEET_API_URL = env.SHEET_API_URL;
  const ip = getClientIp(request);

  if (SHEET_API_URL) {
    const lockout = await checkLockout(SHEET_API_URL, email);
    if (lockout.lockedOut) {
      const retryMinutes = Math.ceil((lockout.retryAfterMs || 0) / 60000);
      return jsonResponse(
        { error: `Too many failed attempts. Try again in ${retryMinutes} minute${retryMinutes === 1 ? '' : 's'}.`, retryAfterMs: lockout.retryAfterMs },
        429
      );
    }
  }

  const candidateHash = sha256Hex(password);
  let matched = null;
  for (const acct of accounts) {
    if (safeHashEquals(candidateHash, acct.hash) && acct.email === email) matched = acct;
  }

  if (SHEET_API_URL) await recordLoginAttempt(SHEET_API_URL, email, !!matched, ip);
  if (!matched) return jsonResponse({ error: 'Invalid email or password' }, 401);

  const now = Math.floor(Date.now() / 1000);
  const payload = { email: matched.email, iat: now, exp: now + TOKEN_LIFETIME_SECONDS };
  const token = signToken(payload, ADMIN_SECRET);

  return jsonResponse({ token, email: matched.email, expiresAt: payload.exp * 1000 });
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
