# Contact Worker

The contact form's server-side boundary. It accepts requests only from `https://ziyan-cs.com`, verifies a single-use Turnstile token for the `contact` action, and then delivers the existing message payload. Rate-limit state is stored as timestamp-only entries in a Durable Object keyed by a one-way hash of the visitor IP.

## What is already wired

- Turnstile site key: `0x4AAAAAAEu_DepuiljC3A2A`
- Form action: `contact`
- Production hostname expected by the Worker: `ziyan-cs.com`
- Worker name: `ziyan-cs-contact`

The site key is intentionally public. `TURNSTILE_SECRET`, `RESEND_API_KEY`, sender, and recipient are never committed or served to browsers.

## Complete the first deployment

1. Deploy this Worker using your normal Cloudflare-authenticated Wrangler installation. Record the HTTPS URL that Wrangler prints.
2. Set that exact URL as `endpoint` in `../assets/js/contact-worker-config.js`, then deploy the static site. Until an endpoint is set, the existing EmailJS path remains active as a temporary fallback.
3. Before retrieving the Turnstile secret from the existing widget, use Wrangler 4.109+ outside this repository and confirm its account is the one that owns the widget and Worker.
4. Store these secrets in the deployed Worker secret store, never in a local JavaScript or `.env` file:

   - `TURNSTILE_SECRET`
   - `RESEND_API_KEY`

   Keep the non-sensitive `FROM_EMAIL` and `RECIPIENT_EMAIL` values in `[vars]` in `wrangler.toml`.

5. Make one real submission from `https://ziyan-cs.com`, then attempt to replay the same Turnstile token. The first must work; the replay must be rejected.
6. Once the Worker path is confirmed live, remove the EmailJS fallback and its public configuration in a separate deploy.

## Expected environment

`ALLOWED_ORIGIN` is intentionally a public Worker variable. Keep it at the production origin; do not add localhost to this production Worker. The existing Turnstile widget may permit local development separately, but production validation must only accept `ziyan-cs.com`. Keep `send.ziyan-cs.com` for Resend's Return-Path DNS records, not as a custom domain for this Worker.
