# Auth error spike (P1)

**Signal:** over 20 % of api requests answer 401, 403 or 429 for 5 minutes (rule `cp-p1-auth-error-spike`).

**Likely causes:** JWT signing keys rotated without clients refreshing; Better Auth or JWKS misconfiguration after a deploy; attestation enforcement switched on; a credential-stuffing or OTP-abuse wave hitting rate limits.

**Checks**
1. Grafana → *CritterPass / Service health*: requests by status; which began first, 401 or 429.
2. api logs: `attestation check failed`, rate-limit rule names, auth errors by path.
3. Did a deploy or env change (auth secrets, `ATTESTATION_MODE`) just land?

**Mitigation:** roll back the deploy or the variable change. For abuse, tighten the matching rate-limit rule and block abusive ranges at the edge; keep OTP sends capped (see sms-spend-spike).

**Rollback:** previous deployment in Railway; restore the prior variable values.
