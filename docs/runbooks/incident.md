# Incident

For anything that took a core flow down for over 30 minutes, lost or exposed data, or touched money.

## During

1. Note the start time (`date -u`), the alert and what users see.
2. Mitigate first, investigate second: roll back the service in Railway (previous deployment →
   Redeploy), republish the previous app update with EAS Update (`eas update:republish`), halt a staged store
   rollout, or switch the feature off in the ops console.
3. Data exposure or loss: stop the cause, then preserve evidence (logs, the rows involved, a
   PlanetScale branch from just before) before cleaning up.
4. Keep a timeline in the incident note as you go; times in UTC and SGT.

## After

Write `docs/runbooks/incidents/<UTC date>-<what>.md` within two days:

| Section | Content |
|---|---|
| Summary | what broke, for whom, how long |
| Timeline | detection, mitigation, recovery |
| Cause | the proven cause, not a guess |
| Fix | commits and config changes |
| Follow-ups | alerts or tests that would have caught it sooner |

Personal data breach (users' personal data exposed): the founder decides within 72 hours whether
the data protection authority and the affected users must be told (GDPR art. 33–34, Singapore
PDPA). Store refunds for a purchase failure: RevenueCat → customer → grant or refund, with a note.
