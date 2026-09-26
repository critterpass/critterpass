# Centrifugo for Railway: the shared config is baked in; per-environment values come from CENTRIFUGO_* variables.
# Build context: repository root.
FROM centrifugo/centrifugo:v6.9.6
COPY infra/centrifugo/config.json /centrifugo/config.json
CMD ["centrifugo", "--config=/centrifugo/config.json"]
