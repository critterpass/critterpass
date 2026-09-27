# Uptime check failing (P1)

**Signal:** an external Synthetic Monitoring check (sync liveness, realtime websocket, web home or the signed media probe) fails from every probe for 3 minutes (rule `cp-p1-uptime-check-failed`; the api has its own rule).

**Likely causes:** the service is down or redeploying; DNS or certificate problems on a custom domain; Cloudflare Worker errors (web, media); the media probe object or its signature expired.

**Checks**
1. Grafana → Synthetic Monitoring: which job fails, from which probes, with which status code.
2. For `sync`: Railway `powersync-api` health; for `rt`: Railway `centrifugo`; for `web` and `media`: Cloudflare dashboard → Workers logs.
3. For `media-probe` returning 403: the probe URL is signed at apply time; rerun `pnpm tsx tools/scripts/grafana-apply.ts --env <env>`.

**Mitigation:** roll back the failing service; for DNS or certificates, check the custom domain status in Railway or Cloudflare.

**Rollback:** previous deployment of the failing service.
