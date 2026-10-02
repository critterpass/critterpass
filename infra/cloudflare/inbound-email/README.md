# Inbound email (crew forward addresses)

Every crew has `{crew}@in.critterpass.app` (issued when the crew is created, rotated by an
organiser). Mail sent there reaches this Cloudflare Email Worker, which:

1. bounces it with a friendly reply when `IMPORTS_MAIL_ENABLED` is not `true`, the domain is not
   ours or the message is over 10 MB;
2. stores the raw message in R2 under `inbound/{date}/{id}.eml` (deleted after 7 days by the bucket's
   lifecycle rule);
3. posts signed metadata (address, sender, Message-ID, size, R2 key, DKIM/SPF verdicts; never the
   body) to `POST {API_BASE_URL}/webhooks/inbound-email` with `x-cp-timestamp` and
   `x-cp-signature = HMAC-SHA256(secret, "{timestamp}.{body}")`;
4. sends the api's "Link this email?" reply (a 6-digit code) when the sender is not yet linked, and
   reports whether Cloudflare sent it (`sent`) or refused it (`failed`) to
   `POST {API_BASE_URL}/webhooks/inbound-email/reply`, signed the same way. The app asks the crew
   for a code only after `sent`; a refused reply clears the code.

Workers Logs is on (`[observability]`, per env): every crew message logs one JSON line with its
outcome and the DKIM/SPF/DMARC verdicts Cloudflare stamped, and a link-code reply logs whether it
went out or Cloudflare's refusal (addresses removed). Addresses, subjects, bodies and codes are
never logged. Read them in the dashboard under Workers → `cp-inbound-email` → Logs.

The api decides: a crew member's verified sign-in email (or their Apple private relay address, or a
sender they linked with a code) is accepted and parsed; anything else is quarantined.

## Switching it on

| Step                                                                | Who             | How                                                                            |
| ------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------ |
| R2 buckets `cp-inbound-mail-staging`, `cp-inbound-mail-prod`        | infra           | dashboard or `wrangler r2 bucket create`                                       |
| Worker secret `INBOUND_EMAIL_HMAC_SECRET` (32+ random bytes)        | infra           | `wrangler secret put INBOUND_EMAIL_HMAC_SECRET --env <env>`                    |
| Worker secret `FORWARD_OTHER_MAIL_TO`: the catch-all's old target   | infra           | copied from the zone's catch-all rule before it is switched                    |
| Same secret + `INBOUND_SENDER_PEPPER` on the api                    | infra           | Railway variables (`api` service)                                              |
| Deploy the Worker                                                   | infra           | `pnpm --filter @cp/inbound-email exec wrangler deploy --env <env>`             |
| Email Routing DNS for `in.`, catch-all → Worker, 7-day R2 lifecycle | founder / infra | `scripts/configure-routing.ts --env <env>` prints the plan; `--apply` sends it |

Until routing is on, imports still work through paste and scan in the app.

The catch-all is one rule for the whole `critterpass.app` zone, so every address without its own
rule reaches this Worker, `alert@` included. The Worker forwards anything outside `INBOUND_DOMAIN`
to `FORWARD_OTHER_MAIL_TO` unchanged, so switching the catch-all never changes where that mail
goes. The zone has one catch-all, so it can point at one Worker: before production routing is
applied, that Worker has to serve both `in.` and `in.staging.`, or staging moves to its own zone.
