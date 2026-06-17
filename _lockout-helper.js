const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;

async function recordLoginAttempt(sheetApiUrl, email, success, ip) {
  try {
    await fetch(sheetApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'record_login_attempt',
        email,
        success,
        ip: ip || 'unknown',
        timestamp: new Date().toISOString(),
      }),
    });
  } catch (e) {
    console.warn('recordLoginAttempt failed:', e.message);
  }
}

async function checkLockout(sheetApiUrl, email) {
  try {
    const since = new Date(Date.now() - LOCKOUT_WINDOW_MS).toISOString();
    const url = `${sheetApiUrl}?type=login_attempts&email=${encodeURIComponent(email)}&since=${encodeURIComponent(since)}`;
    const resp = await fetch(url, { method: 'GET' });
    if (!resp.ok) return { lockedOut: false };

    const data = await resp.json();
    if (!data || !Array.isArray(data.attempts)) return { lockedOut: false };

    const recentFailures = data.attempts.filter((a) => a.success === false);
    if (recentFailures.length < LOCKOUT_THRESHOLD) return { lockedOut: false };

    const oldestFailure = recentFailures
      .map((a) => new Date(a.timestamp).getTime())
      .sort((a, b) => a - b)[0];
    const retryAfterMs = Math.max(0, oldestFailure + LOCKOUT_WINDOW_MS - Date.now());

    return { lockedOut: true, retryAfterMs };
  } catch (e) {
    console.warn('checkLockout failed (failing open):', e.message);
    return { lockedOut: false };
  }
}

function getClientIp(request) {
  return (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

export { recordLoginAttempt, checkLockout, getClientIp, LOCKOUT_THRESHOLD, LOCKOUT_WINDOW_MS };
