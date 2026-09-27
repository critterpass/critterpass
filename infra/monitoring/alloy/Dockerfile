# Grafana Alloy collector for Railway (infra/monitoring/alloy/railway.json).
FROM grafana/alloy:v1.20.0
COPY infra/monitoring/alloy/config.alloy /etc/alloy/config.alloy
COPY infra/monitoring/postgres-queries.yaml /etc/alloy/postgres-queries.yaml
# Private-network collector: the UI listens on Railway's private interface only.
CMD ["run", "--server.http.listen-addr=0.0.0.0:12345", "--storage.path=/var/lib/alloy/data", "/etc/alloy/config.alloy"]
