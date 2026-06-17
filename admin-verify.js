import { extractToken, verifyToken, jsonResponse } from './_verify-helper.js';

export async function onRequestPost({ request, env }) {
  const ADMIN_SECRET = env.ADMIN_SECRET;
  if (!ADMIN_SECRET) {
    return jsonResponse({ valid: false, error: 'Server misconfigured: ADMIN_SECRET not set' }, 500);
  }

  const token = extractToken(request);
  if (!token) {
    return jsonResponse({ valid: false, error: 'No token provided' }, 401);
  }

  const result = verifyToken(token, ADMIN_SECRET);
  if (!result.valid) {
    return jsonResponse(result, 401);
  }

  return jsonResponse({ valid: true, email: result.email, expiresAt: result.exp * 1000 });
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
