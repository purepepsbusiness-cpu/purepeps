// netlify/functions/_verify-helper.js
const crypto = require('crypto');

function verifyToken(token, secret) {
  if (!token || typeof token !== 'string' || !token.includes('.')) {
    return { valid: false, error: 'Malformed token' };
  }

  const [payloadB64, sig] = token.split('.');
  if (!payloadB64 || !sig) {
    return { valid: false, error: 'Malformed token' };
  }

  const expectedSig = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');

  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return { valid: false, error: 'Invalid signature' };
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch (e) {
    return { valid: false, error: 'Malformed payload' };
  }

  if (!payload.exp || typeof payload.exp !== 'number') {
    return { valid: false, error: 'Missing expiry' };
  }

  const now = Math.floor(Date.now() / 1000);
  if (now >= payload.exp) {
    return { valid: false, error: 'Token expired' };
  }

  if (!payload.email) {
    return { valid: false, error: 'Missing email in token' };
  }

  return { valid: true, email: payload.email, iat: payload.iat, exp: payload.exp };
}

function extractToken(event) {
  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  try {
    const body = JSON.parse(event.body || '{}');
    if (body.token) return body.token;
  } catch (e) {
    /* ignore */
  }
  return null;
}

function requireAdmin(event, headers) {
  const ADMIN_SECRET = process.env.ADMIN_SECRET;
  if (!ADMIN_SECRET) {
    return {
      ok: false,
      response: {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Server misconfigured: ADMIN_SECRET not set' }),
      },
    };
  }

  const token = extractToken(event);
  if (!token) {
    return {
      ok: false,
      response: { statusCode: 401, headers, body: JSON.stringify({ error: 'No token provided' }) },
    };
  }

  const result = verifyToken(token, ADMIN_SECRET);
  if (!result.valid) {
    return {
      ok: false,
      response: { statusCode: 401, headers, body: JSON.stringify({ error: result.error || 'Invalid token' }) },
    };
  }

  return { ok: true, email: result.email };
}

module.exports = { verifyToken, extractToken, requireAdmin };
