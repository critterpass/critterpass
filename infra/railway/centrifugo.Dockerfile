# Centrifugo for Railway: the shared config is baked in; per-environment values come from CENTRIFUGO_* variables.
# Build context: repository root.
FROM centrifugo/centrifugo:v6.9.6
COPY infra/centrifugo/config.json /centrifugo/config.json
# The upstream image already runs as its unprivileged `centrifugo` user (uid 1000); stated here so a
# base image change cannot silently make the server root. The config is root-owned and world-readable.
USER centrifugo
CMD ["centrifugo", "--config=/centrifugo/config.json"]
