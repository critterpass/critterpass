# PowerSync Service for Railway. One image, two services: PS_ROLE=sync (replication, exactly one instance)
# and PS_ROLE=api (client sync endpoints, scaled out). Values come from PS_* variables.
# Build context: repository root.
FROM journeyapps/powersync-service:1.26.1
COPY infra/powersync/service.yaml /config/service.yaml
ENV POWERSYNC_CONFIG_PATH=/config/service.yaml
ENTRYPOINT ["sh", "-c", "exec node service/lib/entry.js start -r \"${PS_ROLE:-unified}\""]
