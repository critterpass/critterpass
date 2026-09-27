# PowerSync Service for the S-SYNC spike's own Railway deployment. Same shape as
# infra/railway/powersync.Dockerfile (one image, PS_ROLE=sync|api) but bakes in the spike's own
# config (tools/spikes/src/s-sync/config/service.yaml) instead of the shared, untouched
# infra/powersync/service.yaml — that file has no stream defined yet (real tables join it in
# phase 10). Build context: repository root.
FROM journeyapps/powersync-service:1.26.1
COPY tools/spikes/src/s-sync/config/service.yaml /config/service.yaml
ENV POWERSYNC_CONFIG_PATH=/config/service.yaml
ENTRYPOINT ["sh", "-c", "exec node service/lib/entry.js start -r \"${PS_ROLE:-unified}\""]
