const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COOLDOWN_MS = 60 * 1000;
const DAILY_LIMIT = 5;
const DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;

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

async function verifyTurnstile(request, secret, token, expectedHostname) {
  if (typeof token !== 'string' || token.length === 0 || token.length > 2048) return false;

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
  return (
    result.success === true &&
    result.action === 'contact' &&
    result.hostname === expectedHostname
  );
}

async function rateLimitKey(request) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip)));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function reserveSendSlot(env, request) {
  const id = env.CONTACT_RATE_LIMIT.idFromName(await rateLimitKey(request));
  const limiter = env.CONTACT_RATE_LIMIT.get(id);
  const response = await limiter.fetch('https://contact-rate-limit/reserve', { method: 'POST' });
  return response.json();
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
      const expectedHostname = new URL(allowedOrigin).hostname;
      const isHuman = await verifyTurnstile(
        request,
        env.TURNSTILE_SECRET,
        turnstileToken,
        expectedHostname,
      );

      if (!isHuman) {
        return jsonResponse({ error: 'Verification failed' }, 400, allowedOrigin);
      }

      const rateLimit = await reserveSendSlot(env, request);

      if (!rateLimit.allowed) {
        return jsonResponse(
          { error: 'Rate limit exceeded', retry_after: rateLimit.retryAfter },
          429,
          allowedOrigin,
        );
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

export class ContactRateLimiter {
  constructor(ctx) {
    this.ctx = ctx;
  }

  async fetch() {
    const now = Date.now();
    const events = (await this.ctx.storage.get('send_events')) || [];
    const recentEvents = events.filter((timestamp) => now - timestamp < DAILY_WINDOW_MS);
    const lastSend = recentEvents.at(-1) || 0;

    if (now - lastSend < COOLDOWN_MS) {
      return Response.json({
        allowed: false,
        retryAfter: Math.ceil((lastSend + COOLDOWN_MS - now) / 1000),
      });
    }

    if (recentEvents.length >= DAILY_LIMIT) {
      return Response.json({
        allowed: false,
        retryAfter: Math.ceil((recentEvents[0] + DAILY_WINDOW_MS - now) / 1000),
      });
    }

    recentEvents.push(now);
    await this.ctx.storage.put('send_events', recentEvents);
    await this.ctx.storage.setAlarm(now + DAILY_WINDOW_MS);

    return Response.json({ allowed: true });
  }

  async alarm() {
    await this.ctx.storage.deleteAll();
  }
}
