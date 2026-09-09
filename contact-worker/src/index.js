const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

function jsonResponse(body, status, origin) {
  return Response.json(body, {
    status,
    headers: corsHeaders(origin),
  });
}

function escapeHtml(value) {
  const entities = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };

  return value.replace(/[&<>"']/g, (character) => entities[character]);
}

async function verifyTurnstile(request, secret, token) {
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      secret,
      response: token,
      remoteip: request.headers.get('CF-Connecting-IP') || '',
    }),
  });

  if (!response.ok) return false;

  const result = await response.json();
  return result.success === true;
}

async function deliverMessage(env, { name, email, message }) {
  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);
  const safeMessage = escapeHtml(message).replace(/\n/g, '<br>');

  return fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.FROM_EMAIL,
      to: [env.RECIPIENT_EMAIL],
      reply_to: email,
      subject: `Portfolio message from ${name}`,
      html: `<h2>New portfolio message</h2><p><strong>From:</strong> ${safeName} &lt;${safeEmail}&gt;</p><hr><p>${safeMessage}</p>`,
      text: `From: ${name} <${email}>\n\n${message}`,
    }),
  });
}

export default {
  async fetch(request, env) {
    const allowedOrigin = env.ALLOWED_ORIGIN;
    const requestOrigin = request.headers.get('Origin');

    if (requestOrigin !== allowedOrigin) {
      return jsonResponse({ error: 'Forbidden' }, 403, allowedOrigin);
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(allowedOrigin) });
    }

    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, 405, allowedOrigin);
    }

    let data;

    try {
      data = await request.json();
    } catch {
      return jsonResponse({ error: 'Invalid request' }, 400, allowedOrigin);
    }

    const name = typeof data.name === 'string' ? data.name.trim() : '';
    const email = typeof data.email === 'string' ? data.email.trim() : '';
    const message = typeof data.message === 'string' ? data.message.trim() : '';
    const turnstileToken = typeof data.turnstileToken === 'string' ? data.turnstileToken : '';
    const isInvalid =
      data.website ||
      !name ||
      !message ||
      name.length > 100 ||
      message.length > 1000 ||
      !EMAIL_PATTERN.test(email);

    if (isInvalid) {
      return jsonResponse({ error: 'Invalid form data' }, 400, allowedOrigin);
    }

    try {
      const isHuman = await verifyTurnstile(request, env.TURNSTILE_SECRET, turnstileToken);

      if (!isHuman) {
        return jsonResponse({ error: 'Verification failed' }, 400, allowedOrigin);
      }

      const delivery = await deliverMessage(env, { name, email, message });

      if (!delivery.ok) {
        return jsonResponse({ error: 'Delivery failed' }, 502, allowedOrigin);
      }
    } catch {
      return jsonResponse({ error: 'Service unavailable' }, 503, allowedOrigin);
    }

    return jsonResponse({ ok: true }, 200, allowedOrigin);
  },
};
