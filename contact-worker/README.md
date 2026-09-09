# Contact Worker

Cloudflare Worker for the static contact form. It verifies Turnstile before using Resend to deliver a message. The Proton recipient and credentials stay outside GitHub and the frontend.

## Deploy

1. Create a Turnstile widget for ziyan-cs.com and a Resend API key with a verified sending domain.
2. From this directory, run `npx wrangler login` and then `npx wrangler deploy`.
3. Store `TURNSTILE_SECRET`, `RESEND_API_KEY`, `FROM_EMAIL`, and `RECIPIENT_EMAIL` with `npx wrangler secret put NAME`.
4. Connect the deployed Worker URL and public Turnstile site key to the contact form before enabling submission.

The Worker accepts only browser requests from https://ziyan-cs.com. Change ALLOWED_ORIGIN deliberately if preview deployment is needed.
