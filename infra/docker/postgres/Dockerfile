# Local and test Postgres: same major (18) and extension set as PlanetScale production
# (PlanetScale staging lists postgis 3.6.4 + postgis_topology in pg_available_extensions).
FROM pgvector/pgvector:0.8.6-pg18-trixie
RUN apt-get update \
    && apt-get install -y --no-install-recommends postgresql-18-postgis-3 \
    && rm -rf /var/lib/apt/lists/*
COPY postgresql.conf /etc/postgresql/postgresql.conf
COPY init.sql /docker-entrypoint-initdb.d/00-init.sql
CMD ["postgres", "-c", "config_file=/etc/postgresql/postgresql.conf"]
