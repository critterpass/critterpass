# SMS spend spike (P1)

**Signal:** more than 500 SMS sent in the last hour (`cp_sms_sent_total`, rule `cp-p1-sms-spend-spike`).

**Likely causes:** SMS pumping (fraudulent OTP requests to premium ranges); a retry loop sending the same OTP repeatedly; a real launch-day surge.

**Checks**
1. Grafana → *CritterPass / Push delivery*: SMS by provider and `country`; a spike in one unusual country is pumping.
2. Prelude console for spend and fraud flags.
3. api logs for OTP sends per device and per IP.

**Mitigation:** remove the abused country from the OTP allow-list, lower the per-IP and per-device OTP limits, and prefer WhatsApp delivery. Enable the provider's fraud guard.

**Rollback:** restore the previous allow-list once traffic is clean.
