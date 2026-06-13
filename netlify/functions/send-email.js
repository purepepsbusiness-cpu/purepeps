// netlify/functions/send-email.js
// Sends transactional emails via Resend. Called by the admin panel
// for approve / deny / waitlist actions.
const { requireAdmin } = require('./_verify-helper');

const ALLOWED_TYPES = ['approved', 'denied', 'waitlist'];

exports.handler = async function (event) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  // Must be a logged-in admin
  const auth = requireAdmin(event, headers);
  if (!auth.ok) return auth.response;

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) return { statusCode: 500, headers, body: JSON.stringify({ error: 'RESEND_API_KEY not set' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { type, to, name, order_ref, total, items, payment_method, payment_details } = body;

  if (!ALLOWED_TYPES.includes(type)) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid email type' }) };
  if (!to || !to.includes('@')) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Valid recipient email required' }) };
  if (!order_ref) return { statusCode: 400, headers, body: JSON.stringify({ error: 'order_ref required' }) };

  const firstName = (name || 'there').split(' ')[0];

  let subject, html;

  if (type === 'approved') {
    subject = `Your PurePeps order ${order_ref} has been approved`;
    html = `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
        <div style="background:#1a1a2e;padding:24px 32px;border-radius:8px 8px 0 0">
          <span style="font-size:22px;font-weight:700;color:#fff">Pure<span style="color:#a78bfa">Peps</span></span>
        </div>
        <div style="background:#f9f9f9;padding:32px;border-radius:0 0 8px 8px;border:1px solid #e5e5e5;border-top:none">
          <p style="margin:0 0 16px">Hi ${firstName},</p>
          <p style="margin:0 0 16px">Your order <strong>${order_ref}</strong> has been approved! 🎉</p>
          <div style="background:#fff;border:1px solid #e5e5e5;border-radius:8px;padding:16px;margin-bottom:24px">
            <div style="font-size:13px;color:#666;margin-bottom:8px">Order summary</div>
            <div style="margin-bottom:4px"><strong>Items:</strong> ${items}</div>
            <div><strong>Total:</strong> ${total}</div>
          </div>
          <p style="margin:0 0 8px"><strong>Payment instructions:</strong></p>
          <div style="background:#fff;border:1px solid #e5e5e5;border-radius:8px;padding:16px;margin-bottom:24px;white-space:pre-line;font-size:14px;line-height:1.6">${payment_details}</div>
          <p style="margin:0 0 16px;font-size:13px;color:#666">Once payment is confirmed we will ship within 1–3 business days. Please do not send payment until you have confirmed the details above.</p>
          <p style="margin:0;font-size:13px;color:#666">Questions? Reply to this email or contact <a href="mailto:support@purepeps.com" style="color:#7c3aed">support@purepeps.com</a></p>
          <hr style="margin:24px 0;border:none;border-top:1px solid #e5e5e5">
          <p style="margin:0;font-size:12px;color:#999">PurePeps · For research use only</p>
        </div>
      </div>`;
  } else if (type === 'denied') {
    subject = `Regarding your PurePeps order request ${order_ref}`;
    html = `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
        <div style="background:#1a1a2e;padding:24px 32px;border-radius:8px 8px 0 0">
          <span style="font-size:22px;font-weight:700;color:#fff">Pure<span style="color:#a78bfa">Peps</span></span>
        </div>
        <div style="background:#f9f9f9;padding:32px;border-radius:0 0 8px 8px;border:1px solid #e5e5e5;border-top:none">
          <p style="margin:0 0 16px">Hi ${firstName},</p>
          <p style="margin:0 0 16px">Unfortunately we are unable to fulfill your order request <strong>${order_ref}</strong> at this time.</p>
          <p style="margin:0 0 16px">Thank you for your interest in PurePeps.</p>
          <p style="margin:0;font-size:13px;color:#666">Questions? Contact <a href="mailto:support@purepeps.com" style="color:#7c3aed">support@purepeps.com</a></p>
          <hr style="margin:24px 0;border:none;border-top:1px solid #e5e5e5">
          <p style="margin:0;font-size:12px;color:#999">PurePeps · For research use only</p>
        </div>
      </div>`;
  } else if (type === 'waitlist') {
    subject = `Your PurePeps order ${order_ref} — Waitlist`;
    html = `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
        <div style="background:#1a1a2e;padding:24px 32px;border-radius:8px 8px 0 0">
          <span style="font-size:22px;font-weight:700;color:#fff">Pure<span style="color:#a78bfa">Peps</span></span>
        </div>
        <div style="background:#f9f9f9;padding:32px;border-radius:0 0 8px 8px;border:1px solid #e5e5e5;border-top:none">
          <p style="margin:0 0 16px">Hi ${firstName},</p>
          <p style="margin:0 0 16px">Thank you for your order request <strong>${order_ref}</strong>.</p>
          <p style="margin:0 0 16px">One or more items in your order are currently out of stock. We've added you to our waitlist and will notify you as soon as stock is available.</p>
          <p style="margin:0;font-size:13px;color:#666">Questions? Contact <a href="mailto:support@purepeps.com" style="color:#7c3aed">support@purepeps.com</a></p>
          <hr style="margin:24px 0;border:none;border-top:1px solid #e5e5e5">
          <p style="margin:0;font-size:12px;color:#999">PurePeps · For research use only</p>
        </div>
      </div>`;
  }

  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'PurePeps <onboarding@resend.dev>',
        to: [to],
        subject,
        html,
      }),
    });

    const data = await resp.json();
    if (!resp.ok) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Resend error', detail: data }) };
    }
    return { statusCode: 200, headers, body: JSON.stringify({ success: true, id: data.id }) };
  } catch (err) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Failed to send email', detail: String(err) }) };
  }
};
