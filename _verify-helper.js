import { createHmac, timingSafeEqual } from 'node:crypto';

function verifyToken(token, secret) {
  if (!token || typeof token !== 'string' || !token.includes('.')) {
    return { valid: false, error: 'Malformed token' };
  }

  const [payloadB64, sig] = token.split('.');
  if (!payloadB64 || !sig) {
    return { valid: false, error: 'Malformed token' };
  }

  const expectedSig = createHmac('sha256', secret).update(payloadB64).digest('base64url');

  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
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

function extractToken(request) {
  const authHeader = request.headers.get('authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  return null;
}

function requireAdmin(request, env) {
  const ADMIN_SECRET = env.ADMIN_SECRET;
  if (!ADMIN_SECRET) {
    return {
      ok: false,
      response: jsonResponse({ error: 'Server misconfigured: ADMIN_SECRET not set' }, 500),
    };
  }

  const token = extractToken(request);
  if (!token) {
    return {
      ok: false,
      response: jsonResponse({ error: 'No token provided' }, 401),
    };
  }

  const result = verifyToken(token, ADMIN_SECRET);
  if (!result.valid) {
    return {
      ok: false,
      response: jsonResponse({ error: result.error || 'Invalid token' }, 401),
    };
  }

  return { ok: true, email: result.email };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    },
  });
}

export { verifyToken, extractToken, requireAdmin, jsonResponse };
