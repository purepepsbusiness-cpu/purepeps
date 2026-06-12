// netlify/functions/admin-verify.js
const { extractToken, verifyToken } = require('./_verify-helper');

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

  const ADMIN_SECRET = process.env.ADMIN_SECRET;
  if (!ADMIN_SECRET) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ valid: false, error: 'Server misconfigured: ADMIN_SECRET not set' }),
    };
  }

  const token = extractToken(event);
  if (!token) {
    return { statusCode: 401, headers, body: JSON.stringify({ valid: false, error: 'No token provided' }) };
  }

  const result = verifyToken(token, ADMIN_SECRET);

  if (!result.valid) {
    return { statusCode: 401, headers, body: JSON.stringify(result) };
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      valid: true,
      email: result.email,
      expiresAt: result.exp * 1000,
    }),
  };
};
